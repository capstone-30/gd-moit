import Dashboard from '../app/institutions/dashboard';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {summarizeDemo} from '../app/institutions/demo';

test('기관 시연은 월·유형을 함께 적용하고 지표와 주제별 합계를 일치시킨다',()=>{
  assert.deepEqual(summarizeDemo('2026-10','study'),{
    meetings:2,confirmed:2,members:7,fillRate:100,
    topics:[{topic:'알고리즘',meetings:1,members:4,confirmed:1},{topic:'웹 개발',meetings:1,members:3,confirmed:1}],
  });
  const all=summarizeDemo('','');
  assert.equal(all.meetings,9);assert.equal(all.confirmed,6);assert.equal(all.members,25);assert.equal(all.fillRate,81);
  for(const month of ['','2026-09','2026-10','2026-11']) {
    for(const type of ['','study','coffee','lunch','reflection'] as const) {
      const s=summarizeDemo(month,type);
      assert.equal(s.topics.reduce((n,t)=>n+t.members,0),s.members);
      assert.equal(s.topics.reduce((n,t)=>n+t.meetings,0),s.meetings);
      assert.equal(s.topics.reduce((n,t)=>n+t.confirmed,0),s.confirmed);
    }
  }
  assert.deepEqual(summarizeDemo('2026-11',''),{meetings:0,confirmed:0,members:0,fillRate:0,topics:[]});
  assert.equal(summarizeDemo('','coffee').members,5);
  assert.deepEqual(summarizeDemo('2026-10','reflection'),{meetings:1,confirmed:1,members:3,fillRate:100,topics:[{topic:'한 주의 배움',meetings:1,members:3,confirmed:1}]});
});

test('기관 지표 화면은 학생 API 없이 렌더링하고 합성 데이터 고지와 지표 정의를 제공한다',()=>{
  const original=globalThis.fetch;
  try {
  globalThis.fetch=()=>{throw new Error('기관 시연에서 네트워크 호출 금지');};
  const html=renderToStaticMarkup(createElement(Dashboard));
  assert.match(html,/모든 수치는 합성 데이터입니다/);
  assert.match(html,/고유 학생 수나 실제 참석 인원이 아닙니다/);
  assert.match(html,/합성 모임 5개/);
  assert.match(html,/<option value="reflection">회고/);
  assert.match(html,/label for="institution-month"/);
  assert.match(html,/label for="institution-type"/);
  assert.doesNotMatch(html,/주관 모임 서류 수신|계정 관리|로그아웃|탈퇴하고 삭제/);
  } finally {globalThis.fetch=original;}
});
