import AccountControls from '../app/components/account-controls';
import ProfileCards from '../app/components/profile-cards';
import {Slots} from '../app/components/client';
import {LoadFeedback} from '../app/components/client';
import {PageButtons} from '../app/components/client';
import {navigationLinks} from '../app/components/navigation';
import MeetingList from '../app/components/meeting-list';
import MeetingPage from '../app/components/meeting';
import {MeetingCard} from '../app/components/meeting-list';
import NewMeetingForm from '../app/meetings/new/new-meeting-form';
import {HostedMeetingCard} from '../app/components/hosted-meetings';
import {HostedProjectManager,StudentHostedMeetingList} from '../app/components/hosted-meetings';
import {SlotOptions} from '../app/components/slot-options';
import Login from '../app/login/login-form';
import test from 'node:test';
import assert from 'node:assert/strict';
import {dateRange,slotMatchesDate} from '../app/components/calendar';
import {api,RequestError,cursorQuery} from '../app/components/api';
import {reusableSlots,mockImageAvailability,type SavedAvailability} from '../app/components/availability';
import {createElement,isValidElement,type ComponentProps,type ReactElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('조회 피드백은 최초 로딩·기존 내용 유지·프로젝트 전환·실패 재시도를 구분한다',()=>{
  const state={loading:true,data:undefined as unknown,error:undefined as Error|undefined,reload:()=>{}};
  const render=(hasData?:boolean)=>renderToStaticMarkup(createElement(LoadFeedback,{state,hasData}));
  assert.match(render(),/잠시만 기다려주세요/);
  state.data={data:[]};
  assert.equal(render(),'');
  assert.match(render(false),/잠시만 기다려주세요/);
  state.loading=false;state.error=new RequestError('세션 만료',401,'UNAUTHENTICATED');
  const failed=render();
  assert.match(failed,/role="alert"/);
  assert.match(failed,/세션 만료/);
  assert.match(failed,/href="\/login"/);
  assert.match(failed,/다시 불러오기/);
  assert.doesNotMatch(failed,/잠시만 기다려주세요/);
});

test('프로필 화면의 계정 관리는 로그아웃과 탈퇴를 제공',()=>{
  const html=renderToStaticMarkup(createElement(AccountControls));
  assert.match(html,/>로그아웃<\/button>/);
  assert.match(html,/>탈퇴하고 삭제<\/button>/);
});

test('프로필 탭은 패널 관계와 입력 보존을 유지하고 비활성 패널을 숨긴다',()=>{
  const cards=[{id:'availability',label:'가능 시간',content:createElement('input',{name:'time'})},{id:'optional-profile',label:'내 정보',content:createElement('input',{name:'name'})},{id:'account',label:'계정',content:createElement('button',null,'로그아웃')}];
  const html=renderToStaticMarkup(createElement(ProfileCards,{cards}));
  assert.match(html,/role="tablist" aria-label="프로필 기능"/);
  assert.equal((html.match(/role="tabpanel"/g)||[]).length,3);
  assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);
  assert.equal((html.match(/hidden=""/g)||[]).length,2);
  for(const card of cards) {
    assert.ok(html.includes('aria-controls="'+card.id+'"'));
    assert.ok(html.includes('aria-labelledby="'+card.id+'-tab"'));
  }
  assert.doesNotMatch(html,/이전 프로필 카드|다음 프로필 카드|profile-card-track/);
  assert.match(html,/name="time"/);
  assert.match(html,/name="name"/);
  assert.match(html,/로그아웃/);
});

test('시간표는 폼 제출값·선택 상태·시작과 종료 시간·빈 상태를 제공',()=>{
  const slots=Array.from({length:5},(_,day)=>Array.from({length:12},(_,period)=>({slot:(day+1)*100+period+1,startsAt:String(9+period).padStart(2,'0')+':30:00',endsAt:String(10+period).padStart(2,'0')+':20:00'}))).flat();
  const onSelectedChange=()=>{};
  const html=renderToStaticMarkup(createElement(Slots,{slots,selected:[101],onSelectedChange}));
  assert.match(html,/1개 교시 선택됨/);
  assert.match(html,/aria-label="월요일 1교시 09:30~10:20" name="slots" checked="" value="101"/);
  assert.match(html,/<small>09:30–10:20<\/small>/);
  assert.equal((html.match(/요일 전체 선택/g)||[]).length,5);
  assert.equal((html.match(/<small>09:30–10:20<\/small>/g)||[]).length,1);
  assert.equal((html.match(/scope="row"/g)||[]).length,12);
  assert.equal((html.match(/scope="col"/g)||[]).length,6);
  assert.match(html,/금요일 12교시 20:30~21:20/);
  assert.equal((html.match(/name="slots"/g)||[]).length,60);
  assert.equal((html.match(/checked=""/g)||[]).length,1);
  assert.match(renderToStaticMarkup(createElement(Slots,{slots,selected:[],onSelectedChange})),/가능한 교시를 선택해주세요/);
  const fullDay=renderToStaticMarkup(createElement(Slots,{slots,selected:slots.filter(s=>s.slot<200).map(s=>s.slot),onSelectedChange}));
  assert.match(fullDay,/aria-label="월요일 전체 선택" checked=""/);
  assert.doesNotMatch(fullDay,/aria-label="화요일 전체 선택" checked=""/);
  assert.equal((fullDay.match(/name="slots" checked=""/g)||[]).length,12);
  assert.match(renderToStaticMarkup(createElement(Slots,{slots:[],selected:[],onSelectedChange})),/운영 교시가 아직 설정되지 않았습니다/);
});
test('목록 페이지 버튼은 커서 이력·첫/마지막 페이지·화면별 문구를 유지한다',()=>{
  let pages:(string|null)[]=[null];
  const initial=pages;
  const view=(nextCursor?:string|null)=>PageButtons({pages,setPages:update=>{pages=typeof update==='function'?update(pages):update;},nextCursor,labels:['이전 공지','다음 공지']});
  const first=view('cursor-2');
  assert.doesNotMatch(renderToStaticMarkup(first),/이전 공지/);
  first.props.children[1].props.onClick();
  assert.deepEqual(pages,[null,'cursor-2']);
  const middle=view('cursor-3');
  assert.match(renderToStaticMarkup(middle),/이전 공지/);
  assert.match(renderToStaticMarkup(middle),/다음 공지/);
  middle.props.children[1].props.onClick();
  const last=view(null);
  assert.doesNotMatch(renderToStaticMarkup(last),/다음 공지/);
  last.props.children[0].props.onClick();
  assert.deepEqual(pages,[null,'cursor-2']);
  view(null).props.children[0].props.onClick();
  assert.deepEqual(pages,[null]);
  assert.deepEqual(initial,[null]);
  assert.equal(renderToStaticMarkup(view(undefined)),'');
});

test('학기 시간 불러오기는 요일·교시와 실제 시간 일치만 허용하고 원본을 보존',()=>{
  const source:SavedAvailability={termId:'previous',name:'이전 학기',startsOn:'2026-03-01',endsOn:'2026-08-31',slots:[101,102,201,202],termSlots:[
    {slot:101,startsAt:'09:00:00',endsAt:'10:00:00'},
    {slot:102,startsAt:'10:00:00',endsAt:'11:00:00'},
    {slot:201,startsAt:'09:00:00',endsAt:'10:00:00'},
  ]};
  const original=structuredClone(source);
  assert.deepEqual(reusableSlots(source,[
    {slot:101,startsAt:'09:00:00',endsAt:'10:00:00'},
    {slot:102,startsAt:'10:30:00',endsAt:'11:00:00'},
    {slot:202,startsAt:'09:00:00',endsAt:'10:00:00'},
  ]),[101]);
  assert.deepEqual(source,original);
  assert.deepEqual(reusableSlots({...source,slots:[]},source.termSlots),[]);
  assert.deepEqual(reusableSlots(source,[]),[]);
});
test('학교 날짜 경계·28일 상한·학기 범위·교시 요일',()=>{
  assert.deepEqual(dateRange('Asia/Seoul','2026-09-01','2026-12-31',new Date('2026-10-03T16:00:00Z')),{min:'2026-10-04',max:'2026-11-01'});
  assert.deepEqual(dateRange('UTC','2026-10-10','2026-10-20',new Date('2026-10-03T16:00:00Z')),{min:'2026-10-10',max:'2026-10-20'});
  assert.equal(slotMatchesDate('2026-10-04',701),true);assert.equal(slotMatchesDate('2026-10-04',101),false);
});
test('화면 API는 매 변경 CSRF를 갱신하고 ETag·본문·no-store·오류를 보존',async()=>{
  const original=globalThis.fetch;const calls:{url:string,init?:RequestInit}[]=[];
  try {
    globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return String(url).endsWith('/csrf')?Response.json({csrfToken:'synthetic-csrf'}):new Response(null,{status:204});};
    await api('meetings/test/confirmation',{method:'PUT',body:{slot:601},etag:'"v2"'});
    assert.equal(calls.length,2);assert.equal(calls[0].init?.cache,'no-store');
    assert.deepEqual(calls[1].init?.headers,{'X-CSRF-Token':'synthetic-csrf','Content-Type':'application/json','If-Match':'"v2"'});
    assert.equal(calls[1].init?.body,'{"slot":601}');assert.equal(calls[1].init?.credentials,'same-origin');
    globalThis.fetch=async()=>Response.json({error:{message:'다시 조회',code:'VERSION_CONFLICT'}},{status:412,headers:{'retry-after':'60'}});
    await assert.rejects(api('meetings/test'),(e:unknown)=>e instanceof RequestError && e.status===412 && e.code==='VERSION_CONFLICT' && e.retryAfter===60);
    calls.length=0;globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({error:{message:'인증 실패',code:'CSRF_INVALID'}},{status:403});};
    await assert.rejects(api('me',{method:'PATCH',body:{}}));assert.equal(calls.length,1);
    await assert.rejects(api('me',{method:'PATCH',body:{}}),(e:unknown)=>e instanceof RequestError && e.status===403 && e.code==='CSRF_INVALID' && e.message==='인증 실패');
    calls.length=0;
    const controller=new AbortController();
    globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({data:[{id:'synthetic'}],nextCursor:'next-page'},{headers:{etag:'"v3"'}});};
    assert.deepEqual(await api('meetings',{signal:controller.signal}),{data:[{id:'synthetic'}],etag:'"v3"',nextCursor:'next-page'});
    assert.equal(calls.length,1);assert.equal(calls[0].init?.signal,controller.signal);assert.equal(calls[0].init?.body,undefined);
    globalThis.fetch=async()=>Response.json({}, {status:500});
    await assert.rejects(api('me'),(e:unknown)=>e instanceof RequestError && e.code==='INTERNAL_ERROR' && e.message==='요청에 실패했습니다.');
    await assert.rejects(api('me',{method:'PATCH',body:{}}),(e:unknown)=>e instanceof RequestError && e.message==='인증 확인에 실패했습니다.');
  }finally{globalThis.fetch=original;}
});

test('하단 메뉴는 계정 유형을 구분하고 상세·개설 화면에서 하나의 메뉴만 활성화한다',()=>{
  for(const [institution,cases] of [
    [false,[['/meetings','/meetings'],['/meetings/123','/meetings'],['/meetings/new','/meetings/new'],['/meetings/manage','/meetings/manage'],['/meetings/manage/123','/meetings/manage'],['/meetings/institution/123','/meetings/institution'],['/profile','/profile']]],
    [true,[['/institutions','/institutions'],['/institutions/meetings/123','/institutions/meetings'],['/institutions/settings','/institutions/settings']]]
  ] as const) {
    for(const [path,expected] of cases) {
      const links=navigationLinks(path,institution);
      assert.deepEqual(links.filter(link=>link.active).map(link=>link.href),[expected]);
      assert.ok(links.every(link=>institution?link.href.startsWith('/institutions'):!link.href.startsWith('/institutions')));
    }
  }
  const links=navigationLinks('/meetings/manage',false);
  assert.equal(links[links.findIndex(link=>link.label==='모임 열기')+1].label,'모임 관리');
  for(const institution of [false,true]) {
    const profile=navigationLinks(institution?'/institutions/settings':'/profile',institution).filter(link=>link.icon==='profile');
    assert.equal(profile.length,1);
    assert.equal(profile[0].label,'프로필');
    assert.equal(profile[0].active,true);
  }
  assert.equal(navigationLinks('/privacy',false).filter(link=>link.active).length,0);
  assert.equal(navigationLinks('/meetings-new',false).filter(link=>link.active).length,0);
});

test('모임 찾기·관리 화면은 탐색 필터와 관리 안내를 구분한다',()=>{
  const html=renderToStaticMarkup(createElement(MeetingList,{managed:true}));
  assert.match(html,/>모임 관리<\/h1>/);
  assert.match(html,/>내 모임<\/h2>/);
  assert.match(html,/내가 열거나 참여 중인 모임/);
  assert.doesNotMatch(html,/<form|어떤 모임을 찾으세요|내 가능 시간과 겹치는 모임만|href="\/meetings\/new"/);
  const discovery=renderToStaticMarkup(createElement(MeetingList));
  assert.match(discovery,/>모임 찾기<\/h1>/);
  assert.match(discovery,/>열린 모임<\/h2>/);
  assert.match(discovery,/discovery-type-filters/);
  assert.equal((discovery.match(/type="radio"/g)||[]).length,4);
  assert.doesNotMatch(discovery,/<form|type="search"|name="topic"|name="overlap"|내 가능 시간과 겹치는 모임만/);
  assert.doesNotMatch(discovery,/href="\/meetings\/new"/);
  assert.match(renderToStaticMarkup(createElement(MeetingPage,{id:'test',managed:true})),/href="\/meetings\/manage"/);
  assert.match(renderToStaticMarkup(createElement(MeetingPage,{id:'test'})),/href="\/meetings"/);
});

test('모임 카드는 원형 인원·참여 가능 표면·카드 상세 링크를 제공한다',()=>{
  const meeting={id:'example',topic:'함께 공부하기',type:'study',place:{id:'place',name:'공개 장소'},expiresAt:'2026-12-01T00:00:00Z',version:1,capacity:4,memberCount:2,state:'undecided',confirmation:null,overlapsMyAvailability:true,canJoin:true,isMember:false};
  const view=(overrides:Partial<ComponentProps<typeof MeetingCard>['meeting']>={},managed=false)=>renderToStaticMarkup(createElement(MeetingCard,{meeting:{...meeting,...overrides},managed}));
  const html=view();
  assert.match(html,/모각공/);
  assert.match(html,/aria-label="정원 4명 중 2명 참여"/);
  assert.equal((html.match(/<i /g)||[]).length,4);
  assert.equal((html.match(/class="filled"/g)||[]).length,2);
  assert.equal((html.match(/<a /g)||[]).length,1);
  assert.match(html,/class="meeting-card-link" href="\/meetings\/example"/);
  assert.doesNotMatch(html,/data-inactive|참여 가능|내 시간과 겹|모임 보기|meeting-card-action|참여 2\/4명/);
  for(const overrides of [{overlapsMyAvailability:false},{canJoin:false},{memberCount:4,canJoin:false},{state:'proposing',canJoin:false}]) {
    const inactive=view(overrides);
    assert.match(inactive,/data-inactive="true"/);
    assert.match(inactive,/href="\/meetings\/example"/);
    assert.match(inactive,/참여 불가/);
    assert.doesNotMatch(inactive,/aria-disabled|disabled=/);
  }
  const managed=view({state:'confirmed',confirmation:{date:'2026-10-19',slot:101,source:'intersection'},canJoin:false},true);
  assert.match(managed,/2026-10-19/);
  assert.match(managed,/href="\/meetings\/manage\/example"/);
  assert.match(managed,/함께 공부하기 모임 관리/);
  assert.doesNotMatch(managed,/data-inactive|data-availability/);
});

test('개설 카드는 제목·장소를 직접 입력하고 시간 미정 개설을 유지한다',()=>{
  const html=renderToStaticMarkup(createElement(NewMeetingForm,{config:{school:null,term:{id:'term',startsOn:'2026-09-01',endsOn:'2026-12-31',slots:[]},places:[{id:'public',name:'공개 장소'}],registrationAvailable:false,privacyVersion:null,privacyNotice:null}}));
  assert.equal((html.match(/<form /g)||[]).length,1);
  assert.match(html,/class="meeting-card new-meeting-card"/);
  assert.doesNotMatch(html,/<details|<summary/);
  assert.match(html,/popoverTarget="new-schedule-help"/i);
  assert.match(html,/id="new-schedule-help"[^>]*popover="auto"/);
  assert.match(html,/2명 · 2인 모임 명시 선택/);
  for(const label of ['모임 유형 선택: 모각공','인원 선택: 정원 3명','모임 제목','장소를 선택해주세요','일정 미정']) assert.ok(html.includes(label));
  assert.match(html,/<div class="new-topic"><label[^>]*>모임 제목<\/label><input/);
  assert.match(html,/<div class="new-place"><label[^>]*>장소<\/label><select/);
  assert.match(html,/aria-describedby="new-place-help"/);
  assert.match(html,/정원 3명 중 1명 참여/);
  assert.match(html,/참여자가 모이면 모임 관리에서/);
  assert.doesNotMatch(html,/type="date"|name="slot"/);
  for(const name of ['topic','type','place']) assert.ok(html.includes('name="'+name+'"'));
  assert.match(html,/<select name="type"[^>]*required=""/);
  assert.match(html,/<option value="study" selected="">모각공/);
  assert.match(html,/<option value="3" selected="">3명 · 기본/);
  assert.doesNotMatch(html,/name="two"/);
  assert.match(html,/<button class="button primary" type="submit">모임 열기/);
});

test('주관 모임 카드는 역할별 서류 공개·목적지·공지 선택을 유지한다',()=>{
  const meeting={id:'hosted',title:'주관 모임 예시',projectTitle:'프로젝트 예시',date:null,slot:null,place:null,capacity:4,memberCount:3,submittedCount:2,isMember:true};
  const render=(props:Partial<ComponentProps<typeof HostedMeetingCard>>)=>renderToStaticMarkup(createElement(HostedMeetingCard,{meeting,...props}));
  const student=render({});
  assert.match(student,/meeting-card/);
  assert.match(student,/활동 일정 미정/);
  assert.match(student,/aria-label="정원 4명 중 3명 참여"/);
  assert.equal((student.match(/class="filled"/g)||[]).length,3);
  assert.equal((student.match(/<a /g)||[]).length,1);
  assert.doesNotMatch(student,/meeting-card-action|모임 보기/);
  assert.match(student,/href="\/meetings\/institution\/hosted"/);
  assert.doesNotMatch(student,/서류 2\/3|미제출 1명|공지 대상 선택/);
  const staff=render({institution:true,selecting:true,selected:true,busy:true});
  assert.match(staff,/href="\/institutions\/meetings\/hosted"/);
  assert.match(staff,/서류 2\/3/);
  assert.match(staff,/미제출 1명/);
  assert.match(staff,/type="checkbox" disabled="" aria-label="주관 모임 예시 공지 대상 선택" checked=""/);
  assert.match(render({institution:true,meeting:{...meeting,date:'2026-10-19',slot:101,place:'공개 장소'}}),/2026-10-19/);
  let selected;
  const card=HostedMeetingCard({meeting,institution:true,selecting:true,onSelect:value=>{selected=value;}});
  type InputElement=ReactElement<{children?:ReactNode;onChange?:(event:{target:{checked:boolean}})=>void}>;
  const findInput=(node:ReactNode):InputElement|undefined=>Array.isArray(node)?node.map(findInput).find(Boolean):isValidElement<InputElement['props']>(node)?node.type==='input'?node:findInput(node.props.children):undefined;
  const input=findInput(card);
  assert.ok(input?.props.onChange);
  input.props.onChange({target:{checked:true}});
  assert.equal(selected,true);
});

test('이미지 목업은 고정 예시 수업을 제외한 운영 교시만 선택하고 원본을 보존',()=>{
  const slots=[101,102,103,112,203,204,205,512].map(slot=>({slot,startsAt:'09:30:00',endsAt:'10:20:00'}));
  const original=structuredClone(slots);
  assert.deepEqual(mockImageAvailability(slots),[103,112,205,512]);
  assert.deepEqual(slots,original);
  assert.deepEqual(mockImageAvailability([]),[]);
});


test('담당자 주관 모임은 프로젝트 탐색과 목록을 나누고 등록·공지 양식을 처음부터 노출하지 않는다',()=>{
  const html=renderToStaticMarkup(createElement(HostedProjectManager));
  assert.match(html,/aria-label="프로젝트 선택"/);
  assert.match(html,/aria-label="프로젝트 모임 관리"/);
  assert.match(html,/aria-current="true"/);
  assert.match(html,/새 프로젝트/);
  assert.doesNotMatch(html,/<form|name="studentEmails"|id="notice-body"/);
  const student=renderToStaticMarkup(createElement(StudentHostedMeetingList));
  assert.match(student,/대학 주관 모임/);
  assert.doesNotMatch(student,/프로젝트 선택|새 프로젝트|공지 보내기/);
});

test('커서는 빈 값과 예약 문자를 보존하고 다른 검색 조건과 결합한다',()=>{
  for(const cursor of [undefined,null,'']) assert.equal(cursorQuery(cursor).toString(),'');
  const cursor='a+/= &?#한글';
  const query=cursorQuery(cursor);query.set('topic','SQL');
  assert.equal(new URLSearchParams(query.toString()).get('cursor'),cursor);
  assert.equal(query.get('topic'),'SQL');
});

test('교시 옵션은 날짜의 요일·빈 날짜의 화면별 동작·시간 표시를 유지한다',()=>{
  const slots=[101,201].map(slot=>({slot,startsAt:'09:30:00',endsAt:'10:20:00'}));
  const render=(props:Omit<ComponentProps<typeof SlotOptions>,'slots'>&{slots?:ComponentProps<typeof SlotOptions>['slots']})=>renderToStaticMarkup(createElement(SlotOptions,{slots,...props}));
  const monday=render({date:'2026-10-12'});
  assert.match(monday,/월요일 1교시 · 09:30~10:20/);
  assert.doesNotMatch(monday,/화요일/);
  assert.equal(render({date:''}),'');
  assert.equal((render({date:'',allowUndated:true}).match(/<option/g)||[]).length,2);
  assert.equal(render({date:'invalid'}),'');
  assert.equal(render({slots:[],date:'2026-10-12'}),'');
});


test('로그인은 현재 단계와 상시 라벨을 제공하며 설정 조회 중 인증 폼을 노출하지 않는다',()=>{
  const html=renderToStaticMarkup(createElement(Login));
  assert.match(html,/aria-label="로그인 단계"/);
  assert.match(html,/<li aria-current="step">/);
  assert.match(html,/학교 이메일로 시작해요/);
  assert.doesNotMatch(html,/<form|id="code"/);
});
