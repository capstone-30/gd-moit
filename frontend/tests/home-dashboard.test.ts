import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import HomeDashboard,{AvailabilitySummary,HomeMeetings} from '../app/components/home-dashboard';
import {loadAvailabilityContext} from '../app/components/client';
import {RequestError} from '../app/components/api';
import {accountHome} from '../../shared/account';

test('로그인 목적지는 학생 홈과 기관 대시보드로 구분한다',()=>{
  assert.equal(accountHome('student'),'/');
  assert.equal(accountHome('institution'),'/institutions');
});

test('홈은 로딩 중에도 탐색·개설·관리 바로가기를 제공한다',()=>{
  const html=renderToStaticMarkup(createElement(HomeDashboard));
  for(const href of ['/meetings','/meetings/new','/meetings/manage'])assert.ok(html.includes(`href="${href}"`));
  assert.match(html,/함께할 시간을 찾아요/);
  assert.match(html,/대학 주관 모임/);
  assert.equal((html.match(/aria-busy="true"/g)??[]).length,3);
  assert.doesNotMatch(html,/아직 등록 전이에요|첫 모임을 만나볼까요/);
});

test('가능 시간 요약은 학기 미설정·미등록·빈 저장·등록을 구분한다',()=>{
  const term={id:'term',startsOn:'2026-09-01',endsOn:'2026-12-31',slots:[]};
  const render=(times:{registered:boolean;slots:number[]}|null,semester:typeof term|null=term)=>renderToStaticMarkup(createElement(AvailabilitySummary,{term:semester,times}));
  assert.match(render(null,null),/학기가 설정되면/);
  assert.doesNotMatch(render(null,null),/개 교시/);
  assert.match(render({registered:false,slots:[]}),/아직 등록 전이에요/);
  assert.match(render({registered:true,slots:[]}),/<strong>0<\/strong>/);
  assert.match(render({registered:true,slots:[101,203]}),/<strong>2<\/strong>/);
  assert.match(render({registered:true,slots:[101]}),/href="\/profile#availability"/);
});

test('홈 모임 영역은 최초 로딩·빈 목록·재조회 중 기존 목록·실패 재시도를 구분한다',()=>{
  const render=(state:Parameters<typeof HomeMeetings>[0]['state'])=>renderToStaticMarkup(createElement(HomeMeetings,{
    id:'meetings',title:'참여 중인 모임',description:'최근 모임',state,
    empty:createElement('p',null,'참여 모임 없음'),children:createElement('li',null,'기존 모임'),
  }));
  const state={loading:true,reload:()=>{},data:undefined,error:undefined};
  const initial=render(state);
  assert.match(initial,/잠시만 기다려주세요/);
  assert.doesNotMatch(initial,/참여 모임 없음|기존 모임/);
  const empty=render({...state,loading:false,data:{data:[],etag:null}});
  assert.match(empty,/참여 모임 없음/);
  assert.doesNotMatch(empty,/기존 모임/);
  const stale=render({...state,data:{data:[{}],etag:null}});
  assert.match(stale,/기존 모임/);
  assert.doesNotMatch(stale,/잠시만 기다려주세요|참여 모임 없음/);
  const failed=render({...state,loading:false,error:new RequestError('조회 실패',503,'INTERNAL_ERROR')});
  assert.match(failed,/조회 실패/);
  assert.match(failed,/다시 불러오기/);
  assert.doesNotMatch(failed,/참여 모임 없음/);
});

test('홈은 현재 학기 시간만 요청하며 학기가 없으면 조회하지 않는다',async()=>{
  const originalFetch=globalThis.fetch;
  const calls:string[]=[];
  let term:{id:string}|null={id:'current-term'};
  const signal=new AbortController().signal;
  globalThis.fetch=(async(input,init)=>{
    const path=String(input);calls.push(path);
    assert.equal(init?.signal,signal);
    const data=path.endsWith('/configuration')?{term}:path.endsWith('/me')?{role:'student'}:{registered:true,slots:[101]};
    return new Response(JSON.stringify({data}),{status:200});
  }) as typeof fetch;
  try {
    assert.deepEqual((await loadAvailabilityContext(signal)).times,{registered:true,slots:[101]});
    assert.ok(calls.includes('/api/v1/me/availability/current-term'));
    term=null;calls.length=0;
    assert.equal((await loadAvailabilityContext(signal)).times,null);
    assert.deepEqual(calls.sort(),['/api/v1/configuration','/api/v1/me']);
  } finally {globalThis.fetch=originalFetch;}
});
