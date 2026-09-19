import test from 'node:test';
import assert from 'node:assert/strict';
import {activityDocuments,hostedMeeting,hostedSchedule,hostedNotice,hostedNoticeContent,hostedNoticeUpdate,hostedProject,hostedProjectTitle,hostedMeetingBatch} from '../adapters/http/input';
import {csv} from '../application/hosted-meetings';

test('활동 서류는 정수 원화·실제 날짜·한도·미정의 필드를 검증하고 지출 없음 허용',()=>{
  const base={content:'활동',outcome:'성과',expenses:[]};
  assert.deepEqual(activityDocuments(base),base);
  const item={date:'2026-10-13',description:'재료',amount:1000};
  assert.equal(activityDocuments({...base,expenses:[item]}).expenses![0].amount,1000);
  for(const expenses of [[{...item,amount:-1}],[{...item,amount:1.5}],[{...item,amount:0}],[{...item,date:'2026-02-30'}],[{...item,date:'2026-99-99'}],Array(21).fill(item),[{...item,amount:100000000},item]]) assert.throws(()=>activityDocuments({...base,expenses}));
  assert.throws(()=>activityDocuments({...base,hostId:'forged'}));
  assert.throws(()=>activityDocuments({...base,content:' '}));
});

test('CSV는 한국어·줄바꿈·쉼표·따옴표를 보존하고 수식 실행 문자열을 무력화',()=>{
  const value=csv([['활동','쉼표,줄\n"따옴표"'],['=SUM(1,2)',' \t@evil'],['-1','+2'],['보통',12000]]);
  assert.ok(value.startsWith('\uFEFF'));
  assert.ok(value.includes('"쉼표,줄\n""따옴표"""'));
  for(const formula of ["'=SUM(1,2)","' \t@evil","'-1","'+2"]) assert.ok(value.includes(formula));
  assert.ok(value.includes('"보통","12000"'));
});


test('주관 모임은 학생 구성만 받고 일정·공지는 별도 입력으로 검증한다',()=>{
  const members=[' A@school.example ','b@school.example'];
  assert.deepEqual(hostedMeeting({title:' 모임 ',studentEmails:members}),{title:'모임',studentEmails:['A@school.example','b@school.example']});
  for(const studentEmails of [[],['a'],['a','A'],Array(5).fill('a')]) assert.throws(()=>hostedMeeting({title:'모임',studentEmails}));
  assert.throws(()=>hostedMeeting({title:'모임',studentEmails:members,date:'2026-10-13'}));
  const id='00000000-0000-0000-0000-000000000001';
  assert.deepEqual(hostedSchedule({date:'2026-10-13',slot:201,placeId:id}),{date:'2026-10-13',slot:201,placeId:id});
  assert.deepEqual(hostedNotice({meetingIds:[id,id],title:' 공지 ',body:' 내용 '}),{meetingIds:[id],title:'공지',body:'내용'});
  for(const meetingIds of [[],['bad'],Array(101).fill(id)]) assert.throws(()=>hostedNotice({meetingIds,title:'공지',body:'내용'}));
  assert.throws(()=>hostedNotice({meetingIds:[id],title:' ',body:'내용'}));
});


test('프로젝트·모임 일괄 입력은 이름·개수·각 모임의 학생 구성과 임의 필드를 검증한다',()=>{
  assert.deepEqual(hostedProject({title:' 프로젝트 '}),{title:'프로젝트',activityType:'general'});
  for(const value of [{title:' '},{title:'가'.repeat(101)},{title:'프로젝트',hostId:'forged'}]) assert.throws(()=>hostedProject(value));
  const meeting={title:'모임',studentEmails:['a@school.example','b@school.example']};
  assert.deepEqual(hostedMeetingBatch({meetings:[meeting,meeting]}),{meetings:[meeting,meeting]});
  assert.equal(hostedMeetingBatch({meetings:Array(20).fill(meeting)}).meetings.length,20);
  for(const meetings of [[],Array(21).fill(meeting),[meeting,{...meeting,studentEmails:['a@school.example']}],[{...meeting,studentEmails:['a@school.example','a@school.example']}],[{...meeting,hostId:'forged'}]]) assert.throws(()=>hostedMeetingBatch({meetings}));
  assert.throws(()=>hostedMeetingBatch({meetings:[meeting],projectId:'forged'}));
});

test('대학 주관 활동 유형은 허용된 값만 받고 기존 요청은 일반으로 유지한다',()=>{
  for(const activityType of ['general','plogging','mentoring','learning']) assert.deepEqual(hostedProject({title:'활동',activityType}),{title:'활동',activityType});
  for(const activityType of ['unknown','toString',null,{},1]) assert.throws(()=>hostedProject({title:'활동',activityType}));
});

test('프로젝트 기본 제목과 제목 수정 입력을 검증한다',()=>{
  for(const [activityType,title] of Object.entries({general:'새 프로젝트',plogging:'플로깅',mentoring:'멘토링',learning:'학습공동체'})) {
    assert.deepEqual(hostedProject({activityType}),{title,activityType});
  }
  assert.deepEqual(hostedProjectTitle({title:' 새 제목 ',previousTitle:'이전 제목'}),{title:'새 제목',previousTitle:'이전 제목'});
  for(const value of [{title:' ',previousTitle:'이전'},{title:'가'.repeat(101),previousTitle:'이전'},{title:'제목'},{title:'제목',previousTitle:'이전',hostId:'forged'}])assert.throws(()=>hostedProjectTitle(value));
});

test('서류별 제출과 공지의 제출 설정은 생략·거짓·빈 목록을 구분한다',()=>{
  assert.deepEqual(activityDocuments({content:'활동',outcome:'성과'}),{content:'활동',outcome:'성과'});
  assert.deepEqual(activityDocuments({expenses:[]}),{expenses:[]});
  for(const value of [{},{content:'내용'},{outcome:'성과'},{expenses:null}])assert.throws(()=>activityDocuments(value));
  const notice={meetingIds:['00000000-0000-0000-0000-000000000001'],title:'안내',body:'본문'};
  for(const documentRequirements of [{activity:true,expenses:false},{activity:false,expenses:true},{activity:false,expenses:false}]) assert.deepEqual(hostedNotice({...notice,documentRequirements}),{...notice,documentRequirements});
  for(const documentRequirements of [null,{},[],{activity:1,expenses:true},{activity:true,expenses:true,extra:true}]) assert.throws(()=>hostedNotice({...notice,documentRequirements}));
});


test('공지 수정은 버전·본문·제출 설정을 검증하고 대상 모임 변조를 거부한다',()=>{
  const input={title:'제목',body:'본문',version:1,documentRequirements:null};
  assert.deepEqual(hostedNoticeUpdate(input),input);
  assert.deepEqual(hostedNoticeUpdate({...input,documentRequirements:{activity:true,expenses:false}}).documentRequirements,{activity:true,expenses:false});
  for(const change of [{version:0},{version:'1'},{title:' '},{body:' '},{documentRequirements:undefined},{meetingIds:[]},{documentRequirements:{activity:true}}]) assert.throws(()=>hostedNoticeUpdate({...input,...change}));
});

test('모임·프로젝트 공지 작성과 수정은 같은 제목·본문 검증을 사용한다',()=>{
  const content={title:' 제목 ',body:' 본문 '};
  const id='00000000-0000-0000-0000-000000000001';
  const parsers=[hostedNoticeContent,(value:Record<string,unknown>)=>hostedNotice({meetingIds:[id],...value}),(value:Record<string,unknown>)=>hostedNoticeUpdate({version:1,documentRequirements:null,...value})];
  for(const parse of parsers) {
    const notice=parse(content);
    assert.equal(notice.title,'제목');assert.equal(notice.body,'본문');
    for(const change of [{title:''},{body:' '},{title:'가'.repeat(101)},{body:'가'.repeat(5001)},{hostId:'forged'}]) assert.throws(()=>parse({...content,...change}));
  }
});
