import {NoticeCard,ProjectNotices,NoticeForm} from '../app/components/hosted-meetings';
import Dashboard from '../app/institutions/dashboard';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {summarizeDemo as summarizeEsgDemo} from '../app/institutions/demo';
const summarizeDemo=(month:string,type:Parameters<typeof summarizeEsgDemo>[1])=>{
  const {areas,...summary}=summarizeEsgDemo(month,type);
  return summary;
};

test('기관 시연은 월·유형을 함께 적용하고 지표와 주제별 합계를 일치시킨다',()=>{
  assert.deepEqual(summarizeDemo('2026-10','study'),{
    meetings:2,confirmed:2,members:7,fillRate:100,
    topics:[{topic:'학습 나눔',meetings:1,members:4,confirmed:1},{topic:'자원순환 실천',meetings:1,members:3,confirmed:1}],
  });
  const all=summarizeDemo('','');
  assert.equal(all.fillRate,81);
  for(const month of ['','2026-09','2026-10','2026-11']) {
    for(const type of ['','study','coffee','lunch','reflection'] as const) {
      const {areas,...s}=summarizeEsgDemo(month,type);
      assert.deepEqual(areas.map(a=>a.area),['E','S','G']);
      for(const key of ['members','meetings','confirmed'] as const) {
        assert.equal(areas.reduce((n,a)=>n+a[key],0),s[key]);
      }
      assert.equal(s.topics.reduce((n,t)=>n+t.members,0),s.members);
      assert.equal(s.topics.reduce((n,t)=>n+t.meetings,0),s.meetings);
      assert.equal(s.topics.reduce((n,t)=>n+t.confirmed,0),s.confirmed);
    }
  }
  assert.deepEqual(summarizeDemo('2026-11',''),{meetings:0,confirmed:0,members:0,fillRate:0,topics:[]});
  assert.deepEqual(summarizeDemo('2026-10','reflection'),{meetings:1,confirmed:1,members:3,fillRate:100,topics:[{topic:'공동체 운영 회고',meetings:1,members:3,confirmed:1}]});
});

test('기관 지표는 합성 데이터이며 평가 점수·고유 인원으로 해석하지 않도록 고지한다',()=>{
  const html=renderToStaticMarkup(createElement(Dashboard));
  assert.match(html,/ESG 평가 점수를 뜻하지 않습니다/);
  assert.match(html,/실제 학교·학생의 활동이나 ESG 평가 결과가 아닙니다/);
  assert.match(html,/중복을 포함하며 실제 참석 인원이 아닙니다/);
});

import {DocumentRequirementsSummary,Notices,ReportForm} from '../app/components/hosted-meetings';

import {documentsComplete} from '../../shared/activity-documents';
import {hostedActivities} from '../../shared/hosted-activities';
test('템플릿 기본 서류와 현재 요구에 따른 완료 상태를 구분한다',()=>{
  assert.deepEqual(hostedActivities.general.requirements,{activity:false,expenses:false});
  assert.deepEqual(hostedActivities.plogging.requirements,{activity:true,expenses:false});
  for(const type of ['mentoring','learning'] as const)assert.deepEqual(hostedActivities[type].requirements,{activity:true,expenses:true});
  const reportOnly={activitySubmitted:true,expensesSubmitted:false};
  assert.equal(documentsComplete(hostedActivities.plogging.requirements,reportOnly),true);
  assert.equal(documentsComplete(hostedActivities.mentoring.requirements,reportOnly),false);
  assert.equal(documentsComplete(hostedActivities.general.requirements,reportOnly),false);
  assert.equal(documentsComplete(hostedActivities.plogging.requirements,null),false);
  const requirements={activity:false,expenses:true};
  const html=renderToStaticMarkup(createElement(DocumentRequirementsSummary,{requirements}));
  assert.match(html,/활동비 사용 내역서/);assert.doesNotMatch(html,/활동 보고서/);
  const props={id:'m',title:'활동',requirements,reload:()=>{}};
  const staff=renderToStaticMarkup(createElement(Notices,{...props,institution:true}));
  const student=renderToStaticMarkup(createElement(Notices,{...props,institution:false}));
  assert.match(staff,/aria-label="공지사항 작성"/);assert.doesNotMatch(staff,/공지사항 수정|공지 새로고침/);assert.doesNotMatch(student,/aria-label="공지사항 작성"/);
  const project=renderToStaticMarkup(createElement(ProjectNotices,{projectId:'p',onCreate:()=>{}}));
  assert.match(project,/aria-label="공지사항 작성"/);assert.doesNotMatch(project,/공지 새로고침/);
});

test('학생 제출 양식은 비활성 서류를 숨기고 입력을 보존하며 제출을 막는다',()=>{
  const meeting={id:'m',title:'활동',date:null,slot:null,place:null,placeId:null,capacity:2,memberCount:2,isMember:true,
    term:{id:'t',startsOn:'2026-09-01',endsOn:'2026-12-31',slots:[]},etag:'version',canSchedule:true,canSubmit:false,expiresAt:'2026-12-31',
    myDocuments:{activitySubmitted:true,expensesSubmitted:true,content:'기존 활동',outcome:'기존 성과',expenses:[{date:'2026-10-25',description:'재료',amount:1000}],submittedAt:'2026-10-25',updatedAt:'2026-10-25',etag:'v'}};
  for(const documentRequirements of [{activity:true,expenses:false},{activity:false,expenses:true}]) {
    const html=renderToStaticMarkup(createElement(ReportForm,{meeting:{...meeting,documentRequirements},reload:()=>{}}));
    const fields=[...html.matchAll(/<fieldset\b([^>]*)><div[^>]*><h3>([^<]*)<\/h3>/g)];
    assert.equal(fields.length,2);
    for(const [,attributes,title] of fields) {
      const active=title==='활동 보고서'?documentRequirements.activity:documentRequirements.expenses;
      assert.equal(/hidden=""/.test(attributes),!active);
      assert.equal(/disabled=""/.test(attributes),!active);
    }
    assert.match(html,/name="content">기존 활동<\/textarea>/);
    assert.match(html,/name="outcome">기존 성과<\/textarea>/);
    assert.match(html,/value="재료"/);
    assert.match(html,/<form[^>]*><fieldset[^>]*disabled=""/);
  }
  const none=renderToStaticMarkup(createElement(ReportForm,{meeting:{...meeting,documentRequirements:{activity:false,expenses:false}},reload:()=>{}}));
  assert.match(none,/현재 제출을 요구하는 서류가 없습니다/);
  assert.equal((none.match(/<fieldset[^>]*hidden="" disabled=""/g)??[]).length,2);
});

test('서류 제출 공지는 요구 서류별 완료 상태와 담당자 전용 다운로드를 제공한다',()=>{
  const documents={activitySubmitted:true,expensesSubmitted:false,content:'활동',outcome:'성과',expenses:[],submittedAt:'2026-10-25',updatedAt:'2026-10-25',etag:'v'};
  const members=[{userId:'a',memberNo:1,documents:null},{userId:'b',memberNo:2,documents}];
  const notice={id:'n',title:'서류 안내',body:'제출해주세요',createdAt:'2026-10-25',documentRequirements:{activity:true,expenses:false}};
  const render=(requirements:typeof notice.documentRequirements|null,staff=true)=>renderToStaticMarkup(createElement(NoticeCard,{notice:{...notice,documentRequirements:requirements},meetingId:'m',members:staff?members:undefined}));
  const html=render(notice.documentRequirements);
  assert.match(html,/aria-label="2명 중 1명 제출 완료"/);
  assert.match(html,/참여자 1 · 미제출 서류 있음/);
  assert.match(html,/참여자 2 · 제출 완료/);
  assert.match(html,/activity.csv/);
  assert.match(render({activity:true,expenses:true}),/2명 중 0명 제출 완료/);
  for(const r of [null,{activity:false,expenses:false}]) assert.doesNotMatch(render(r),/제출 완료|activity.csv/);
  assert.doesNotMatch(render(notice.documentRequirements,false),/참여자 2|activity.csv/);
});

test('프로젝트 공지는 대상 모임과 수정 기능을 제공하고 기존 내용을 수정 양식에 보존한다',()=>{
  const notice={id:'n',title:'기존 공지',body:'기존 본문',createdAt:'2026-10-25',version:2,etag:'"n-v2"',documentRequirements:{activity:true,expenses:false},meetings:{m:'첫 모임'}};
  const html=renderToStaticMarkup(createElement(NoticeCard,{notice,onEdit:()=>{},onDelete:()=>{},audience:'첫 모임'}));
  assert.match(html,/대상 모임: 첫 모임/);assert.match(html,/aria-label="공지사항 수정"/);assert.match(html,/aria-label="공지사항 삭제"/);
  const readOnly=renderToStaticMarkup(createElement(NoticeCard,{notice,meetingId:'m'}));
  assert.doesNotMatch(readOnly,/aria-label="공지사항 수정"|aria-label="공지사항 삭제"/);
  const form=renderToStaticMarkup(createElement(NoticeForm,{projectId:'p',initial:notice,selected:notice.meetings,clear:()=>{},onBusy:()=>{},dirty:false,onDirtyChange:()=>{}}));
  assert.match(form,/공지 수정 저장/);assert.match(form,/value="기존 공지"/);assert.match(form,/>기존 본문<\/textarea>/);
  assert.match(form,/name="requireActivity" checked=""/);assert.doesNotMatch(form,/name="requireExpenses" checked=""/);
});

test('프로젝트 제출 공지는 전체 대상 합계를 표시하고 일반 공지는 숨긴다',()=>{
  const notice={id:'n',title:'전체 제출',body:'내용',createdAt:'2026-10-25',documentRequirements:{activity:true,expenses:false}};
  const render=(documentRequirements:typeof notice.documentRequirements|null)=>renderToStaticMarkup(createElement(NoticeCard,{notice:{...notice,documentRequirements},summary:{total:120,completed:93}}));
  assert.match(render(notice.documentRequirements),/120명 중 93명 제출 완료/);
  assert.match(render(notice.documentRequirements),/93\/120명 제출/);
  assert.doesNotMatch(render(null),/120명 중|93\/120명 제출/);
});
