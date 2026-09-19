'use client';
import Popup,{PopupDialog} from './popup';
import type {DocumentsInput} from '../../../shared/activity-documents';
import {useCallback,useRef,useState} from 'react';
import {api,loadAccountContext,cursorQuery,useData,useApiData,usePages,usePaginatedData,PageButtons,Form,Heading,LoadFeedback,slotLabel,type Config,type Me} from './client';
import {dateRange} from './calendar';
import {DateSlotFields} from './date-slot-fields';
import {MeetingCardFrame} from './meeting-card';

type Documents=DocumentsInput&{submittedAt:string;updatedAt:string;etag:string};
type HostedProject={id:string;title:string;meetingCount:number;expiresAt:string};
export type HostedMeetingSummary={id:string;title:string;projectId?:string;projectTitle?:string;date:string|null;slot:number|null;place:string|null;capacity:number;memberCount:number;isMember:boolean;submittedCount?:number};
type HostedMeeting=HostedMeetingSummary&{placeId:string|null;term:NonNullable<Config['term']>;etag:string;canSchedule:boolean;canSubmit:boolean;expiresAt:string;myDocuments:Documents|null};
type InstitutionHostedMeeting=HostedMeeting&{members:{userId:string;memberNo:number;documents:Documents|null}[]};

const base=(institution:boolean)=>institution?'/institutions/meetings':'/meetings/institution';
const scheduleLabel=(m:HostedMeetingSummary)=>m.date&&m.slot?`${m.date} · ${slotLabel(m.slot)}`:'활동 일정 미정';

export function HostedProjectManager() {
  const [project,setProject]=useState<HostedProject|null>(null);
  const {pages,setPages,cursor,reset:resetPages}=usePages();
  const [projectRevision,setProjectRevision]=useState(0);
  const [selecting,setSelecting]=useState(false);
  const [editor,setEditor]=useState<'meetings'|'notice'|null>(null);
  const adding=editor==='meetings',composing=editor==='notice',editing=editor!==null;
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selected,setSelected]=useState<Record<string,string>>({});
  const projectId=project?.id;
  const config=useApiData<Config>('configuration');
  const load=useCallback(async(signal:AbortSignal)=>{
    const query=cursorQuery(cursor);if(projectId)query.set('projectId',projectId);
    const meetings=await api<HostedMeetingSummary[]>(`hosted-meetings?${query}`,{signal});
    return {meetings:meetings.data,nextCursor:meetings.nextCursor,projectId};
  },[cursor,projectId]);
  const state=useData(load),d=state.data;
  // Do not show the previous project's rows while the new selection loads.
  const current=d?.projectId===projectId?d:undefined;
  function select(p:HostedProject|null) {
    if(busy||p?.id===projectId)return;
    if(dirty&&!window.confirm('저장하지 않은 입력이 있습니다. 입력을 버리고 프로젝트를 이동할까요?'))return;
    setProject(p);resetPages();setSelected({});setSelecting(false);setEditor(null);setDirty(false);setMessage('');
  }
  function closeEditor() {
    if(dirty&&!window.confirm('저장하지 않은 입력을 버리고 닫을까요?'))return;
    setEditor(null);setDirty(false);
  }
  function created(count:number) {
    setEditor(null);setMessage(`${count}개 모임을 등록했습니다.`);resetPages();state.reload();setProjectRevision(v=>v+1);
  }
  return <div className="hosted-manager"><Heading title="주관 모임" description="프로젝트별로 모임을 구성하고, 공지와 제출 서류를 관리하세요."/>
    <LoadFeedback state={config}/>
    <div className="project-workspace">
      <ProjectSidebar selected={project} select={select} enabled={config.data?Boolean(config.data.data.term):undefined} revision={projectRevision} busy={busy} editing={editing}/>
      <section className="project-content" aria-label="프로젝트 모임 관리" aria-busy={state.loading}>
        <header className="project-content-heading"><div><p className="school-label">{project?'선택한 프로젝트':'전체 프로젝트'}</p><h2>{project?.title??'전체 모임'}</h2><p className="help">{project?'모임을 선택하면 일정과 참여 학생의 제출 서류를 확인할 수 있습니다.':'프로젝트를 선택하면 소속 모임을 조회하고 새 모임을 등록할 수 있습니다.'}</p></div>
          {project&&<button className="button primary" disabled={busy||composing} aria-haspopup="dialog" onClick={()=>setEditor('meetings')}>모임 등록</button>}
        </header>
        {message&&<p className="feedback success-message" role="status">{message}</p>}
        {adding&&project&&<PopupDialog title="모임 일괄 등록" open onClose={()=>{if(!busy)closeEditor();}}><CreateHostedMeetings projectId={project.id} done={created} onBusy={setBusy} dirty={dirty} onDirtyChange={setDirty}/></PopupDialog>}
        <div className="project-toolbar"><h3>소속 모임{current&&<span className="help"> · 이 페이지 {current.meetings.length}개</span>}</h3><div className="project-toolbar-actions">
          <button className="button" disabled={busy||editing||!current?.meetings.length} aria-pressed={selecting} onClick={()=>{setSelecting(!selecting);setSelected({});}}>{selecting?'선택 취소':'공지 보내기'}</button>
          <button className="text-button" disabled={state.loading||busy} onClick={()=>{state.reload();setProjectRevision(v=>v+1);}}>새로고침</button>
        </div></div>
        {selecting&&<div className="notice-selection"><p role="status">{Object.keys(selected).length}개 모임 선택</p><button className="button primary" disabled={!Object.keys(selected).length||busy||editing} onClick={()=>setEditor('notice')}>공지 작성</button></div>}
        <LoadFeedback state={state} hasData={Boolean(current)}/>
        {current&&<>{current.meetings.length===0?<div className="project-empty"><h3>{project?'아직 등록한 모임이 없습니다':'등록된 모임이 없습니다'}</h3><p>{project?'모임 이름과 학생 구성을 입력해 첫 모임을 등록하세요.':'새 프로젝트를 만든 뒤 모임 이름과 학생 구성을 등록하세요.'}</p>{project&&!adding&&<button className="button primary" onClick={()=>setEditor('meetings')}>첫 모임 등록</button>}</div>:<ul className="meetings">{current.meetings.map(m=><HostedMeetingCard key={m.id} meeting={m} institution busy={busy} selecting={selecting} selected={Boolean(selected[m.id])} onSelect={checked=>setSelected(value=>{const next={...value};if(checked)next[m.id]=m.title;else delete next[m.id];return next;})}/>)}</ul>}
          <div className="pagination"><PageButtons pages={pages} setPages={setPages} nextCursor={current.nextCursor}/></div></>}
        {composing&&<PopupDialog title="선택한 모임에 공지" open onClose={()=>{if(!busy)closeEditor();}}><NoticeForm selected={selected} onBusy={setBusy} dirty={dirty} onDirtyChange={setDirty} clear={()=>{setSelected({});setSelecting(false);setEditor(null);setMessage('선택한 모임에 공지를 게시했습니다.');}}/></PopupDialog>}
      </section>
    </div>
  </div>;
}

function ProjectSidebar({selected,select,enabled,revision,busy,editing}:{selected:HostedProject|null;select:(p:HostedProject|null)=>void;enabled:boolean|undefined;revision:number;busy:boolean;editing:boolean}) {
  const [creating,setCreating]=useState(false);
  const title=useRef('');

  const state=usePaginatedData<HostedProject>('hosted-projects',revision);
  return <aside className="project-sidebar" aria-labelledby="projects-title"><div className="project-sidebar-heading"><h2 id="projects-title">프로젝트</h2><button className="text-button" disabled={!enabled||busy||editing} aria-haspopup="dialog" onClick={()=>setCreating(true)}>+ 새 프로젝트</button></div>
    {creating&&<PopupDialog title="새 프로젝트" open onClose={()=>setCreating(false)}><Form dirtyGuard label="프로젝트 생성" submit={async f=>{
      const {data}=await api<HostedProject>('hosted-projects',{method:'POST',body:{title:String(f.get('title'))}});select(data);state.reset();state.reload();setCreating(false);title.current='';
    }}><label htmlFor="project-title">프로젝트 이름</label><input id="project-title" name="title" maxLength={100} required defaultValue={title.current} onChange={e=>{title.current=e.target.value;}} autoFocus placeholder="예: 2026 가을 학습 지원"/></Form></PopupDialog>}
    {enabled===false&&<p className="help">학교 학기가 설정되면 프로젝트를 만들 수 있습니다.</p>}
    <LoadFeedback state={state}/>
    <nav className="project-navigation" aria-label="프로젝트 선택"><button className="project-option" disabled={busy} aria-current={!selected?'true':undefined} onClick={()=>select(null)}><span>전체 모임</span><span aria-hidden="true">{!selected?'✓':'→'}</span></button>
      {state.data?.data.map(p=><button className="project-option" title={p.title} key={p.id} disabled={busy} aria-current={selected?.id===p.id?'true':undefined} onClick={()=>select(p)}><span className="project-option-copy"><span className="project-name">{p.title}</span><small>{p.meetingCount}개 모임</small></span><span aria-hidden="true">{selected?.id===p.id?'✓':'→'}</span></button>)}
    </nav>
    {state.data?.data.length===0&&<p className="project-sidebar-empty">학습 지원·활동 프로그램별로 프로젝트를 만들어 모임을 묶어보세요.</p>}
    <div className="pagination"><PageButtons {...state} nextCursor={state.data?.nextCursor}/></div>
  </aside>;
}

export function HostedMeetingCard({meeting:m,institution=false,busy=false,selecting=false,selected=false,onSelect}:{meeting:HostedMeetingSummary;institution?:boolean;busy?:boolean;selecting?:boolean;selected?:boolean;onSelect?:(checked:boolean)=>void}) {
  const href=`${base(institution)}/${m.id}`;
  return <MeetingCardFrame title={m.title} href={href} badge="대학 주관" capacity={m.capacity} memberCount={m.memberCount} place={m.place??'학생이 일정·장소 설정'} schedule={scheduleLabel(m)}
    selection={selecting&&<label className="hosted-card-select"><input type="checkbox" disabled={busy} aria-label={`${m.title} 공지 대상 선택`} checked={selected} onChange={e=>onSelect?.(e.target.checked)}/>공지 대상</label>}
    footer={institution&&<div className="meeting-card-footer"><div><p className="hosted-document-status">서류 {m.submittedCount??0}/{m.memberCount}</p><p className="help">{m.memberCount===0?'참여 학생 없음':m.submittedCount===m.memberCount?'제출 완료':`미제출 ${m.memberCount-(m.submittedCount??0)}명`}</p></div></div>}>
    {m.projectTitle?<p className="help">프로젝트: {m.projectTitle}</p>:institution&&<p className="help">프로젝트 미지정</p>}
  </MeetingCardFrame>;
}

function CreateHostedMeetings({projectId,done,onBusy,dirty,onDirtyChange}:{projectId:string;done:(count:number)=>void;onBusy:(busy:boolean)=>void;dirty:boolean;onDirtyChange:(dirty:boolean)=>void}) {
  const [rows,setRows]=useState([0]);
  return <Form dirtyGuard dirty={dirty} onDirtyChange={onDirtyChange} onBusy={onBusy} label={`${rows.length}개 모임 한 번에 등록`} submit={async f=>{
    const meetings=rows.map(id=>({title:String(f.get(`title-${id}`)),studentEmails:String(f.get(`students-${id}`)).split(/[\s,;]+/).filter(Boolean)}));
    await api(`hosted-projects/${projectId}/meetings`,{method:'POST',body:{meetings}});done(meetings.length);
  }}><p className="help" id="batch-students-help">모임마다 가입한 학생 2~4명의 학교 이메일을 쉼표나 줄바꿈으로 구분하세요. 최대 20개까지 등록하며, 일정과 장소는 학생이 정합니다. 잘못된 입력이 있으면 전체 등록을 취소하고 입력을 유지합니다.</p>
    {rows.map((id,index)=><fieldset className="batch-meeting-row vertical-card" key={id}><legend>모임 {index+1}</legend>
      <div><label htmlFor={`hosted-title-${id}`}>모임 이름</label><input id={`hosted-title-${id}`} name={`title-${id}`} maxLength={100} required autoFocus={index===0}/></div>
      <div><label htmlFor={`hosted-students-${id}`}>학생 이메일 · 2~4명</label><textarea id={`hosted-students-${id}`} name={`students-${id}`} required maxLength={1100} aria-describedby="batch-students-help" rows={2} placeholder="student1@school.ac.kr, student2@school.ac.kr"/></div>
      <button className="text-button" type="button" disabled={rows.length===1} onClick={()=>setRows(current=>current.filter(row=>row!==id))}>모임 {index+1} 입력 삭제</button>
    </fieldset>)}
    <button className="button" type="button" disabled={rows.length>=20} onClick={()=>setRows(current=>[...current,Math.max(...current)+1])}>모임 입력 추가</button>
  </Form>;
}

function NoticeForm({selected,clear,onBusy,dirty,onDirtyChange}:{selected:Record<string,string>;clear:()=>void;onBusy:(busy:boolean)=>void;dirty:boolean;onDirtyChange:(dirty:boolean)=>void}) {
  const meetingIds=Object.keys(selected);
  return <Form dirtyGuard dirty={dirty} onDirtyChange={onDirtyChange} onBusy={onBusy} label="선택한 모임에 공지 게시" disabled={!meetingIds.length} submit={async f=>{
    await api('hosted-meetings/notices',{method:'POST',body:{meetingIds,title:String(f.get('title')),body:String(f.get('body'))}});clear();
  }}><p role="status">{meetingIds.length?`선택한 모임 ${meetingIds.length}개: ${Object.values(selected).join(', ')}`:'위 목록에서 공지를 받을 모임을 선택하세요. 페이지를 이동해도 선택은 유지됩니다.'}</p>
    <label htmlFor="notice-title">공지 제목</label><input id="notice-title" name="title" required maxLength={100} autoFocus/>
    <label htmlFor="notice-body">공지 내용</label><textarea id="notice-body" name="body" required maxLength={5000}/>
  </Form>;
}

function ScheduleForm({meeting,c,reload}:{meeting:HostedMeeting;c:Config;reload:()=>void}) {
  const range=dateRange(c.school!.timezone,meeting.term.startsOn,meeting.term.endsOn);
  return <section className="detail-section vertical-card"><h2>활동일·장소 설정</h2><Form dirtyGuard label="활동 일정·장소 저장" onConflict={reload} submit={async f=>{
    await api(`hosted-meetings/${meeting.id}/schedule`,{method:'PUT',body:{date:String(f.get('date')),slot:Number(f.get('slot')),placeId:String(f.get('placeId'))},etag:meeting.etag});reload();
  }}><p className="help">배정된 학생 누구나 설정할 수 있습니다. 서류 제출 후에는 변경할 수 없습니다.</p>
    <DateSlotFields prefix="hosted" range={range} slots={meeting.term.slots} initialDate={meeting.date??range.min} initialSlot={meeting.slot??''} dateLabel="활동일" slotLabel="활동 교시"/>
    <label htmlFor="hosted-place">공개 장소</label><select id="hosted-place" name="placeId" required defaultValue={meeting.placeId??''}><option value="" disabled>장소 선택</option>{c.places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
  </Form></section>;
}

type Notice={id:string;title:string;body:string;createdAt:string};
function Notices({id}:{id:string}) {
  const state=usePaginatedData<Notice>(`hosted-meetings/${id}/notices`);
  return <section className="detail-section vertical-card"><div className="section-heading"><h2>공지사항</h2><button className="button" onClick={state.reload} disabled={state.loading}>공지 새로고침</button></div><LoadFeedback state={state}/>{state.data&&<>{state.data.data.length===0?<p>게시된 공지사항이 없습니다.</p>:state.data.data.map(n=><article className="submission-record" key={n.id}><h3>{n.title}</h3><p className="help">{new Date(n.createdAt).toLocaleString('ko-KR')}</p><p className="document-text">{n.body}</p></article>)}<div className="pagination"><PageButtons {...state} nextCursor={state.data.nextCursor} labels={['이전 공지','다음 공지']}/></div></>}</section>;
}

export function HostedMeetingDetail({id,institution=false}:{id:string;institution?:boolean}) {
  const load=useCallback(async(signal:AbortSignal)=>{
    const [m,context]=await Promise.all([api<HostedMeeting|InstitutionHostedMeeting>(`hosted-meetings/${id}`,{signal}),institution?null:loadAccountContext(signal)]);
    return {m:m.data,me:context?.me,c:context?.c};
  },[id,institution]);
  const state=useData(load),d=state.data;
  return <><LoadFeedback state={state}/>{d&&<>
    <Heading title={d.m.title} description={`${scheduleLabel(d.m)} · ${d.m.place??'장소 미정'}`}/>
    <section className="time-banner"><span className="badge">대학 주관</span><h2>활동 안내</h2>{d.m.projectTitle&&<p>프로젝트: {d.m.projectTitle}</p>}<p>학생 {d.m.memberCount}/{d.m.capacity}명 · 자료 보관 만료: {new Date(d.m.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p><p className="help">활동 서류는 제출한 본인과 주관 담당자만 확인합니다. 연락처·계좌번호 등 불필요한 개인정보를 작성하지 마세요.</p></section>
    <Notices id={id}/>
    {institution
      ? 'members' in d.m&&<InstitutionDocuments meeting={d.m} loading={state.loading} reload={state.reload}/>
      : <StudentDocuments meeting={d.m} c={d.c!} me={d.me} reload={state.reload}/>}
  </>}</>;
}

function StudentDocuments({meeting,c,me,reload}:{meeting:HostedMeeting;c:Config;me?:Me;reload:()=>void}) {
  if(!meeting.isMember)return null;
  return <>
    {meeting.canSchedule&&c.school&&<ScheduleForm meeting={meeting} c={c} reload={reload}/>}
    <section className="detail-section vertical-card"><h2>활동 서류 제출</h2>{meeting.myDocuments&&me&&<DocumentView meetingId={meeting.id} userId={me.id} documents={meeting.myDocuments}/>}<ReportForm meeting={meeting} reload={reload}/></section><Popup className="account-controls" title="참여 취소"><Form danger label="참여 취소·서류 삭제" submit={async f=>{await api(`hosted-meetings/${meeting.id}/members/me`,{method:'DELETE',body:{confirmWithdrawal:f.get('confirm')==='on'}});return '/meetings/manage';}}><label className="check-line"><input type="checkbox" name="confirm" required/>참여와 제출 서류를 함께 삭제합니다.</label></Form></Popup>
  </>;
}

function InstitutionDocuments({meeting,loading,reload}:{meeting:InstitutionHostedMeeting;loading:boolean;reload:()=>void}) {
  return <><section className="detail-section vertical-card"><div className="section-heading"><h2>제출 현황</h2><button className="button" onClick={reload} disabled={loading}>새로고침</button></div><p className="help">{meeting.members.filter(m=>m.documents).length}/{meeting.memberCount}명 제출 · 사용 내역 수신 기능이며 지급·정산 기능은 아닙니다.</p>{meeting.members.length===0&&<p>아직 참여 학생이 없습니다.</p>}{meeting.members.map(member=><article className="submission-record" key={member.userId}><h3>참여자 {member.memberNo} · {member.documents?'제출 완료':'미제출'}</h3>{member.documents&&<DocumentView meetingId={meeting.id} userId={member.userId} documents={member.documents}/>}</article>)}</section>
    <Popup className="account-controls" title="주관 모임 삭제"><Form danger label="주관 모임·전체 서류 삭제" submit={async f=>{await api(`hosted-meetings/${meeting.id}`,{method:'DELETE',body:{confirmDeletion:f.get('confirm')==='on'}});return base(true);}}><label className="check-line"><input type="checkbox" name="confirm" required/>모임과 모든 참여·공지·제출 서류를 함께 삭제합니다. 삭제 후 되돌릴 수 없습니다.</label></Form></Popup>
  </>;
}

function DocumentView({meetingId,userId,documents}:{meetingId:string;userId:string;documents:Documents}) {
  const url=`/api/v1/hosted-meetings/${meetingId}/documents/${userId}`;
  return <div className="document-view"><p className="help">최초 제출 {new Date(documents.submittedAt).toLocaleString('ko-KR')} · 최종 수정 {new Date(documents.updatedAt).toLocaleString('ko-KR')}</p>
    <Popup title="활동 보고서·사용 내역 보기"><h3>활동 내용</h3><p className="document-text">{documents.content}</p><h3>활동 성과</h3><p className="document-text">{documents.outcome}</p><h3>활동비 사용 내역</h3>{documents.expenses.length===0?<p>지출 없음</p>:<ul className="expense-items">{documents.expenses.map((e,i)=><li key={i}><span>{e.date} · {e.description}</span><strong>{e.amount.toLocaleString('ko-KR')}원</strong></li>)}</ul>}<p><strong>합계 {documents.expenses.reduce((n,e)=>n+e.amount,0).toLocaleString('ko-KR')}원</strong></p></Popup>
    <div className="form-actions"><a className="button" href={`${url}/activity.csv`} download>활동 보고서 CSV</a><a className="button" href={`${url}/expenses.csv`} download>사용 내역서 CSV</a></div>
  </div>;
}

function ReportForm({meeting,reload}:{meeting:HostedMeeting;reload:()=>void}) {
  const [expenses,setExpenses]=useState((meeting.myDocuments?.expenses??[]).map(e=>({...e,amount:String(e.amount)})));
  function change(index:number,key:'date'|'description'|'amount',value:string) {setExpenses(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));}
  return <Form dirtyGuard disabled={!meeting.canSubmit} label={meeting.myDocuments?'서류 수정 제출':'보고서·사용 내역서 제출'} onConflict={reload} submit={async f=>{
    await api(`hosted-meetings/${meeting.id}/documents/me`,{method:'PUT',body:{content:String(f.get('content')),outcome:String(f.get('outcome')),expenses:expenses.map(e=>({...e,amount:Number(e.amount)}))},etag:meeting.myDocuments?.etag});reload();
  }}>
    {!meeting.canSubmit&&<p>활동 일정·장소를 설정하면 활동일부터 제출할 수 있습니다.</p>}
    <div className="form-section-heading"><h3>활동 보고서</h3><p className="help">무엇을 했고, 어떤 결과를 얻었는지 작성해주세요.</p></div><label htmlFor="activity-content">활동 내용</label><textarea id="activity-content" required maxLength={5000} name="content" defaultValue={meeting.myDocuments?.content??''}/><label htmlFor="activity-outcome">활동 성과</label><textarea id="activity-outcome" required maxLength={2000} name="outcome" defaultValue={meeting.myDocuments?.outcome??''}/>
    <div className="form-section-heading"><h3>활동비 사용 내역서</h3></div><p className="help">지출이 없다면 항목을 추가하지 않고 제출하세요. 금액은 원 단위이며 최대 합계 100,000,000원입니다.</p>
    {expenses.map((e,i)=><fieldset className="expense-row" key={i}><legend>지출 {i+1}</legend><div><label htmlFor={`expense-date-${i}`}>지출일</label><input id={`expense-date-${i}`} type="date" required value={e.date} onChange={event=>change(i,'date',event.target.value)}/></div><div><label htmlFor={`expense-purpose-${i}`}>사용 목적</label><input id={`expense-purpose-${i}`} required maxLength={120} value={e.description} onChange={event=>change(i,'description',event.target.value)}/></div><div><label htmlFor={`expense-amount-${i}`}>금액 (원)</label><input id={`expense-amount-${i}`} type="number" required min={1} max={100000000} step={1} value={e.amount} onChange={event=>change(i,'amount',event.target.value)}/></div><button className="button" type="button" onClick={()=>setExpenses(rows=>rows.filter((_,index)=>index!==i))}>항목 삭제</button></fieldset>)}
    <button className="button" type="button" disabled={expenses.length>=20} onClick={()=>setExpenses(rows=>[...rows,{date:meeting.date??'',description:'',amount:''}])}>지출 항목 추가</button><p className="expense-total" role="status">합계 {expenses.reduce((n,e)=>n+(Number(e.amount)||0),0).toLocaleString('ko-KR')}원 · {expenses.length}/20항목</p><p className="help">제출하면 주관 담당자가 활동 보고서와 사용 내역서를 열람·다운로드할 수 있습니다.</p>
  </Form>;
}
