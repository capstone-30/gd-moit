import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pool,transaction} from '../lib/db';
import {handle} from '../lib/controllers/api';
import {hash,csrfFor} from '../lib/security';
import {cleanup,deliverDeletions} from '../lib/models/retention';
const database=process.env.DATABASE_URL;
const enabled=Boolean(database && new URL(database).pathname.endsWith('_test'));
if(process.env.CI) assert.ok(enabled,'CI requires DATABASE_URL with a database name ending in _test');
const mailDir=enabled?await mkdtemp(join(tmpdir(),'moit-test-mail-')):undefined;
process.env.AUTH_SECRET='integration-secret-longer-than-thirty-two-characters';
process.env.APP_ORIGIN='http://localhost:3000';
if(mailDir) process.env.TEST_MAIL_DIR=mailDir;
process.env.DELETION_DELIVERY_URL='http://127.0.0.1:1/deletions';
process.env.DELETION_DELIVERY_TOKEN='synthetic-test-token';
const school=randomUUID(),term=randomUUID(),place=randomUUID();
const users=Array.from({length:7},(_,i)=>({id:randomUUID(),raw:`test-session-${i}`,school_id:school}));
const today=new Date().toISOString().slice(0,10), weekday=new Date(`${today}T00:00:00Z`).getUTCDay()||7,slot=weekday*100+1,other=weekday*100+2;
async function request(path:string,method='GET',user=users[0],body?:unknown,headers:Record<string,string>={}) {
  const r=await handle(new Request(`http://localhost:3000/api/v1/${path}`,{method,headers:{cookie:`moit_session=${user.raw}`,origin:process.env.APP_ORIGIN!, 'x-csrf-token':csrfFor(user.raw),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}));
  return {status:r.status,body:[204,405].includes(r.status)?null:r.headers.get('content-type')?.startsWith('text/csv')?await r.text():await r.json(),headers:r.headers};
}
async function create(user=users[0],capacity=3,topic='test') {
  const r=await request('meetings','POST',user,{termId:term,placeId:place,topic,type:'study',capacity,...(capacity===2?{twoPersonAcknowledged:true}:{})});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.data.id as string;
}
async function availability(user:typeof users[number],slots:number[]) {const r=await request(`me/availability/${term}`,'PUT',user,{slots});assert.equal(r.status,200,JSON.stringify(r.body));}
async function fixture() {
  await pool.query('TRUNCATE schools CASCADE');await pool.query('TRUNCATE auth_limits,deletion_outbox');
  await pool.query("INSERT INTO schools(id,name,timezone,departments,entry_years) VALUES($1,'Synthetic school','UTC',ARRAY['test'],ARRAY[2026])",[school]);
  await pool.query("INSERT INTO school_domains(domain,school_id) VALUES('school.example',$1)",[school]);
  await pool.query("INSERT INTO terms(id,school_id,name,starts_on,ends_on) VALUES($1,$2,'Synthetic term',current_date-1,current_date+60)",[term,school]);
  await pool.query("INSERT INTO term_slots(term_id,slot_code,starts_at,ends_at) VALUES($1,$2,'10:00','11:00'),($1,$3,'11:00','12:00')",[term,slot,other]);
  await pool.query("INSERT INTO places(id,school_id,name) VALUES($1,$2,'Synthetic public place')",[place,school]);
  await pool.query(`INSERT INTO app_settings(id,school_id,current_term_id,registration_open,service_ends_on,privacy_version,privacy_notice,launch_verified_at)
    VALUES(1,$1,$2,true,current_date+90,'test-v1',$3,now())`,[school,term,JSON.stringify(Object.fromEntries(['operatorContact','responsibleContact','processors','mailRoute','deletionInstructions','cookies','items','purposes','retention'].map(k=>[k,'synthetic only'])))]);
  for(const [i,u] of users.entries()) {
    await pool.query("INSERT INTO users(id,school_id,email,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,'test-v1',now())",[u.id,school,`user${i}@school.example`]);
    await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[u.id,hash(u.raw)]);
    await pool.query('INSERT INTO availability(user_id,term_id,slots) VALUES($1,$2,$3)',[u.id,term,[slot]]);
  }
}
test('실제 PostgreSQL REST 계약·동시성·삭제', {skip:!enabled}, async t=>{
  try {
    await fixture();
    await t.test('학기 시간 조회·최초 저장·동일값 재저장은 등록 상태와 수정 시각을 보존',async()=>{
      const user=users[6],path=`me/availability/${term}`;
      await pool.query('DELETE FROM availability WHERE user_id=$1 AND term_id=$2',[user.id,term]);
      assert.deepEqual((await request(path,'GET',user)).body.data,{termId:term,registered:false,slots:[],updatedAt:null});
      const saved=await request(path,'PUT',user,{slots:[]});
      assert.equal(saved.status,200);
      assert.deepEqual(saved.body.data,{termId:term,registered:true,slots:[],updatedAt:saved.body.data.updatedAt});
      assert.ok(saved.body.data.updatedAt);
      assert.deepEqual((await request(path,'GET',user)).body.data,saved.body.data);
      assert.deepEqual((await request(path,'PUT',user,{slots:[]})).body.data,saved.body.data);
      const updated=await request(path,'PUT',user,{slots:[slot]});
      assert.equal(updated.status,200);
      assert.deepEqual(updated.body.data.slots,[slot]);
      assert.deepEqual((await request(path,'GET',user)).body.data,updated.body.data);
    });
    await t.test('계정 유형은 운영자 감사 후 지정·세션 폐기하고 담당자의 학생 API 접근을 차단',async()=>{
      const target=users[5];let auditOk=false;
      const events:Record<string,unknown>[]=[];
      const receiver=createServer((req,res)=>{
        let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{
          events.push(JSON.parse(body));res.writeHead(auditOk?204:503);res.end();
        });
      });
      await new Promise<void>(resolve=>receiver.listen(0,'127.0.0.1',resolve));
      const address=receiver.address();assert.ok(address && typeof address!=='string');
      const env={...process.env,OPERATOR_ID:'synthetic-operator',AUDIT_DELIVERY_URL:`http://127.0.0.1:${address.port}`,AUDIT_DELIVERY_TOKEN:'synthetic-audit'};
      const run=(role:string)=>promisify(execFile)(process.execPath,['--conditions=react-server','--import','tsx','backend/scripts/account-role.ts',target.id,role,'synthetic role review'],{env});
      try {
        assert.equal((await request('me','PATCH',target,{role:'institution'})).status,400);
        await assert.rejects(run('institution'));
        assert.equal((await request('me','GET',target)).body.data.role,'student');
        auditOk=true;await run('institution');
        assert.equal((await request('me','GET',target)).status,401);
        await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[target.id,hash(target.raw)]);
        assert.equal((await request('me','GET',target)).body.data.role,'institution');
        for(const [path,method,body] of [['meetings','GET',undefined],['meetings','POST',{}],['me/availability','GET',undefined],['me','PATCH',{}],['reports','POST',{}],['me/blocks','GET',undefined]] as const) {
          assert.equal((await request(path,method,target,body)).status,403);
        }
        assert.equal(events.at(-1)?.action,'account.role.institution');
        assert.equal(JSON.stringify(events).includes('@school.example'),false);
        await run('student');
        assert.equal((await request('me','GET',target)).status,401);
        await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[target.id,hash(target.raw)]);
        assert.equal((await request('me','GET',target)).body.data.role,'student');
      } finally {await new Promise<void>(resolve=>receiver.close(()=>resolve()));}
    });
    await t.test('프로젝트별 일괄 생성·전체 롤백·담당자 격리·만료·탈퇴',async()=>{
      async function staffAccount() {
        const u={id:randomUUID(),raw:randomUUID(),school_id:school};
        await pool.query("INSERT INTO users(id,school_id,email,role,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,'institution','test-v1',now())",[u.id,school,`${u.id}@school.example`]);
        await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[u.id,hash(u.raw)]);return u;
      }
      const staff=await staffAccount(),otherStaff=await staffAccount();
      const meeting={title:'첫 모임',studentEmails:['user0@school.example','user1@school.example']};
      assert.equal((await request('hosted-projects','POST',users[0],{title:'프로젝트'})).status,403);
      assert.equal((await request('hosted-projects','GET',users[0])).status,403);
      assert.equal((await request('hosted-projects','POST',staff,{title:'프로젝트'},{'x-csrf-token':'bad'})).status,403);
      const created=await request('hosted-projects','POST',staff,{title:'프로젝트'});assert.equal(created.status,201,JSON.stringify(created.body));
      const project=created.body.data,id=project.id,path=`hosted-projects/${id}/meetings`;
      assert.equal(project.meetingCount,0);
      assert.deepEqual((await request('hosted-projects','GET',otherStaff)).body.data,[]);
      assert.equal((await request(path,'POST',otherStaff,{meetings:[meeting]})).status,404);
      assert.equal((await request(path,'POST',users[0],{meetings:[meeting]})).status,403);
      assert.equal((await request(path,'POST',staff,{meetings:[meeting]},{'x-csrf-token':'bad'})).status,403);
      for(const studentEmails of [['user0@school.example','missing@school.example'],['user0@school.example',`${staff.id}@school.example`]]) {
        assert.equal((await request(path,'POST',staff,{meetings:[meeting,{...meeting,studentEmails}]})).status,422);
        assert.equal((await pool.query('SELECT 1 FROM hosted_meetings WHERE project_id=$1',[id])).rowCount,0);
      }
      const batch=await request(path,'POST',staff,{meetings:[meeting,{...meeting,title:'둘째 모임',studentEmails:['user3@school.example','user2@school.example']}]});
      assert.equal(batch.status,201,JSON.stringify(batch.body));assert.equal(batch.body.data.createdCount,2);
      const ids=batch.body.data.meetings.map((m:{id:string})=>m.id);
      assert.deepEqual(batch.body.data.meetings[1].members.map((m:{userId:string;memberNo:number})=>[m.userId,m.memberNo]),[[users[3].id,1],[users[2].id,2]]);
      assert.ok(batch.body.data.meetings.every((m:{projectId:string;projectTitle:string;date:null})=>m.projectId===id&&m.projectTitle==='프로젝트'&&m.date===null));
      const listed=await request(`hosted-meetings?projectId=${id}`,'GET',staff);
      assert.equal(listed.body.data.length,2);assert.equal((await request('hosted-projects','GET',staff)).body.data[0].meetingCount,2);
      assert.equal((await request(`hosted-meetings?projectId=${id}`,'GET',otherStaff)).status,404);
      assert.equal((await request(`hosted-meetings/${ids[1]}`,'GET',users[0])).status,404);
      const studentDetail=await request(`hosted-meetings/${ids[0]}`,'GET',users[0]);
      assert.equal(studentDetail.body.data.projectTitle,'프로젝트');assert.equal(JSON.stringify(listed.body).includes('@school.example'),false);
      await pool.query("UPDATE hosted_projects SET expires_at=now()+interval '1 day' WHERE id=$1",[id]);
      const capped=await request(path,'POST',staff,{meetings:[meeting]});assert.equal(capped.status,201);
      const projectExpiry=(await pool.query('SELECT expires_at FROM hosted_projects WHERE id=$1',[id])).rows[0].expires_at.toISOString();
      const cappedMeeting=capped.body.data.meetings[0];assert.equal(cappedMeeting.expiresAt,projectExpiry);
      const scheduled=await request(`hosted-meetings/${cappedMeeting.id}/schedule`,'PUT',users[0],{date:today,slot,placeId:place},{'if-match':cappedMeeting.etag});
      assert.equal(scheduled.status,200);assert.equal(scheduled.body.data.expiresAt,projectExpiry);
      const second=await request('hosted-projects','POST',staff,{title:'다른 프로젝트'});
      const secondPath=`hosted-projects/${second.body.data.id}/meetings`;
      const full=await request(secondPath,'POST',staff,{meetings:Array(20).fill({...meeting,title:'한'.repeat(100)})});
      assert.equal(full.status,201);assert.equal(full.body.data.createdCount,20);
      const page=await request(`hosted-meetings?projectId=${id}&limit=1`,'GET',staff);assert.ok(page.body.nextCursor);
      assert.equal((await request(`hosted-meetings?projectId=${id}&limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`,'GET',staff)).body.data.length,1);
      assert.equal((await request(`hosted-meetings?projectId=${second.body.data.id}&cursor=${encodeURIComponent(page.body.nextCursor)}`,'GET',staff)).status,400);
      const projectsPage=await request('hosted-projects?limit=1','GET',staff);assert.ok(projectsPage.body.nextCursor);
      assert.equal((await request(`hosted-projects?limit=1&cursor=${encodeURIComponent(projectsPage.body.nextCursor)}`,'GET',staff)).body.data.length,1);
      await pool.query("UPDATE hosted_projects SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
      assert.equal((await request(path,'POST',staff,{meetings:[meeting]})).status,404);
      assert.equal((await request(`hosted-meetings/${ids[0]}`,'GET',users[0])).status,404);
      assert.equal((await request('hosted-meetings','GET',staff)).body.data.some((m:{projectId:string})=>m.projectId===id),false);
      assert.equal((await request('hosted-projects','GET',staff)).body.data.length,1);
      await transaction(cleanup);
      assert.equal((await pool.query('SELECT 1 FROM hosted_meetings WHERE project_id=$1',[id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM hosted_projects WHERE id=$1',[id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM deletion_outbox WHERE entity_id=$1',[id])).rowCount,1);
      await request('me','DELETE',staff,{confirmDeletion:true});
      assert.equal((await pool.query('SELECT 1 FROM hosted_projects WHERE host_id=$1',[staff.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM hosted_meetings WHERE host_id=$1',[staff.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM deletion_outbox WHERE entity_id=$1',[second.body.data.id])).rowCount,1);
      await request('me','DELETE',otherStaff,{confirmDeletion:true});
    });
    await t.test('대학 주관 모임: 학생 배정·일정 권한/경합·여러 모임 공지·서류·만료/탈퇴 삭제',async()=>{
      async function account(role:'student'|'institution') {
        const u={id:randomUUID(),raw:randomUUID(),school_id:school};
        await pool.query("INSERT INTO users(id,school_id,email,role,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,$4,'test-v1',now())",[u.id,school,`${u.id}@school.example`,role]);
        await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[u.id,hash(u.raw)]);return u;
      }
      const staff=await account('institution'),otherStaff=await account('institution'),student=await account('student');
      const values={title:'주관 모임',studentEmails:[`${student.id}@school.example`,'user1@school.example']};
      const schedule={date:today,slot,placeId:place};
      assert.equal((await request('hosted-meetings','POST',users[0],values)).status,403);
      const created=await request('hosted-meetings','POST',staff,values);assert.equal(created.status,201,JSON.stringify(created.body));
      const id=created.body.data.id,p=`hosted-meetings/${id}`;
      assert.equal(created.body.data.memberCount,2);
      assert.deepEqual(created.body.data.members.map((m:{userId:string;memberNo:number})=>[m.userId,m.memberNo]),[[student.id,1],[users[1].id,2]]);
      assert.equal(created.body.data.canSchedule,false);
      assert.equal((await request(p,'GET',student)).body.data.canSchedule,true);
      assert.equal(created.body.data.date,null);
      assert.equal(created.body.data.canSubmit,false);
      assert.equal((await request(`${p}/documents/me`,'PUT',student,{content:'내용',outcome:'성과',expenses:[]})).status,422);
      const summary={id,title:values.title,date:null,slot:null,place:null,capacity:2,memberCount:2,isMember:false};
      assert.deepEqual((await request('hosted-meetings','GET',staff)).body.data,[{...summary,submittedCount:0}]);
      assert.deepEqual((await request('hosted-meetings','GET',student)).body.data,[{...summary,isMember:true}]);
      assert.equal((await request(p,'GET',otherStaff)).status,404);
      assert.deepEqual((await request('hosted-meetings','GET',otherStaff)).body.data,[]);
      assert.deepEqual((await request('hosted-meetings','GET',users[4])).body.data,[]);
      assert.equal((await request(p,'GET',users[4])).status,404);
      assert.equal((await request(`${p}/members/me`,'PUT',student)).status,405);
      assert.equal((await request(`${p}/schedule`,'PUT',staff,schedule,{'if-match':created.body.data.etag})).status,403);
      assert.equal((await request(`${p}/schedule`,'PUT',users[4],schedule,{'if-match':created.body.data.etag})).status,404);
      assert.equal((await request(`${p}/schedule`,'PUT',student,schedule)).status,412);
      const race=await Promise.all([student,users[1]].map(u=>request(`${p}/schedule`,'PUT',u,schedule,{'if-match':created.body.data.etag})));
      assert.deepEqual(race.map(r=>r.status).sort(),[200,412]);
      const scheduled=race.find(r=>r.status===200)!.body.data;
      assert.equal(scheduled.date,today);
      Object.assign(summary,{date:today,slot,place:'Synthetic public place'});
      const peer=users[1];
      for(const studentEmails of [[values.studentEmails[0],values.studentEmails[0]],['missing@school.example','user1@school.example'],[`${staff.id}@school.example`,'user1@school.example']]) {
        assert.ok([400,422].includes((await request('hosted-meetings','POST',staff,{...values,studentEmails})).status));
      }
      assert.equal((await request('hosted-meetings','POST',staff,{...values,...schedule})).status,400);
      const documents={content:'=SUM(1,2)\n활동 내용',outcome:'성과',expenses:[{date:today,description:'재료, 인쇄',amount:12000}]};
      assert.equal((await request(`${p}/documents/me`,'PUT',users[4],documents)).status,404);
      assert.equal((await request(`${p}/documents/me`,'PUT',staff,documents)).status,403);
      assert.equal((await request(`${p}/documents/me`,'PUT',student,documents,{'x-csrf-token':'bad'})).status,403);
      const submitted=await request(`${p}/documents/me`,'PUT',student,documents);assert.equal(submitted.status,200,JSON.stringify(submitted.body));
      const etag=submitted.body.data.myDocuments.etag;
      assert.equal((await request(`${p}/schedule`,'PUT',peer,schedule,{'if-match':scheduled.etag})).status,409);
      assert.equal((await request(p,'GET',peer)).body.data.myDocuments,null);
      assert.equal((await request(p,'GET',peer)).body.data.canSchedule,false);
      assert.equal((await request(p,'GET',peer)).body.data.members,undefined);
      assert.equal((await request(`${p}/documents/me`,'PUT',student,documents)).status,412);
      const updated=await request(`${p}/documents/me`,'PUT',student,{...documents,outcome:'수정 성과'},{'if-match':etag});assert.equal(updated.status,200);
      assert.equal((await request(`${p}/documents/me`,'PUT',student,documents,{'if-match':etag})).status,412);
      const detail=await request(p,'GET',staff);assert.equal(detail.body.data.members.filter((m:{documents:unknown})=>m.documents).length,1);
      assert.equal(detail.body.data.members[0].documents.outcome,'수정 성과');
      assert.equal(JSON.stringify(detail.body).includes('@school.example'),false);
      assert.deepEqual((await request('hosted-meetings','GET',staff)).body.data,[{...summary,memberCount:2,submittedCount:1}]);
      assert.deepEqual((await request('hosted-meetings','GET',student)).body.data,[{...summary,memberCount:2,isMember:true}]);
      for(const kind of ['activity','expenses']) {
        const download=`${p}/documents/${student.id}/${kind}.csv`;
        const file=await request(download,'GET',staff);assert.equal(file.status,200);assert.match(file.headers.get('content-type')!,/text\/csv/);assert.equal(file.headers.get('cache-control'),'no-store');
        assert.match(file.headers.get('content-disposition')!,/attachment/);
        assert.equal((await request(download,'GET',student)).status,200);
        assert.equal((await request(download,'GET',peer)).status,403);
        assert.equal((await request(download,'GET',otherStaff)).status,404);
        assert.equal((await request(download,'GET',{...staff,raw:'no-session'})).status,401);
        assert.ok(file.body.includes(kind==='activity'?"'=SUM(1,2)":'12000'));
      }
      const oversized={...documents,expenses:Array.from({length:20},()=>({date:today,description:'한'.repeat(120),amount:1})),content:'한'.repeat(5000),outcome:'한'.repeat(2000)};
      assert.equal((await request(`${p}/documents/me`,'PUT',student,oversized,{'if-match':updated.body.data.myDocuments.etag})).status,200);
      const future=new Date(`${today}T00:00:00Z`);future.setUTCDate(future.getUTCDate()+7);
      const futureDate=future.toISOString().slice(0,10);
      const futureMeeting=await request('hosted-meetings','POST',staff,values);assert.equal(futureMeeting.status,201);
      const futureId=futureMeeting.body.data.id,fp=`hosted-meetings/${futureId}`;
      assert.equal((await request(`${fp}/schedule`,'PUT',student,{...schedule,date:futureDate},{'if-match':futureMeeting.body.data.etag})).status,200);
      const notice={meetingIds:[id,futureId],title:'안내',body:'활동 보고서를 제출해주세요.'};
      assert.equal((await request('hosted-meetings/notices','POST',student,notice)).status,403);
      const otherMeeting=await request('hosted-meetings','POST',otherStaff,values);
      assert.equal((await request('hosted-meetings/notices','POST',staff,{...notice,meetingIds:[id,otherMeeting.body.data.id]})).status,404);
      assert.equal((await request(`${p}/notices`,'GET',student)).body.data.length,0);
      assert.equal((await request('hosted-meetings/notices','POST',staff,notice)).body.data.publishedCount,2);
      for(const target of [p,fp]) {
        const notices=await request(`${target}/notices`,'GET',student);
        assert.equal(notices.status,200);assert.equal(notices.body.data[0].body,notice.body);
        assert.equal((await request(`${target}/notices`,'GET',users[4])).status,404);
        assert.equal((await request(`${target}/notices`,'GET',otherStaff)).status,404);
      }
      assert.equal((await request('hosted-meetings/notices','POST',staff,{meetingIds:Array(100).fill(id),title:'안'.repeat(100),body:'한'.repeat(5000)})).status,201);
      await request('hosted-meetings/notices','POST',staff,{...notice,meetingIds:[id,id]});
      const noticesPage=await request(`${p}/notices?limit=1`,'GET',student);assert.ok(noticesPage.body.nextCursor);
      assert.equal((await request(`${p}/notices?limit=1&cursor=${encodeURIComponent(noticesPage.body.nextCursor)}`,'GET',student)).body.data.length,1);

      assert.equal((await request(`${fp}/documents/me`,'PUT',student,documents)).status,422);
      assert.equal((await request(`${p}/documents/me`,'PUT',peer,{...documents,expenses:[{date:futureDate,description:'미래',amount:1}]})).status,422);
      assert.equal((await request(`${p}/documents/me`,'PUT',peer,{...documents,expenses:[]})).status,200);
      const page=await request('hosted-meetings?limit=1','GET',staff);assert.equal(page.body.data.length,1);assert.ok(page.body.nextCursor);
      assert.equal((await request(`hosted-meetings?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`,'GET',staff)).body.data.length,1);
      const removable=await request('hosted-meetings','POST',staff,values);
      const removedId=removable.body.data.id,rp=`hosted-meetings/${removedId}`,confirmed={confirmDeletion:true};
      await request(`${rp}/schedule`,'PUT',student,schedule,{'if-match':removable.body.data.etag});
      assert.equal((await request(`${rp}/documents/me`,'PUT',student,documents)).status,200);
      await request('hosted-meetings/notices','POST',staff,{...notice,meetingIds:[removedId]});
      assert.equal((await request(rp,'DELETE',staff,{})).status,400);
      assert.equal((await request(rp,'DELETE',staff,{confirmDeletion:false})).status,400);
      assert.equal((await request(rp,'DELETE',student,confirmed)).status,403);
      assert.equal((await request(rp,'DELETE',otherStaff,confirmed)).status,404);
      assert.equal((await request(rp,'DELETE',staff,confirmed,{'x-csrf-token':'bad'})).status,403);
      assert.equal((await request(rp,'GET',staff)).status,200);
      assert.equal((await request(rp,'DELETE',staff,confirmed)).status,204);
      for(const table of ['hosted_meetings','hosted_members','hosted_notices','activity_documents']) {
        assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE ${table==='hosted_meetings'?'id':'meeting_id'}=$1`,[removedId])).rowCount,0);
      }
      assert.equal((await pool.query('SELECT 1 FROM deletion_outbox WHERE entity_id=$1',[removedId])).rowCount,1);
      for(const actor of [staff,student]) {
        assert.equal((await request(rp,'GET',actor)).status,404);
        assert.equal((await request(`${rp}/documents/${student.id}/activity.csv`,'GET',actor)).status,404);
        assert.equal((await request('hosted-meetings','GET',actor)).body.data.some((m:{id:string})=>m.id===removedId),false);
      }
      assert.equal((await request(rp,'DELETE',staff,confirmed)).status,404);
      assert.equal((await request(`${p}/members/me`,'DELETE',student,{})).status,400);
      const membership=(await pool.query('SELECT id FROM hosted_members WHERE meeting_id=$1 AND user_id=$2',[id,student.id])).rows[0].id;
      assert.equal((await request(`${p}/members/me`,'DELETE',student,{confirmWithdrawal:true})).status,204);
      assert.equal((await pool.query('SELECT 1 FROM activity_documents WHERE meeting_id=$1 AND user_id=$2',[id,student.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM deletion_outbox WHERE entity_id=$1',[membership])).rowCount,1);
      assert.equal((await request(`${p}/notices`,'GET',student)).status,404);
      assert.equal((await request('me','DELETE',student,{confirmDeletion:true})).status,204);
      assert.equal((await pool.query('SELECT 1 FROM activity_documents WHERE user_id=$1',[student.id])).rowCount,0);
      await pool.query("UPDATE hosted_meetings SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
      assert.equal((await request(p,'GET',staff)).status,404);
      assert.equal((await request(`${p}/documents/${peer.id}/expenses.csv`,'GET',staff)).status,404);
      assert.equal((await request(`${p}/notices`,'GET',staff)).status,404);
      assert.equal((await request('hosted-meetings/notices','POST',staff,{meetingIds:[futureId,id],title:'만료',body:'공지'})).status,404);
      await transaction(cleanup);
      assert.equal((await pool.query('SELECT 1 FROM hosted_notices WHERE meeting_id=$1',[id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM activity_documents WHERE meeting_id=$1',[id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM deletion_outbox WHERE entity_id=$1',[id])).rowCount,1);
      await request('me','DELETE',staff,{confirmDeletion:true});
      assert.equal((await pool.query('SELECT 1 FROM hosted_meetings WHERE host_id=$1',[staff.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM hosted_members WHERE meeting_id=$1',[futureId])).rowCount,0);
      await request('me','DELETE',otherStaff,{confirmDeletion:true});
    });
    await t.test('CSRF·미정의 필드·학교·프로필 공개 범위·고지·가입 차단',async()=>{
      assert.equal((await request('meetings','POST',users[0],{}, {'x-csrf-token':'wrong'})).status,403);
      assert.equal((await request('me','PATCH',users[0],{email:'fake'})).status,400);
      assert.equal((await request('me','PATCH',users[0],{displayName:'private name'})).status,400);
      const updated=await request('me','PATCH',users[0],{optionalProfileConsent:true,displayName:'private name',department:'test',entryYear:2026,interests:['SQL']});
      assert.equal(updated.status,200);
      assert.deepEqual(updated.body.data,(await request('me','GET',users[0])).body.data);
      const cleared=await request('me','PATCH',users[0],{optionalProfileConsent:false});
      assert.deepEqual(cleared.body.data,(await request('me','GET',users[0])).body.data);
      assert.equal(cleared.body.data.optionalProfileConsent,false);
      assert.equal(cleared.body.data.displayName,null);
      assert.deepEqual(cleared.body.data.interests,[]);
      await request('me','PATCH',users[0],{optionalProfileConsent:true,displayName:'private name',department:'test',entryYear:2026,interests:['SQL']});
      const id=await create();const r=await request(`meetings/${id}`,'GET',users[1]);
      assert.equal(r.status,200);assert.equal(r.body.data.intersectionSlots,undefined);assert.equal(r.body.data.proposal,undefined);
      assert.deepEqual(Object.keys(r.body.data.members[0].profile).sort(),['department','entryYear','interests']);
      assert.equal(JSON.stringify(r.body).includes('private name'),false);assert.equal(JSON.stringify(r.body).includes('@school.example'),false);
      const alien=randomUUID();await pool.query("INSERT INTO schools(id,name,timezone) VALUES($1,'Other synthetic school','UTC')",[alien]);
      await pool.query('UPDATE users SET school_id=$2 WHERE id=$1',[users[6].id,alien]);
      assert.equal((await request(`meetings/${id}`,'GET',users[6])).status,404);
      await pool.query('UPDATE users SET school_id=$2 WHERE id=$1',[users[6].id,school]);
      await pool.query('UPDATE app_settings SET launch_verified_at=NULL');assert.equal((await request('auth/otp-challenges','POST',users[0],{email:'new@school.example'})).status,503);
      await pool.query('UPDATE app_settings SET launch_verified_at=now()');
    });
    await t.test('학기 시간 목록·본인/학교 격리·만료 제외·불러온 시간 저장',async()=>{
      const recent=randomUUID(),expired=randomUUID(),alien=randomUUID(),alienTerm=randomUUID();
      await pool.query("INSERT INTO schools(id,name,timezone) VALUES($1,'Other synthetic school','UTC')",[alien]);
      await pool.query(`INSERT INTO terms(id,school_id,name,starts_on,ends_on) VALUES
        ($1,$4,'Recent synthetic term',current_date-60,current_date-1),
        ($2,$4,'Expired synthetic term',current_date-90,current_date-31),
        ($3,$5,'Other school term',current_date-60,current_date-1)`,[recent,expired,alienTerm,school,alien]);
      await pool.query("INSERT INTO term_slots(term_id,slot_code,starts_at,ends_at) VALUES($1,$2,'10:00','11:00')",[recent,slot]);
      for(const id of [recent,expired,alienTerm]) await pool.query('INSERT INTO availability(user_id,term_id,slots) VALUES($1,$2,$3)',[users[0].id,id,[slot]]);
      await pool.query('INSERT INTO availability(user_id,term_id,slots) VALUES($1,$2,$3)',[users[1].id,recent,[]]);
      const sourceTerm=(await pool.query('SELECT starts_on,ends_on FROM terms WHERE id=$1',[recent])).rows[0];
      const response=await request('me/availability');
      assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.deepEqual(response.body.data.map((t:{termId:string})=>t.termId),[term,recent]);
      assert.deepEqual(response.body.data[1],{termId:recent,name:'Recent synthetic term',startsOn:sourceTerm.starts_on,endsOn:sourceTerm.ends_on,slots:[slot],termSlots:[{slot,startsAt:'10:00:00',endsAt:'11:00:00'}]});
      assert.deepEqual((await request('me/availability','GET',users[1])).body.data.find((t:{termId:string})=>t.termId===recent).slots,[]);
      assert.equal((await request('me/availability','GET',{...users[0],raw:'missing-session'})).status,401);
      assert.equal((await request(`me/availability?userId=${users[1].id}`)).status,400);
      await availability(users[0],response.body.data[1].slots);
      assert.deepEqual((await request(`me/availability/${recent}`)).body.data.slots,[slot]);
      assert.equal((await request(`me/availability/${expired}`)).status,404);
      await pool.query('DELETE FROM availability WHERE term_id=ANY($1::uuid[])',[[recent,expired,alienTerm]]);
      await pool.query('DELETE FROM term_slots WHERE term_id=$1',[recent]);
      await pool.query('DELETE FROM terms WHERE id=ANY($1::uuid[])',[[recent,expired,alienTerm]]);
      await pool.query('DELETE FROM schools WHERE id=$1',[alien]);
    });
    await t.test('학기 전환 후 모임 원래 교시·예외 수정·확정·보관 만료',async()=>{
      const id=await create(),nextTerm=randomUUID();
      const original=(await pool.query('SELECT starts_on,ends_on FROM terms WHERE id=$1',[term])).rows[0];
      await pool.query("INSERT INTO terms(id,school_id,name,starts_on,ends_on) VALUES($1,$2,'Next synthetic term',current_date-1,current_date+60)",[nextTerm,school]);
      await pool.query("INSERT INTO term_slots(term_id,slot_code,starts_at,ends_at) VALUES($1,$2,'13:00','14:00')",[nextTerm,other]);
      try {
        await request(`meetings/${id}/members/me`,'PUT',users[1]);
        await pool.query('UPDATE app_settings SET current_term_id=$1',[nextTerm]);
        assert.equal((await request('configuration')).body.data.term.id,nextTerm);
        let d=await request(`meetings/${id}`);
        assert.deepEqual(d.body.data.term,{id:term,startsOn:original.starts_on,endsOn:original.ends_on,slots:[
          {slot,startsAt:'10:00:00',endsAt:'11:00:00'},{slot:other,startsAt:'11:00:00',endsAt:'12:00:00'},
        ]});
        assert.equal((await request(`meetings/${id}`,'GET',users[2])).body.data.term,null);
        assert.equal((await request(`meetings/${id}/availability/me`,'PUT',users[1],{slots:[slot]})).status,200);
        d=await request(`meetings/${id}`);
        assert.equal((await request(`meetings/${id}/confirmation`,'PUT',users[0],{date:today,slot},{'if-match':d.headers.get('etag')!})).status,200);
        const mine=(await request('meetings')).body.data.find((m:{id:string})=>m.id===id);
        const outsider=(await request('meetings','GET',users[2])).body.data.find((m:{id:string})=>m.id===id);
        assert.equal(mine.isMember,true);assert.equal(outsider.isMember,false);
        await pool.query('UPDATE terms SET starts_on=current_date-90,ends_on=current_date-31 WHERE id=$1',[term]);
        assert.equal((await request(`meetings/${id}`)).body.data.term,null);
        assert.deepEqual((await request(`meetings/${id}/availability/me`,'GET',users[1])).body.data,{overrideSlots:null,effectiveSlots:[]});
        assert.equal((await request(`meetings/${id}/availability/me`,'PUT',users[1],{slots:[slot]})).status,404);
      } finally {
        await pool.query('UPDATE terms SET starts_on=$2,ends_on=$3 WHERE id=$1',[term,original.starts_on,original.ends_on]);
        await pool.query('UPDATE app_settings SET current_term_id=$1',[term]);
        await pool.query('DELETE FROM term_slots WHERE term_id=$1',[nextTerm]);
        await pool.query('DELETE FROM terms WHERE id=$1',[nextTerm]);
      }
    });
    await t.test('마지막 자리 동시 참여·중복·차단 쌍 참여·단조 번호',async()=>{
      const id=await create(users[0],2);
      const attempts=await Promise.all([request(`meetings/${id}/members/me`,'PUT',users[1]),request(`meetings/${id}/members/me`,'PUT',users[2])]);
      assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);const winner=attempts[0].status===200?users[1]:users[2];
      assert.equal((await request(`meetings/${id}/members/me`,'PUT',winner)).status,200);
      assert.equal((await request(`meetings/${id}`)).body.data.memberCount,2);
      assert.equal((await request(`meetings/${id}/members/me`,'DELETE',winner)).status,204);
      const again=await request(`meetings/${id}/members/me`,'PUT',winner);assert.equal(again.body.data.memberNo,3);
      assert.equal((await request(`meetings/${id}/members/me`,'DELETE',users[0])).body.error.code,'HOST_CANNOT_LEAVE');
      const common=await create(users[3],4);await request(`meetings/${common}/members/me`,'PUT',users[1]);
      await request(`me/blocks/${users[1].id}`,'PUT',users[2]);assert.equal((await request(`meetings/${common}/members/me`,'PUT',users[2])).body.error.code,'MEMBERSHIP_CONFLICT');
      await request(`me/blocks/${users[1].id}`,'DELETE',users[2]);
    });
    await t.test('확정·ETag·예외/학기 변경·원본 보존·멱등 version',async()=>{
      const id=await create();await request(`meetings/${id}/members/me`,'PUT',users[1]);
      assert.deepEqual((await request(`meetings/${id}/availability/me`,'GET',users[1])).body.data,{overrideSlots:null,effectiveSlots:[slot]});
      const initialVersion=(await request(`meetings/${id}`)).body.data.version;
      assert.equal((await request(`meetings/${id}/availability/me`,'DELETE',users[1])).status,204);
      assert.equal((await request(`meetings/${id}`)).body.data.version,initialVersion);
      let d=await request(`meetings/${id}`);const version=d.body.data.version;
      assert.equal((await request(`meetings/${id}/confirmation`,'PUT',users[0],{date:today,slot})).status,428);
      assert.equal((await request(`meetings/${id}/confirmation`,'PUT',users[0],{date:today,slot},{'if-match':'"stale"'})).status,412);
      const confirmed=await request(`meetings/${id}/confirmation`,'PUT',users[0],{date:today,slot},{'if-match':d.headers.get('etag')!});assert.equal(confirmed.body.data.state,'confirmed');
      await request(`meetings/${id}/availability/me`,'PUT',users[1],{slots:[]});
      d=await request(`meetings/${id}`);assert.equal(d.body.data.state,'undecided');assert.ok(d.body.data.version>version);
      assert.deepEqual((await request(`me/availability/${term}`,'GET',users[1])).body.data.slots,[slot]);
      const v=d.body.data.version;await request(`meetings/${id}/availability/me`,'PUT',users[1],{slots:[]});assert.equal((await request(`meetings/${id}`)).body.data.version,v);
      await request(`meetings/${id}/availability/me`,'DELETE',users[1]);assert.deepEqual((await request(`meetings/${id}/availability/me`,'GET',users[1])).body.data,{overrideSlots:null,effectiveSlots:[slot]});
      const resetVersion=(await request(`meetings/${id}`)).body.data.version;
      const saved=await request(`meetings/${id}/availability/me`,'PUT',users[1],{slots:[slot]});
      assert.deepEqual(saved.body.data,{overrideSlots:[slot],effectiveSlots:[slot]});
      assert.equal((await request(`meetings/${id}`)).body.data.version,resetVersion+1);
      await request(`meetings/${id}/availability/me`,'PUT',users[1],{slots:[slot]});
      assert.equal((await request(`meetings/${id}`)).body.data.version,resetVersion+1);
      await request(`meetings/${id}/availability/me`,'DELETE',users[1]);
      d=await request(`meetings/${id}`);
      assert.equal((await request(`meetings/${id}/confirmation`,'PUT',users[0],{date:today,slot},{'if-match':d.headers.get('etag')!})).status,200);
      await availability(users[1],[]);d=await request(`meetings/${id}`);
      assert.equal(d.body.data.state,'undecided');assert.equal(d.body.data.confirmation,null);
      await availability(users[1],[slot]);
    });
    await t.test('교집합 없는 제안·명시 전원 수락·신규 참여 차단·취소된 제안',async()=>{
      await availability(users[2],[other]);const id=await create(users[3]);await request(`meetings/${id}/members/me`,'PUT',users[2]);
      let d=await request(`meetings/${id}`,'GET',users[3]);const p=await request(`meetings/${id}/proposals`,'POST',users[3],{date:today,slot},{'if-match':d.headers.get('etag')!});assert.equal(p.status,201);
      assert.equal((await request(`meetings/${id}/members/me`,'PUT',users[4])).body.error.code,'PROPOSAL_IN_PROGRESS');
      const pid=p.body.data.id;let accepted=await request(`meetings/${id}/proposals/${pid}/acceptances/me`,'PUT',users[3],undefined,{'if-match':p.headers.get('etag')!});assert.equal(accepted.body.data.state,'proposing');
      accepted=await request(`meetings/${id}/proposals/${pid}/acceptances/me`,'PUT',users[2],undefined,{'if-match':accepted.headers.get('etag')!});assert.equal(accepted.body.data.state,'confirmed');
      assert.deepEqual((await request(`me/availability/${term}`,'GET',users[2])).body.data.slots,[other]);
      await availability(users[2],[]);
      assert.deepEqual((await request(`me/availability/${term}`,'GET',users[2])).body.data.slots,[]);
      assert.equal((await request(`meetings/${id}`,'GET',users[3])).body.data.state,'confirmed');
      await request(`meetings/${id}/members/me`,'DELETE',users[2]);
      const cancel=await create(users[3]);await request(`meetings/${cancel}/members/me`,'PUT',users[2]);d=await request(`meetings/${cancel}`,'GET',users[3]);
      const pending=await request(`meetings/${cancel}/proposals`,'POST',users[3],{date:today,slot},{'if-match':d.headers.get('etag')!});
      await availability(users[2],[other]);d=await request(`meetings/${cancel}`,'GET',users[3]);assert.equal(d.body.data.state,'undecided');
      assert.equal((await request(`meetings/${cancel}/proposals/${pending.body.data.id}/acceptances/me`,'PUT',users[2],undefined,{'if-match':d.headers.get('etag')!})).body.error.code,'PROPOSAL_STALE');
      const retry=await request(`meetings/${cancel}/proposals`,'POST',users[3],{date:today,slot},{'if-match':d.headers.get('etag')!});assert.equal(retry.status,201);
      assert.equal((await request(`meetings/${cancel}/availability/me`,'PUT',users[2],{slots:[]})).status,200);
      d=await request(`meetings/${cancel}`,'GET',users[3]);assert.equal(d.body.data.state,'undecided');
      assert.equal((await request(`meetings/${cancel}/proposals/${retry.body.data.id}/acceptances/me`,'PUT',users[2],undefined,{'if-match':d.headers.get('etag')!})).body.error.code,'PROPOSAL_STALE');
      await availability(users[2],[slot]);
    });
    await t.test('대안 확정 후 시간·예외 변경 유지·신규 참여 조건·인원 감소·새 동의',async()=>{
      await availability(users[2],[other]);
      const id=await create(users[3],4);
      for(const user of [users[2],users[4]]) assert.equal((await request(`meetings/${id}/members/me`,'PUT',user)).status,200);
      let d=await request(`meetings/${id}`,'GET',users[3]);
      const p=await request(`meetings/${id}/proposals`,'POST',users[3],{date:today,slot},{'if-match':d.headers.get('etag')!});assert.equal(p.status,201);
      for(const user of [users[3],users[2],users[4]]) {
        d=await request(`meetings/${id}`,'GET',users[3]);
        assert.equal((await request(`meetings/${id}/proposals/${p.body.data.id}/acceptances/me`,'PUT',user,undefined,{'if-match':d.headers.get('etag')!})).status,200);
      }
      const confirmed=(await request(`meetings/${id}`,'GET',users[3])).body.data;
      assert.deepEqual(confirmed.confirmation,{date:today,slot,source:'proposal'});
      async function unchanged() {
        const current=(await request(`meetings/${id}`,'GET',users[3])).body.data;
        assert.equal(current.state,'confirmed');assert.deepEqual(current.confirmation,confirmed.confirmation);
        assert.equal(current.expiresAt,confirmed.expiresAt);return current;
      }
      await availability(users[3],[]);await unchanged();
      assert.equal((await request(`meetings/${id}/availability/me`,'PUT',users[3],{slots:[other]})).status,200);await unchanged();
      assert.equal((await request(`meetings/${id}/availability/me`,'DELETE',users[3])).status,204);
      const updated=await unchanged();assert.ok(updated.version>confirmed.version);
      assert.deepEqual((await request(`meetings/${id}/availability/me`,'GET',users[3])).body.data,{overrideSlots:null,effectiveSlots:[]});
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM proposal_acceptances WHERE proposal_id=$1',[p.body.data.id])).rows[0].n,3);
      await availability(users[0],[other]);
      assert.equal((await request(`meetings/${id}`)).body.data.canJoin,false);
      assert.equal((await request(`meetings/${id}/members/me`,'PUT')).body.error.code,'SLOT_NOT_ALLOWED');
      await availability(users[0],[slot]);assert.equal((await request(`meetings/${id}/members/me`,'PUT')).status,200);
      assert.equal((await pool.query('SELECT 1 FROM proposal_acceptances WHERE proposal_id=$1 AND user_id=$2',[p.body.data.id,users[0].id])).rowCount,0);
      assert.equal((await request(`meetings/${id}/members/me`,'DELETE')).status,204);await unchanged();
      assert.equal((await request(`meetings/${id}/members/${users[4].id}`,'DELETE',users[3])).status,204);await unchanged();
      assert.equal((await request(`meetings/${id}/members/me`,'DELETE',users[2])).status,204);
      d=await request(`meetings/${id}`,'GET',users[3]);assert.equal(d.body.data.state,'undecided');assert.equal(d.body.data.confirmation,null);
      assert.equal((await request(`meetings/${id}/members/me`,'PUT',users[2])).status,200);
      d=await request(`meetings/${id}`,'GET',users[3]);
      const fresh=await request(`meetings/${id}/proposals`,'POST',users[3],{date:today,slot:other},{'if-match':d.headers.get('etag')!});assert.equal(fresh.status,201);
      assert.notEqual(fresh.body.data.id,p.body.data.id);assert.deepEqual(fresh.body.data.acceptedMemberNos,[]);
      const first=await request(`meetings/${id}/proposals/${fresh.body.data.id}/acceptances/me`,'PUT',users[3],undefined,{'if-match':fresh.headers.get('etag')!});
      assert.equal(first.body.data.state,'proposing');
      const last=await request(`meetings/${id}/proposals/${fresh.body.data.id}/acceptances/me`,'PUT',users[2],undefined,{'if-match':first.headers.get('etag')!});assert.equal(last.body.data.state,'confirmed');
      assert.deepEqual((await request(`meetings/${id}`,'GET',users[3])).body.data.confirmation,{date:today,slot:other,source:'proposal'});
      await availability(users[2],[slot]);await availability(users[3],[slot]);
    });
    await t.test('코멘트 권한·페이지 커서·검색 와일드카드·나가기 후 거부',async()=>{
      const id=await create(users[0],3,'SQL % test');await request(`meetings/${id}/members/me`,'PUT',users[1]);
      assert.equal((await request(`meetings/${id}/comments`,'GET',users[2])).status,403);
      for(const body of ['<script>text only</script>','second','third']) assert.equal((await request(`meetings/${id}/comments`,'POST',users[1],{body})).status,201);
      const first=await request(`meetings/${id}/comments?limit=2`);assert.equal(first.body.data.length,2);assert.ok(first.body.nextCursor);
      const second=await request(`meetings/${id}/comments?limit=2&cursor=${first.body.nextCursor}`);assert.equal(second.body.data.length,1);
      const ids=(await request('meetings?topic=%25')).body.data.map((r:{id:string})=>r.id);assert.deepEqual(ids,[id]);
      await request(`meetings/${id}/members/me`,'DELETE',users[1]);assert.equal((await request(`meetings/${id}/comments`,'POST',users[1],{body:'late'})).status,403);
      assert.equal((await request(`meetings/${id}/comments`)).body.data.length,3);
    });
    await t.test('모임 관리는 개설·참여 모임만 페이지별 조회하고 탈퇴한 모임을 제외한다',async()=>{
      const own=await create(users[4],3,'manage-filter');
      const joined=await create(users[0],3,'manage-filter');
      const other=await create(users[1],3,'manage-filter');
      assert.equal((await request(`meetings/${joined}/members/me`,'PUT',users[4])).status,200);
      const first=await request('meetings?topic=manage-filter&membership=joined&limit=1','GET',users[4]);
      assert.equal(first.status,200);assert.equal(first.body.data.length,1);assert.ok(first.body.nextCursor);
      const second=await request(`meetings?topic=manage-filter&membership=joined&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,'GET',users[4]);
      assert.deepEqual([...first.body.data,...second.body.data].map(m=>m.id).sort(),[own,joined].sort());
      assert.equal(second.body.nextCursor,null);
      const discovery=await request('meetings?topic=manage-filter&membership=unjoined','GET',users[4]);
      assert.equal(discovery.status,200);
      assert.deepEqual(discovery.body.data.map((m:{id:string})=>m.id),[other]);
      assert.equal((await request(`meetings/${joined}/members/me`,'DELETE',users[4])).status,204);
      const remaining=await request('meetings?topic=manage-filter&membership=joined','GET',users[4]);
      assert.deepEqual(remaining.body.data.map((m:{id:string})=>m.id),[own]);
      const afterLeave=await request('meetings?topic=manage-filter&membership=unjoined','GET',users[4]);
      assert.deepEqual(afterLeave.body.data.map((m:{id:string})=>m.id).sort(),[joined,other].sort());
    });
    await t.test('모임·차단 목록 페이지는 중복 없이 공개 필드만 반환',async()=>{
      const ids=[];
      for(let i=0;i<3;i++) ids.push(await create(users[4],3,'pagination'));
      const first=await request('meetings?topic=pagination&overlapOnly=true&limit=2','GET',users[4]);
      assert.equal(first.status,200);assert.equal(first.body.data.length,2);assert.ok(first.body.nextCursor);
      const second=await request(`meetings?topic=pagination&overlapOnly=true&limit=2&cursor=${first.body.nextCursor}`,'GET',users[4]);
      assert.equal(second.body.nextCursor,null);
      assert.deepEqual([...first.body.data,...second.body.data].map(m=>m.id).sort(),ids.sort());
      for(const user of [users[0],users[1]]) assert.equal((await request(`me/blocks/${user.id}`,'PUT',users[4])).status,200);
      const a=await request('me/blocks?limit=1','GET',users[4]);
      assert.equal(a.body.data.length,1);assert.ok(a.body.nextCursor);
      assert.deepEqual(Object.keys(a.body.data[0]).sort(),['createdAt','profile','userId']);
      const b=await request(`me/blocks?limit=1&cursor=${a.body.nextCursor}`,'GET',users[4]);
      assert.equal(b.body.nextCursor,null);
      assert.deepEqual([a.body.data[0].userId,b.body.data[0].userId].sort(),[users[0].id,users[1].id].sort());
      for(const user of [users[0],users[1]]) await request(`me/blocks/${user.id}`,'DELETE',users[4]);
    });
    await t.test('서로 다른 3명 신고 제한·반복 1명·기각/만료 해제',async()=>{
      for(let i=0;i<3;i++) assert.equal((await request('reports','POST',users[i],{targetType:'user',targetId:users[4].id,reason:'synthetic report'})).status,201);
      await request('reports','POST',users[0],{targetType:'user',targetId:users[4].id,reason:'repeat'});
      assert.equal((await request('me','GET',users[4])).body.data.creationRestricted,true);
      assert.equal((await request('meetings','POST',users[4],{termId:term,placeId:place,topic:'blocked',type:'study'})).status,403);
      await pool.query("UPDATE reports SET status='dismissed' WHERE reporter_id=$1 AND target_user_id=$2",[users[2].id,users[4].id]);assert.equal((await request('me','GET',users[4])).body.data.creationRestricted,false);
      await pool.query("UPDATE reports SET expires_at=now()-interval '1 second' WHERE target_user_id=$1",[users[4].id]);
    });
    await t.test('차단 원자 이탈·양방향 숨김·탈퇴 CASCADE·만료 즉시 숨김',async()=>{
      const id=await create();await request(`meetings/${id}/members/me`,'PUT',users[5]);
      assert.equal((await request(`me/blocks/${users[5].id}`,'PUT',users[0])).status,200);
      assert.equal((await request(`meetings/${id}`,'GET',users[5])).status,404);assert.equal((await request(`meetings/${id}`)).body.data.memberCount,1);
      await request(`me/blocks/${users[5].id}`,'DELETE');
      const hosted=await create(users[5]);await request(`meetings/${hosted}/members/me`,'PUT',users[0]);
      await request(`meetings/${id}/members/me`,'PUT',users[5]);await request(`meetings/${id}/comments`,'POST',users[5],{body:'delete with account'});
      assert.equal((await request('me','DELETE',users[5],{confirmDeletion:true})).status,204);
      assert.equal((await request('me','GET',users[5])).status,401);assert.equal((await request(`meetings/${hosted}`)).status,404);
      assert.equal((await request(`meetings/${id}/comments`)).body.data.length,0);
      const expired=await create();await pool.query("UPDATE meetings SET expires_at=now()-interval '1 second' WHERE id=$1",[expired]);assert.equal((await request(`meetings/${expired}`)).status,404);
      await transaction(cleanup);assert.equal((await pool.query('SELECT 1 FROM meetings WHERE id=$1',[expired])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM deletion_outbox WHERE entity_id=$1',[expired])).rowCount,1);
      assert.ok((await pool.query('SELECT 1 FROM deletion_outbox WHERE entity_id=$1',[users[5].id])).rowCount);
    });
    await t.test('차단/탈퇴와 참여 경합은 원자 처리',async()=>{
      const id=await create(users[3]);
      const results=await Promise.all([request(`meetings/${id}/members/me`,'PUT',users[4]),request(`me/blocks/${users[4].id}`,'PUT',users[3])]);
      assert.ok([200,404].includes(results[0].status));assert.equal(results[1].status,200);
      assert.equal((await request(`meetings/${id}`,'GET',users[3])).body.data.memberCount,1);
      assert.equal((await request(`meetings/${id}`,'GET',users[4])).status,404);
      await request(`me/blocks/${users[4].id}`,'DELETE',users[3]);
      const hosted=await create(users[6]);
      const race=await Promise.all([request(`meetings/${hosted}/members/me`,'PUT',users[1]),request('me','DELETE',users[6],{confirmDeletion:true})]);
      assert.ok([200,404].includes(race[0].status));assert.equal(race[1].status,204);
      assert.equal((await request(`meetings/${hosted}`)).status,404);
    });
    await t.test('OTP 오입력 5회 폐기·동시 검증 1회·주소 제한·사전 인증 CSRF',async()=>{
      const csrf=await handle(new Request('http://localhost:3000/api/v1/auth/csrf'));const csrfBody=await csrf.json(),preCookie=csrf.headers.get('set-cookie')!.split(';')[0];
      async function pre(path:string,body:unknown) {const r=await handle(new Request(`http://localhost:3000/api/v1/${path}`,{method:'POST',headers:{cookie:preCookie,origin:process.env.APP_ORIGIN!,'x-csrf-token':csrfBody.csrfToken,'content-type':'application/json','x-real-ip':'test-ip'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
      const issued=await pre('auth/otp-challenges',{email:'fresh@school.example'});assert.equal(issued.status,202);
      assert.equal(issued.body.data.demoCode,undefined);
      const id=issued.body.data.challengeId,mail=JSON.parse(await readFile(join(mailDir!,`${id}.json`),'utf8'));
      assert.equal((await pre('auth/otp-challenges',{email:'fresh@school.example'})).status,429);
      const body={challengeId:id,code:mail.code,privacyVersion:'test-v1',privacyAcknowledged:true};
      const attempts=await Promise.all([pre('auth/sessions',body),pre('auth/sessions',body)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,401]);
      assert.equal(attempts.find(r=>r.status===200)!.body.data.user.role,'student');
      const staffId=randomUUID();
      await pool.query("INSERT INTO users(id,school_id,email,role,privacy_version,privacy_acknowledged_at) VALUES($1,$2,'staff@school.example','institution','test-v1',now())",[staffId,school]);
      const staffOtp=await pre('auth/otp-challenges',{email:'staff@school.example'});assert.equal(staffOtp.status,202);
      const staffMail=JSON.parse(await readFile(join(mailDir!,`${staffOtp.body.data.challengeId}.json`),'utf8'));
      const staffLogin=await pre('auth/sessions',{challengeId:staffOtp.body.data.challengeId,code:staffMail.code,privacyVersion:'test-v1',privacyAcknowledged:true});
      assert.equal(staffLogin.status,200);assert.equal(staffLogin.body.data.user.role,'institution');
      const bad=await pre('auth/otp-challenges',{email:'wrong@school.example'});const wrongId=bad.body.data.challengeId,wrongMail=JSON.parse(await readFile(join(mailDir!,`${wrongId}.json`),'utf8'));
      for(let i=0;i<5;i++) assert.equal((await pre('auth/sessions',{challengeId:wrongId,code:wrongMail.code==='000000'?'000001':'000000',privacyVersion:'test-v1',privacyAcknowledged:true})).status,401);
      assert.equal((await pool.query('SELECT 1 FROM otp_challenges WHERE id=$1',[wrongId])).rowCount,0);
    });
    await t.test('삭제 목록 500건 단위 전달·실패 후 미전달 재시도·빈 목록 무전송',async()=>{
      await pool.query('TRUNCATE deletion_outbox');
      await pool.query('INSERT INTO deletion_outbox(entity_id) SELECT gen_random_uuid() FROM generate_series(1,501)');
      const originalFetch=globalThis.fetch, batches:{entityId:string,deletedAt:string}[][]=[];
      let fail=true;
      globalThis.fetch=async(url,options)=>{
        assert.equal(url,process.env.DELETION_DELIVERY_URL);
        assert.equal(options?.method,'POST');
        assert.equal(new Headers(options?.headers).get('authorization'),'Bearer synthetic-test-token');
        const records=JSON.parse(options?.body as string) as {entityId:string,deletedAt:string}[];
        assert.ok(records.every(r=>Object.keys(r).sort().join(',')==='deletedAt,entityId'));
        batches.push(records);
        return new Response(null,{status:fail && batches.length===2?503:204});
      };
      try {
        assert.equal(await deliverDeletions(),500);
        await assert.rejects(deliverDeletions(),/DELETION_DELIVERY_FAILED/);
        assert.deepEqual(batches.map(b=>b.length),[500,1]);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM deletion_outbox WHERE delivered_at IS NULL')).rows[0].n,1);
        fail=false;
        assert.equal(await deliverDeletions(),1);
        assert.deepEqual(batches[2],batches[1]);
        assert.equal(new Set(batches.slice(0,2).flat().map(r=>r.entityId)).size,501);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM deletion_outbox WHERE delivered_at IS NULL')).rows[0].n,0);
        assert.equal(await deliverDeletions(),0);assert.equal(batches.length,3);
      } finally {globalThis.fetch=originalFetch;}
    });
    await t.test('일일 삭제 CLI는 실제 HTTP 수신부로 501건을 한 실행에 모두 전달',async()=>{
      await pool.query('TRUNCATE deletion_outbox');
      await pool.query('INSERT INTO deletion_outbox(entity_id) SELECT gen_random_uuid() FROM generate_series(1,501)');
      const batches:unknown[][]=[];
      const receiver=createServer((req,res)=>{
        let body='';req.setEncoding('utf8');req.on('data',chunk=>{body+=chunk;});
        req.on('end',()=>{batches.push(JSON.parse(body));res.writeHead(204).end();});
      });
      await new Promise<void>(resolve=>receiver.listen(0,'127.0.0.1',resolve));
      try {
        const address=receiver.address();assert.ok(address && typeof address!=='string');
        await promisify(execFile)(process.execPath,['--conditions=react-server','--import','tsx','backend/scripts/retention.ts'],{
          env:{...process.env,DELETION_DELIVERY_URL:`http://127.0.0.1:${address.port}/deletions`},timeout:10000,
        });
        assert.deepEqual(batches.map(b=>b.length),[500,1]);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM deletion_outbox WHERE delivered_at IS NULL')).rows[0].n,0);
      } finally {await new Promise<void>((resolve,reject)=>receiver.close(error=>error?reject(error):resolve()));}
    });
  } finally {try {await pool.end();} finally {await rm(mailDir!,{recursive:true,force:true});}}
});
