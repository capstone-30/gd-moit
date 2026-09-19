import test from 'node:test';
import assert from 'node:assert/strict';
import {intersection,shouldReset} from '../application/meetings';
import {normalizeEmail} from '../application/auth';
import * as input from '../adapters/http/input';
import {preauth,validPreauth,csrfFor} from '../adapters/security';
import {page,cursor,paginate} from '../adapters/http/pagination';
import {routes} from '../adapters/http/api';
import {handle} from '../composition';
process.env.AUTH_SECRET='test-secret-that-is-longer-than-thirty-two-characters';
test('교집합·제안 취소·확정 인원과 시간 변경 재검증',()=>{
  assert.deepEqual(intersection([[101,102],[102,201]]),[102]);
  assert.deepEqual(intersection([[101],[]]),[]);
  for(const checkTime of [false,true]) {
    assert.equal(shouldReset('confirmed',1,101,[],checkTime),true);
    assert.equal(shouldReset('undecided',1,null,[],checkTime),false);
    assert.equal(shouldReset('proposing',2,null,[],checkTime),true);
    assert.equal(shouldReset('confirmed',2,101,[101],checkTime),false);
    assert.equal(shouldReset('confirmed',2,101,[],checkTime),checkTime);
  }
});
test('입력·이메일 별칭·CSRF·필터 결합 커서',()=>{
  assert.equal(normalizeEmail('  A+tag@SCHOOL.EXAMPLE  '),'A+tag@school.example');
  assert.throws(()=>normalizeEmail('x@y.example,attacker@evil.example'));
  assert.deepEqual(input.slots([102,101,101]),[101,102]);
  assert.throws(()=>input.object({schoolId:'fake'},[]));
  assert.throws(()=>input.text('   ',100));
  const pre=preauth();assert.equal(validPreauth(pre),true);assert.equal(validPreauth(pre+'x'),false);
  assert.notEqual(csrfFor('session1'),csrfFor('session2'));
  const p=page(new URLSearchParams(),'filter1'),c=cursor(p,new Date().toISOString(),'00000000-0000-0000-0000-000000000001');
  assert.ok(page(new URLSearchParams({cursor:c}),'filter1').after);
  assert.throws(()=>page(new URLSearchParams({cursor:c}),'filter2'));
  assert.throws(()=>page(new URLSearchParams('limit=51'),'filter1'));
  const ranked=cursor(p,new Date().toISOString(),'00000000-0000-0000-0000-000000000001',1);
  assert.equal(page(new URLSearchParams({cursor:ranked}),'filter1').after?.rank,1);
  assert.throws(()=>page(new URLSearchParams({cursor:cursor(p,new Date().toISOString(),'00000000-0000-0000-0000-000000000001',2)}),'filter1'));
});
test('39개 HTTP 계약·본문 크기 제한은 DB 전에 검사',async()=>{
  assert.equal(routes.reduce((n,[,methods])=>n+methods.split(' ').length,0),39);
  const r=await handle(new Request('http://localhost/api/v1/reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:'x'.repeat(17000)})}));
  assert.equal(r.status,413);
  for(const path of ['hosted-meetings/notices','hosted-meetings/00000000-0000-0000-0000-000000000001/documents/me','hosted-projects/00000000-0000-0000-0000-000000000001/meetings']) {
    const response=await handle(new Request(`http://localhost/api/v1/${path}`,{method:path.endsWith('/documents/me')?'PUT':'POST',headers:{'content-type':'application/json'},body:'x'.repeat(32769)}));
    assert.equal(response.status,413);
  }
  const bad=await handle(new Request('http://localhost/api/v1/configuration',{method:'POST'}));assert.equal(bad.status,405);
  assert.equal(bad.headers.get('allow'),'GET');
  assert.equal((await handle(new Request('http://localhost/api/v1/unknown'))).status,404);
  assert.equal((await handle(new Request('http://localhost/api/v1/meetings/not-a-uuid'))).status,400);
});

test('프로필 입력은 생략·삭제 값을 보존하고 문자열·관심 주제를 정규화한다',()=>{
  assert.deepEqual(input.profileUpdate({}),{});
  const cleared={displayName:null,department:null,entryYear:null,interests:null,optionalProfileConsent:false};
  assert.deepEqual(input.profileUpdate(cleared),cleared);
  assert.deepEqual(input.profileUpdate({displayName:'  이름  ',department:'  ',entryYear:2026,interests:[' SQL ','SQL','Web'],optionalProfileConsent:true}),
    {displayName:'이름',department:'',entryYear:2026,interests:['SQL','Web'],optionalProfileConsent:true});
  for(const value of [{email:'private@example.com'},{displayName:1},{entryYear:'2026'},{interests:'SQL'},{interests:[' ']},{interests:Array(11).fill('SQL')},{optionalProfileConsent:null}]) {
    assert.throws(()=>input.profileUpdate(value),{status:400,code:'INVALID_INPUT'});
  }
});

test('모임 개설 입력은 기본 정원과 명시적 2인 동의를 유지한다',()=>{
  const value={termId:'00000000-0000-0000-0000-000000000001',placeId:'00000000-0000-0000-0000-000000000002',topic:' SQL ',type:'study'};
  assert.deepEqual(input.meetingCreate(value),{...value,topic:'SQL',capacity:3,twoPersonAcknowledged:undefined});
  assert.equal(input.meetingCreate({...value,capacity:2,twoPersonAcknowledged:true}).twoPersonAcknowledged,true);
  // Consent is enforced by the model; the input parser only validates its type.
  assert.equal(input.meetingCreate({...value,capacity:2,twoPersonAcknowledged:false}).twoPersonAcknowledged,false);
  for(const change of [{termId:'invalid'},{placeId:'invalid'},{topic:' '},{type:'other'},{capacity:1},{capacity:5},{capacity:null},{twoPersonAcknowledged:'true'},{hostId:'fake'}]) {
    assert.throws(()=>input.meetingCreate({...value,...change}),{status:400,code:'INVALID_INPUT'});
  }
});

test('모임 목록 입력은 유형·참여 여부만 받는다',async()=>{
  assert.deepEqual(input.meetingFilter(new URLSearchParams()),{type:null,membership:'all'});
  assert.deepEqual(input.meetingFilter(new URLSearchParams({type:'coffee',membership:'joined'})),{type:'coffee',membership:'joined'});
  for(const query of ['membership=other','membership=','type=other']) assert.throws(()=>input.meetingFilter(new URLSearchParams(query)),{status:400,code:'INVALID_INPUT'});
});

test('본문 파서는 빈 입력·JSON·16KiB 경계와 스트림 초과를 구분',async()=>{
  const request=(body?:string,contentType='application/json')=>new Request('http://localhost/api/v1/reports',{
    method:'POST',headers:{'content-type':contentType},...(body===undefined?{}:{body}),
  });
  assert.deepEqual(await input.body(request()),{});
  assert.deepEqual(await input.body(request('')),{});
  assert.deepEqual(await input.body(request('{"slots":[101]}','application/json; charset=utf-8')),{slots:[101]});
  const maxBody=JSON.stringify({body:'x'.repeat(16373)});
  assert.equal(Buffer.byteLength(maxBody),16384);
  assert.equal((await input.body(request(maxBody))).body.length,16373);
  await assert.rejects(input.body(request(maxBody+' ')),{status:413,code:'PAYLOAD_TOO_LARGE'});
  await assert.rejects(input.body(request('{')), {status:400,code:'INVALID_INPUT'});
  await assert.rejects(input.body(request('{}','text/plain')), {status:400,code:'INVALID_INPUT'});
  await assert.rejects(input.body(request(JSON.stringify({body:'가'.repeat(6000)}))),{status:413,code:'PAYLOAD_TOO_LARGE'});
});

test('페이지 경계·빈 목록·커서의 마이크로초 정밀도 유지',()=>{
  const p=page(new URLSearchParams({limit:'2'}),'page-test');
  const rows=[1,2,3].map(n=>({id:`00000000-0000-0000-0000-00000000000${n}`,cursor_at:`2026-10-03T00:00:00.00000${n}Z`}));
  assert.deepEqual(paginate([],p,row=>row),{data:[],nextCursor:null});
  assert.deepEqual(paginate(rows.slice(0,2),p,row=>row),{data:rows.slice(0,2),nextCursor:null});
  const result=paginate(rows,p,row=>row);
  assert.deepEqual(result.data,rows.slice(0,2));
  assert.deepEqual(page(new URLSearchParams({cursor:result.nextCursor!}),p.binding).after,{at:rows[1].cursor_at,id:rows[1].id});
});

test('페이지 변환 후에도 원본 행의 커서 정밀도를 유지하고 초과 행은 변환하지 않는다',()=>{
  const p=page(new URLSearchParams({limit:'1'}),'mapped');
  const rows=[1,2].map(n=>({id:`00000000-0000-0000-0000-00000000000${n}`,cursor_at:`2026-10-03T00:00:00.00000${n}Z`,title:`모임 ${n}`}));
  const mapped:string[]=[];
  const result=paginate(rows,p,row=>{mapped.push(row.id);return {title:row.title};});
  assert.deepEqual(result.data,[{title:'모임 1'}]);
  assert.deepEqual(mapped,[rows[0].id]);
  assert.deepEqual(page(new URLSearchParams({cursor:result.nextCursor!}),p.binding).after,{at:rows[0].cursor_at,id:rows[0].id});
  assert.deepEqual(paginate(rows.slice(0,0),p,row=>row.id),{data:[],nextCursor:null});
  assert.equal(paginate(rows.slice(0,1),p,row=>row.title).nextCursor,null);
});
