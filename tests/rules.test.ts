import test from 'node:test';
import assert from 'node:assert/strict';
import {intersection,shouldReset} from '../lib/models/meetings';
import {normalizeEmail} from '../lib/models/auth';
import * as input from '../lib/controllers/input';
import {preauth,validPreauth,csrfFor} from '../lib/security';
import {page,cursor,paginate} from '../lib/pagination';
import {routes,handle} from '../lib/controllers/api';
process.env.AUTH_SECRET='test-secret-that-is-longer-than-thirty-two-characters';
test('교집합·1명 복귀·제안 취소·참여 변경과 시간 변경 구분',()=>{
  assert.deepEqual(intersection([[101,102],[102,201]]),[102]);
  assert.deepEqual(intersection([[101],[]]),[]);
  assert.equal(shouldReset('confirmed',1,101,[101],true),true);
  assert.equal(shouldReset('confirmed',2,101,[102],true),true);
  assert.equal(shouldReset('confirmed',2,101,[],true,false),false);
  assert.equal(shouldReset('proposing',2,null,[],true),true);
  assert.equal(shouldReset('proposing',2,null,[],false),false);
});
test('입력·이메일 별칭·CSRF·필터 결합 커서',()=>{
  assert.equal(normalizeEmail('  A+tag@SCHOOL.EXAMPLE  '),'A+tag@school.example');
  assert.throws(()=>normalizeEmail('x@y.example,attacker@evil.example'));
  assert.deepEqual(input.slots([102,101,101]),[101,102]);
  assert.throws(()=>input.object({schoolId:'fake'},[]));
  assert.throws(()=>input.text('   ',100));
  const pre=preauth();assert.equal(validPreauth(pre),true);assert.equal(validPreauth(pre+'x'),false);
  assert.notEqual(csrfFor('session1'),csrfFor('session2'));
  const p=page(new URLSearchParams(),'filter1'),c=cursor(p,new Date(),'00000000-0000-0000-0000-000000000001');
  assert.ok(page(new URLSearchParams({cursor:c}),'filter1').after);
  assert.throws(()=>page(new URLSearchParams({cursor:c}),'filter2'));
  assert.throws(()=>page(new URLSearchParams('limit=51'),'filter1'));
});
test('28개 HTTP 계약·본문 크기 제한은 DB 전에 검사',async()=>{
  assert.equal(routes.reduce((n,[,methods])=>n+methods.split(' ').length,0),28);
  const r=await handle(new Request('http://localhost/api/v1/reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:'x'.repeat(17000)})}));
  assert.equal(r.status,413);
  const bad=await handle(new Request('http://localhost/api/v1/configuration',{method:'POST'}));assert.equal(bad.status,405);
  assert.equal(bad.headers.get('allow'),'GET');
  assert.equal((await handle(new Request('http://localhost/api/v1/unknown'))).status,404);
  assert.equal((await handle(new Request('http://localhost/api/v1/meetings/not-a-uuid'))).status,400);
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
  assert.deepEqual(paginate([],p),{data:[],nextCursor:null});
  assert.deepEqual(paginate(rows.slice(0,2),p),{data:rows.slice(0,2),nextCursor:null});
  const result=paginate(rows,p);
  assert.deepEqual(result.data,rows.slice(0,2));
  assert.deepEqual(page(new URLSearchParams({cursor:result.nextCursor!}),p.binding).after,{at:rows[1].cursor_at,id:rows[1].id});
});
