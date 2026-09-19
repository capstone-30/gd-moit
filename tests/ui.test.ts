import test from 'node:test';
import assert from 'node:assert/strict';
import {dateRange,slotMatchesDate} from '../app/components/calendar';
import {api,RequestError} from '../app/components/api';
test('학교 날짜 경계·28일 상한·학기 범위·교시 요일',()=>{
  assert.deepEqual(dateRange('Asia/Seoul','2026-09-01','2026-12-31',new Date('2026-10-03T16:00:00Z')),{min:'2026-10-04',max:'2026-11-01'});
  assert.deepEqual(dateRange('UTC','2026-10-10','2026-10-20',new Date('2026-10-03T16:00:00Z')),{min:'2026-10-10',max:'2026-10-20'});
  assert.equal(slotMatchesDate('2026-10-04',701),true);assert.equal(slotMatchesDate('2026-10-04',101),false);
});
test('화면 API는 매 변경 CSRF를 갱신하고 ETag·본문·no-store·오류를 보존',async()=>{
  const original=globalThis.fetch;const calls:{url:string,init?:RequestInit}[]=[];
  try {
    globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return String(url).endsWith('/csrf')?Response.json({csrfToken:'synthetic-csrf'}):new Response(null,{status:204});};
    await api('meetings/test/confirmation','PUT',{slot:601},'"v2"');
    assert.equal(calls.length,2);assert.equal(calls[0].init?.cache,'no-store');
    assert.deepEqual(calls[1].init?.headers,{'X-CSRF-Token':'synthetic-csrf','Content-Type':'application/json','If-Match':'"v2"'});
    assert.equal(calls[1].init?.body,'{"slot":601}');assert.equal(calls[1].init?.credentials,'same-origin');
    globalThis.fetch=async()=>Response.json({error:{message:'다시 조회',code:'VERSION_CONFLICT'}},{status:412,headers:{'retry-after':'60'}});
    await assert.rejects(api('meetings/test'),(e:unknown)=>e instanceof RequestError && e.status===412 && e.code==='VERSION_CONFLICT' && e.retryAfter===60);
    calls.length=0;globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({error:{message:'인증 실패',code:'CSRF_INVALID'}},{status:403});};
    await assert.rejects(api('me','PATCH',{}));assert.equal(calls.length,1);
    await assert.rejects(api('me','PATCH',{}),(e:unknown)=>e instanceof RequestError && e.status===403 && e.code==='CSRF_INVALID' && e.message==='인증 실패');
    calls.length=0;
    const controller=new AbortController();
    globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({data:[{id:'synthetic'}],nextCursor:'next-page'},{headers:{etag:'"v3"'}});};
    assert.deepEqual(await api('meetings','GET',undefined,undefined,controller.signal),{data:[{id:'synthetic'}],etag:'"v3"',nextCursor:'next-page'});
    assert.equal(calls.length,1);assert.equal(calls[0].init?.signal,controller.signal);assert.equal(calls[0].init?.body,undefined);
    globalThis.fetch=async()=>Response.json({}, {status:500});
    await assert.rejects(api('me'),(e:unknown)=>e instanceof RequestError && e.code==='INTERNAL_ERROR' && e.message==='요청에 실패했습니다.');
    await assert.rejects(api('me','PATCH',{}),(e:unknown)=>e instanceof RequestError && e.message==='인증 확인에 실패했습니다.');
  }finally{globalThis.fetch=original;}
});
