import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pool,transaction} from '../lib/db';
import {handle} from '../lib/controllers/api';
import {hash,csrfFor} from '../lib/security';
import {cleanup} from '../lib/models/retention';
const database=process.env.DATABASE_URL;
const enabled=Boolean(database && new URL(database).pathname.endsWith('_test'));
process.env.AUTH_SECRET='integration-secret-longer-than-thirty-two-characters';
process.env.APP_ORIGIN='http://localhost:3000';
process.env.TEST_MAIL_DIR='/private/tmp/moit-test-mail';
process.env.DELETION_DELIVERY_URL='http://127.0.0.1:1/deletions';
process.env.DELETION_DELIVERY_TOKEN='synthetic-test-token';
const school=randomUUID(),term=randomUUID(),place=randomUUID();
const users=Array.from({length:7},(_,i)=>({id:randomUUID(),raw:`test-session-${i}`,school_id:school}));
const today=new Date().toISOString().slice(0,10), weekday=new Date(`${today}T00:00:00Z`).getUTCDay()||7,slot=weekday*100+1,other=weekday*100+2;
async function request(path:string,method='GET',user=users[0],body?:unknown,headers:Record<string,string>={}) {
  const r=await handle(new Request(`http://localhost:3000/api/v1/${path}`,{method,headers:{cookie:`moit_session=${user.raw}`,origin:process.env.APP_ORIGIN!, 'x-csrf-token':csrfFor(user.raw),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}));
  return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};
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
    await t.test('CSRF·미정의 필드·학교·프로필 공개 범위·고지·가입 차단',async()=>{
      assert.equal((await request('meetings','POST',users[0],{}, {'x-csrf-token':'wrong'})).status,403);
      assert.equal((await request('me','PATCH',users[0],{email:'fake'})).status,400);
      assert.equal((await request('me','PATCH',users[0],{displayName:'private name'})).status,400);
      assert.equal((await request('me','PATCH',users[0],{optionalProfileConsent:true,displayName:'private name',department:'test',entryYear:2026,interests:['SQL']})).status,200);
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
    });
    await t.test('교집합 없는 제안·명시 전원 수락·신규 참여 차단·취소된 제안',async()=>{
      await availability(users[2],[other]);const id=await create(users[3]);await request(`meetings/${id}/members/me`,'PUT',users[2]);
      let d=await request(`meetings/${id}`,'GET',users[3]);const p=await request(`meetings/${id}/proposals`,'POST',users[3],{date:today,slot},{'if-match':d.headers.get('etag')!});assert.equal(p.status,201);
      assert.equal((await request(`meetings/${id}/members/me`,'PUT',users[4])).body.error.code,'PROPOSAL_IN_PROGRESS');
      const pid=p.body.data.id;let accepted=await request(`meetings/${id}/proposals/${pid}/acceptances/me`,'PUT',users[3],undefined,{'if-match':p.headers.get('etag')!});assert.equal(accepted.body.data.state,'proposing');
      accepted=await request(`meetings/${id}/proposals/${pid}/acceptances/me`,'PUT',users[2],undefined,{'if-match':accepted.headers.get('etag')!});assert.equal(accepted.body.data.state,'confirmed');
      assert.deepEqual((await request(`me/availability/${term}`,'GET',users[2])).body.data.slots,[other]);
      assert.equal((await request(`me/availability/${term}`,'PUT',users[2],{slots:[]})).body.error.code,'POLICY_UNRESOLVED');
      assert.deepEqual((await request(`me/availability/${term}`,'GET',users[2])).body.data.slots,[other]);
      await request(`meetings/${id}/members/me`,'DELETE',users[2]);
      const cancel=await create(users[3]);await request(`meetings/${cancel}/members/me`,'PUT',users[2]);d=await request(`meetings/${cancel}`,'GET',users[3]);
      const pending=await request(`meetings/${cancel}/proposals`,'POST',users[3],{date:today,slot},{'if-match':d.headers.get('etag')!});
      await availability(users[2],[]);d=await request(`meetings/${cancel}`,'GET',users[3]);assert.equal(d.body.data.state,'undecided');
      assert.equal((await request(`meetings/${cancel}/proposals/${pending.body.data.id}/acceptances/me`,'PUT',users[2],undefined,{'if-match':d.headers.get('etag')!})).body.error.code,'PROPOSAL_STALE');
      await availability(users[2],[slot]);
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
      const id=issued.body.data.challengeId,mail=JSON.parse(await readFile(`/private/tmp/moit-test-mail/${id}.json`,'utf8'));
      assert.equal((await pre('auth/otp-challenges',{email:'fresh@school.example'})).status,429);
      const body={challengeId:id,code:mail.code,privacyVersion:'test-v1',privacyAcknowledged:true};
      const attempts=await Promise.all([pre('auth/sessions',body),pre('auth/sessions',body)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,401]);
      const bad=await pre('auth/otp-challenges',{email:'wrong@school.example'});const wrongId=bad.body.data.challengeId,wrongMail=JSON.parse(await readFile(`/private/tmp/moit-test-mail/${wrongId}.json`,'utf8'));
      for(let i=0;i<5;i++) assert.equal((await pre('auth/sessions',{challengeId:wrongId,code:wrongMail.code==='000000'?'000001':'000000',privacyVersion:'test-v1',privacyAcknowledged:true})).status,401);
      assert.equal((await pool.query('SELECT 1 FROM otp_challenges WHERE id=$1',[wrongId])).rowCount,0);
    });
  } finally {await pool.end();}
});
