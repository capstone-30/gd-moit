'use client';
import {hostedActivities,type HostedActivityType} from '../../../shared/hosted-activities';
import {HostedActivityCards,HostedActivityCover,HostedActivityPoster} from './hosted-activity-cards';
import Popup,{PopupDialog,useFormDialog} from './popup';
import {documentsComplete,type DocumentsInput,type DocumentRequirements} from '../../../shared/activity-documents';
import {useCallback,useState} from 'react';
import {api,RequestError,loadAccountContext,cursorQuery,useData,useApiData,usePages,usePaginatedData,PageButtons,Form,Heading,LoadFeedback,slotLabel,type Config,type Me} from './client';
import {dateRange} from './calendar';
import {DateSlotFields} from './date-slot-fields';
import {MeetingCardFrame} from './meeting-card';

type Documents=DocumentsInput&{activitySubmitted:boolean;expensesSubmitted:boolean;submittedAt:string;updatedAt:string;etag:string};
type HostedProject={activityType:HostedActivityType;id:string;title:string;meetingCount:number;expiresAt:string};
export type HostedMeetingSummary={id:string;title:string;projectId?:string;projectTitle?:string;activityType?:HostedActivityType;documentRequirements?:DocumentRequirements;date:string|null;slot:number|null;place:string|null;capacity:number;memberCount:number;isMember:boolean;submittedCount?:number};
type HostedMeeting=HostedMeetingSummary&{documentRequirements:DocumentRequirements;placeId:string|null;term:NonNullable<Config['term']>;etag:string;canSchedule:boolean;canSubmit:boolean;expiresAt:string;myDocuments:Documents|null};
type InstitutionHostedMeeting=HostedMeeting&{members:{userId:string;memberNo:number;documents:Documents|null}[]};

const base=(institution:boolean)=>institution?'/institutions/meetings':'/meetings/institution';
const scheduleLabel=(m:HostedMeetingSummary)=>m.date&&m.slot?`${m.date} · ${slotLabel(m.slot)}`:'활동 일정 미정';

export function HostedProjectMeetings({projectId}:{projectId?:string}) {
  const loadProject=useCallback(async(signal:AbortSignal)=>projectId?api<HostedProject>(`hosted-projects/${projectId}`,{signal}):null,[projectId]);
  const projectState=useData(loadProject);
  const project=projectState.data?.data;
  const {pages,setPages,cursor,reset:resetPages}=usePages();
  const [noticeRevision,setNoticeRevision]=useState(0);
  const [editor,setEditor]=useState<'meetings'|'notice'|null>(null);
  const adding=editor==='meetings',composing=editor==='notice';
  const form=useFormDialog(()=>setEditor(null),'저장하지 않은 입력을 버리고 닫을까요?');
  const [message,setMessage]=useState('');
  const load=useCallback(async(signal:AbortSignal)=>{
    const query=cursorQuery(cursor);if(projectId)query.set('projectId',projectId);
    const meetings=await api<HostedMeetingSummary[]>(`hosted-meetings?${query}`,{signal});
    return {meetings:meetings.data,nextCursor:meetings.nextCursor,projectId};
  },[cursor,projectId]);
  const state=useData(load),d=state.data;
  // Do not show the previous project's rows while the new selection loads.
  const current=d?.projectId===projectId?d:undefined;
  function created(count:number) {
    setEditor(null);setMessage(`${count}개 모임을 등록했습니다.`);resetPages();state.reload();
  }
  return <div className="hosted-manager"><Heading title={project?.title??(projectId?'프로젝트 모임':'전체 모임')} description="모임을 구성하고, 공지와 제출 서류를 관리하세요."/>
    {projectId&&<LoadFeedback state={projectState}/>}
    <div>
      <section className="project-content" aria-label="프로젝트 모임 관리" aria-busy={state.loading}>
        <header className="project-content-heading"><div><p className="school-label">{project?'선택한 프로젝트':'전체 프로젝트'}</p><div className="project-title-row"><h2>{project?.title??'전체 모임'}</h2>{project&&<div className="management-actions"><ProjectTitleEditor project={project} reload={projectState.reload}/><DeleteHostedProject project={project}/></div>}</div><p className="help">{project?'모임을 선택하면 일정과 참여 학생의 제출 서류를 확인할 수 있습니다.':'프로젝트를 선택하면 소속 모임을 조회하고 새 모임을 등록할 수 있습니다.'}</p></div>
        </header>
        {projectId&&<ProjectNotices projectId={projectId} revision={noticeRevision} onChanged={state.reload} onCreate={()=>setEditor('notice')}/>}
        {message&&<p className="feedback success-message" role="status">{message}</p>}
        {adding&&project&&<PopupDialog title="모임 일괄 등록" open onClose={form.close}><CreateHostedMeetings projectId={project.id} done={created} {...form}/></PopupDialog>}
        <div className="project-toolbar project-meetings-toolbar"><h3>소속 모임{current&&<span className="help"> · 이 페이지 {current.meetings.length}개</span>}</h3><div className="project-toolbar-actions">
          <button className="text-button" disabled={state.loading||form.busy} onClick={state.reload}>새로고침</button>
          {project&&<button className="button primary" disabled={form.busy||composing} aria-haspopup="dialog" onClick={()=>setEditor('meetings')}>모임 등록</button>}
        </div></div>
        <LoadFeedback state={state} hasData={Boolean(current)}/>
        {current&&<>{current.meetings.length===0?<div className="project-empty"><h3>{project?'아직 등록한 모임이 없습니다':'등록된 모임이 없습니다'}</h3><p>{project?'모임 이름과 학생 구성을 입력해 첫 모임을 등록하세요.':'프로젝트 생성 메뉴에서 프로젝트를 만든 뒤 모임을 등록하세요.'}</p>{project&&!adding&&<button className="button primary" onClick={()=>setEditor('meetings')}>첫 모임 등록</button>}</div>:<ul className="meetings">{current.meetings.map(m=><HostedMeetingCard key={m.id} meeting={m} institution/>)}</ul>}
          <div className="pagination"><PageButtons pages={pages} setPages={setPages} nextCursor={current.nextCursor}/></div></>}
        {composing&&<PopupDialog title="전체 모임에 공지" open onClose={form.close}><NoticeForm projectId={projectId} selected={{}} {...form} clear={()=>{setEditor(null);setMessage('전체 모임에 공지를 게시했습니다.');state.reload();setNoticeRevision(v=>v+1);}}/></PopupDialog>}
      </section>
    </div>
  </div>;
}

export function CreateHostedProject() {
  const [activityType,setActivityType]=useState<HostedActivityType>('general');
  const config=useApiData<Config>('configuration');
  return <div className="hosted-manager project-create"><Heading title="프로젝트 생성" description="활동 템플릿을 선택하고 새 프로젝트를 만드세요."/>
    <LoadFeedback state={config}/>
    {config.data&&!config.data.data.term&&<p className="help">학교 학기가 설정되면 프로젝트를 만들 수 있습니다.</p>}
    <Form dirtyGuard disabled={!config.data?.data.term} label="프로젝트 생성" submitContent={<label className="project-name-field">프로젝트명<input name="title" required maxLength={100} placeholder="프로젝트명을 입력하세요"/></label>} submit={async f=>{
      await api<HostedProject>('hosted-projects',{method:'POST',body:{activityType,title:String(f.get('title'))}});
      return '/institutions/meetings';
    }}><HostedActivityCards selected={activityType} onSelect={setActivityType}/>
    </Form>
  </div>;
}

function ManagementIcon({action,label}:{action:'edit'|'delete';label:string}) {
  return <><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{action==='edit'?<><path d="m16 3 5 5M10 14l1-5 7-7 5 5-7 7-6 1Z"/><path d="M4 20h16"/></>:<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>}</svg><span className="sr-only">{label}</span></>;
}

function DeleteHostedProject({project}:{project:HostedProject}) {
  return <Popup title="프로젝트 삭제" trigger={<ManagementIcon action="delete" label="프로젝트 삭제"/>} triggerClassName="button danger management-button"><Form danger label="프로젝트 삭제" submit={async()=>{
    await api(`hosted-projects/${project.id}`,{method:'DELETE'});
    return '/institutions/meetings';
  }}><p>‘{project.title}’ 프로젝트와 소속 모임·참여·공지·제출 자료를 모두 삭제합니다.</p><label className="check-line"><input type="checkbox" name="confirm" required/>삭제 후 되돌릴 수 없음을 확인했습니다.</label></Form></Popup>;
}

export function ProjectTitleEditor({project,reload}:{project:HostedProject;reload:()=>void}) {
  return <Popup title="프로젝트 제목 수정" className="project-title-action" trigger={<ManagementIcon action="edit" label="프로젝트 제목 수정"/>} triggerClassName="button management-button">
    <Form label="제목 저장" successMessage="프로젝트 제목을 수정했습니다." onConflict={reload} submit={async f=>{
      await api(`hosted-projects/${project.id}`,{method:'PATCH',body:{title:String(f.get('title')),previousTitle:project.title}});
      reload();
    }}><label>프로젝트 제목<input name="title" defaultValue={project.title} maxLength={100} required/></label></Form>
  </Popup>;
}

export function HostedProjectCard({project:p}:{project:HostedProject}) {
  return <li className="project-card"><HostedActivityCover type={p.activityType??'general'}/><div className="project-card-copy"><span className="badge">{hostedActivities[p.activityType??'general'].label}</span>
    <h2><a className="meeting-card-link" href={`/institutions/meetings/projects/${p.id}`}>{p.title}</a></h2>
    <p className="help project-card-footer">소속 모임 {p.meetingCount}개</p></div>
  </li>;
}

export function HostedProjectManager() {
  const state=usePaginatedData<HostedProject>('hosted-projects');
  return <div className="hosted-manager"><Heading title="프로젝트 관리" description="프로젝트를 선택해 소속 모임과 공지·서류를 관리하세요."/>
    <LoadFeedback state={state}/>
    {state.data&&<>{state.data.data.length?<ul className="meetings project-cards">{state.data.data.map(p=><HostedProjectCard key={p.id} project={p}/>)}</ul>:<div className="empty-state"><h2>등록된 프로젝트가 없습니다</h2><a className="button primary" href="/institutions/projects/new">프로젝트 생성</a></div>}
      <div className="pagination"><PageButtons {...state} nextCursor={state.data.nextCursor}/></div></>}
    <a className="text-link" href="/institutions/meetings/all">전체 모임 · 프로젝트 미지정 모임 포함</a>
  </div>;
}

export function DocumentRequirementsSummary({requirements}:{requirements:DocumentRequirements}) {
  const labels=[requirements.activity&&'활동 보고서',requirements.expenses&&'활동비 사용 내역서'].filter(Boolean);
  return <p className="help">제출 요구: {labels.join(' · ')||'없음'}</p>;
}

export function HostedMeetingCard({meeting:m,institution=false}:{meeting:HostedMeetingSummary;institution?:boolean}) {
  const href=`${base(institution)}/${m.id}`;
  return <MeetingCardFrame title={m.title} href={href} badge="대학 주관" capacity={m.capacity} memberCount={m.memberCount} place={m.place??'학생이 일정·장소 설정'} schedule={scheduleLabel(m)}>
    {m.activityType&&m.activityType!=='general'&&<><HostedActivityPoster type={m.activityType}/><p className="help">활동 유형: {hostedActivities[m.activityType].label} · 포스터는 참고 자료입니다.</p></>}
    {m.documentRequirements&&<DocumentRequirementsSummary requirements={m.documentRequirements}/>}
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

type ProjectNotice=Notice&{version:number;etag:string;meetings:Record<string,string>;submissionSummary?:{total:number;completed:number}};

export function NoticeForm({projectId,initial,selected,clear,onBusy,dirty,onDirtyChange,onConflict}:{projectId?:string;initial?:ProjectNotice;selected:Record<string,string>;clear:()=>void;onBusy:(busy:boolean)=>void;dirty:boolean;onDirtyChange:(dirty:boolean)=>void;onConflict?:()=>void}) {
  const [configure,setConfigure]=useState(Boolean(initial?.documentRequirements));
  const meetingIds=Object.keys(selected);
  const defaults=initial?.documentRequirements;
  return <Form dirtyGuard dirty={dirty} onDirtyChange={onDirtyChange} onBusy={onBusy} onConflict={onConflict} label={initial?'공지 수정 저장':projectId?'전체 모임에 공지 게시':'이 모임에 공지 게시'} disabled={!projectId&&!meetingIds.length} submit={async f=>{
    const content={title:String(f.get('title')),body:String(f.get('body')),documentRequirements:configure?{activity:f.get('requireActivity')==='on',expenses:f.get('requireExpenses')==='on'}:null};
    if(initial) {
      await api(`hosted-projects/${projectId}/notices/${initial.id}`,{method:'PATCH',body:{...content,version:initial.version}});
    } else {
      await api(projectId?`hosted-projects/${projectId}/notices`:`hosted-meetings/${meetingIds[0]}/notices`,{method:'POST',body:{...content,documentRequirements:content.documentRequirements??undefined}});
    }
    clear();
  }}><p role="status">{meetingIds.length?`대상 모임 ${meetingIds.length}개: ${Object.values(selected).join(', ')}`:'이 프로젝트의 전체 모임에 게시합니다. 대상은 변경할 수 없습니다.'}</p>
    <label htmlFor="notice-title">공지 제목</label><input id="notice-title" name="title" required maxLength={100} autoFocus defaultValue={initial?.title}/>
    <label htmlFor="notice-body">공지 내용</label><textarea id="notice-body" name="body" required maxLength={5000} defaultValue={initial?.body}/>
    <label className="check-line"><input type="checkbox" checked={configure} onChange={e=>setConfigure(e.target.checked)}/>이 공지로 제출 서류 설정</label>
    {configure&&<fieldset><legend>제출을 요구할 서류</legend><label className="check-line"><input type="checkbox" name="requireActivity" defaultChecked={defaults?.activity}/>활동 보고서</label><label className="check-line"><input type="checkbox" name="requireExpenses" defaultChecked={defaults?.expenses}/>활동비 사용 내역서</label><p className="help">선택한 서류의 제출을 활성화합니다. 모두 해제하면 제출 요구가 없어지며 기존 자료는 보존됩니다. 현재 제출 요구는 게시 순서상 마지막 제출 설정 공지를 따릅니다.</p></fieldset>}
  </Form>;
}

export function ProjectNotices({projectId,revision=0,onCreate,onChanged}:{projectId:string;revision?:number;onCreate:()=>void;onChanged?:()=>void}) {
  const state=usePaginatedData<ProjectNotice>(`hosted-projects/${projectId}/notices`,revision);
  const [editing,setEditing]=useState<ProjectNotice|null>(null);
  const [deleting,setDeleting]=useState<ProjectNotice|null>(null);
  const currentDeletion=state.data?.data.find(n=>n.id===deleting?.id)??deleting;
  const form=useFormDialog(()=>setEditing(null));
  const latest=state.data?.data.find(n=>n.id===editing?.id);
  return <section className="detail-section vertical-card" aria-label="프로젝트 공지사항">
    <div className="section-heading notice-section-heading"><h2>공지사항</h2><button type="button" className="button notice-create" disabled={form.busy} aria-label="공지사항 작성" title="공지사항 작성" aria-haspopup="dialog" onClick={onCreate}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="m16 3 5 5M10 14l1-5 7-7 5 5-7 7-6 1Z"/></svg></button></div>
    <p className="help">작성한 공지는 전체 소속 모임에 게시됩니다. 공지를 열면 수정·삭제 아이콘을 사용할 수 있습니다.</p>
    <LoadFeedback state={state}/>
    {state.data&&<>{state.data.data.length?<div className="notice-list">{state.data.data.map(n=><NoticeCard key={n.id} notice={n} summary={n.submissionSummary} onEdit={()=>setEditing(n)} onDelete={()=>setDeleting(n)} audience={Object.values(n.meetings).join(', ')}/>)}</div>:<p>게시된 공지사항이 없습니다.</p>}
      <div className="pagination"><PageButtons {...state} nextCursor={state.data.nextCursor} labels={['이전 공지','다음 공지']}/></div></>}
    {editing&&<PopupDialog title="공지사항 수정" open onClose={form.close}><NoticeForm projectId={projectId} initial={{...editing,version:latest?.version??editing.version}} selected={editing.meetings} {...form} onConflict={state.reload} clear={()=>{setEditing(null);state.reload();onChanged?.();}}/></PopupDialog>}
    {currentDeletion&&<PopupDialog title="공지사항 삭제" open onClose={()=>{if(!form.busy)setDeleting(null);}}><Form danger label="공지사항 삭제" onBusy={form.onBusy} onConflict={state.reload} submit={async()=>{
      await api(`hosted-projects/${projectId}/notices/${currentDeletion.id}`,{method:'DELETE',etag:currentDeletion.etag});
      setDeleting(null);state.reload();onChanged?.();
    }}><p>‘{currentDeletion.title}’ 공지를 대상 모임 {Object.keys(currentDeletion.meetings).length}개에서 삭제합니다.</p><p className="help">모임과 제출 자료는 유지합니다. 요구 서류는 남은 공지의 마지막 제출 설정을 따르며, 설정 공지가 없으면 제출 요구가 해제됩니다.</p><label className="check-line"><input type="checkbox" name="confirm" required/>공지를 삭제합니다. 삭제 후 되돌릴 수 없습니다.</label></Form></PopupDialog>}
  </section>;
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

type Notice={id:string;title:string;body:string;createdAt:string;updatedAt?:string;documentRequirements:DocumentRequirements|null};
export function NoticeCard({notice:n,meetingId,members,onEdit,onDelete,audience,summary}:{notice:Notice;summary?:{total:number;completed:number};meetingId?:string;members?:InstitutionHostedMeeting['members'];onEdit?:()=>void;onDelete?:()=>void;audience?:string}) {
  const required=n.documentRequirements;
  const requests=required&&(required.activity||required.expenses);
  const submissions=required?members?.map(m=>({...m,complete:documentsComplete(required,m.documents)})):undefined;
  const completed=submissions?.filter(m=>m.complete).length??0;
  return <article className="submission-record notice-record">
    <div className="notice-heading"><Popup className="notice-title-popup" title={n.title} triggerClassName="notice-title" trigger={<><span className="badge">{requests?'서류 제출':'공지'}</span><span className="notice-title-text">{n.title}</span></>} actions={(onEdit||onDelete)&&<div className="notice-actions">
        {onEdit&&<button className="button management-button" type="button" aria-label="공지사항 수정" title="공지사항 수정" aria-haspopup="dialog" onClick={onEdit}><ManagementIcon action="edit" label="공지사항 수정"/></button>}
        {onDelete&&<button className="button danger management-button" type="button" aria-label="공지사항 삭제" title="공지사항 삭제" aria-haspopup="dialog" onClick={onDelete}><ManagementIcon action="delete" label="공지사항 삭제"/></button>}
      </div>}>
      <p className="help">{new Date(n.createdAt).toLocaleString('ko-KR')}{n.updatedAt&&n.updatedAt!==n.createdAt&&` · 수정 ${new Date(n.updatedAt).toLocaleString('ko-KR')}`}</p>
      {audience&&<p className="help">대상 모임: {audience}</p>}<p className="document-text">{n.body}</p>

      {required&&<div><p className="help">게시 당시 제출 설정</p><DocumentRequirementsSummary requirements={required}/></div>}
    </Popup>
      {requests&&summary&&<span className="notice-submission-summary" aria-label={`${summary.total}명 중 ${summary.completed}명 제출 완료`}>{summary.completed}/{summary.total}명 제출</span>}
      {requests&&submissions&&<Popup title="서류 제출 현황" triggerClassName="button notice-submissions" trigger={<><span className="capacity-dots" role="img" aria-label={`${submissions.length}명 중 ${completed}명 제출 완료`}>{submissions.map(m=><i key={m.userId} aria-hidden="true" className={m.complete?'filled':undefined}/>)}</span><span>{completed}/{submissions.length}명 제출</span></>}>
        <p className="help">이 공지가 요구한 서류의 현재 제출 상태입니다. 채워진 원은 제출 완료, 빈 원은 미제출입니다.</p>
        {submissions.map(m=><article className="submission-record" key={m.userId}><h3>참여자 {m.memberNo} · {m.complete?'제출 완료':'미제출 서류 있음'}</h3>{m.documents&&<DocumentView meetingId={meetingId!} userId={m.userId} documents={m.documents}/>}</article>)}
      </Popup>}
    </div>
  </article>;
}

export function Notices({id,institution,members,reload}:{id:string;institution:boolean;members?:InstitutionHostedMeeting['members'];reload:()=>void}) {
  const state=usePaginatedData<Notice>(`hosted-meetings/${id}/notices`);
  const [composing,setComposing]=useState(false);
  const form=useFormDialog(()=>setComposing(false));
  return <section className="detail-section vertical-card"><div className="section-heading notice-section-heading"><h2>공지사항</h2>{institution&&<button type="button" className="button notice-create" aria-label="공지사항 작성" title="공지사항 작성" aria-haspopup="dialog" onClick={()=>setComposing(true)}><ManagementIcon action="edit" label="공지사항 작성"/></button>}{!institution&&<button className="button" onClick={()=>{state.reload();reload();}} disabled={state.loading}>공지 새로고침</button>}</div><LoadFeedback state={state}/>{state.data&&<>{state.data.data.length===0?<p>게시된 공지사항이 없습니다.</p>:<div className="notice-list">{state.data.data.map(n=><NoticeCard key={n.id} notice={n} meetingId={id} members={institution?members:undefined}/>)}</div>}<div className="pagination"><PageButtons {...state} nextCursor={state.data.nextCursor} labels={['이전 공지','다음 공지']}/></div></>}{institution&&composing&&<PopupDialog title="이 모임에 공지" open onClose={form.close}><NoticeForm selected={{[id]:'현재 모임'}} {...form} clear={()=>{setComposing(false);state.reload();reload();}}/></PopupDialog>}</section>;
}

export function HostedMeetingDetail({id,institution=false}:{id:string;institution?:boolean}) {
  const load=useCallback(async(signal:AbortSignal)=>{
    const [m,context]=await Promise.all([api<HostedMeeting|InstitutionHostedMeeting>(`hosted-meetings/${id}`,{signal}),institution?null:loadAccountContext(signal)]);
    return {m:m.data,me:context?.me,c:context?.c};
  },[id,institution]);
  const state=useData(load),d=state.data;
  return <><LoadFeedback state={state}/>{d&&<>
    <div className="project-title-row"><Heading title={d.m.title} description={`${scheduleLabel(d.m)} · ${d.m.place??'장소 미정'}`}/>{institution&&<div className="management-actions"><DeleteHostedMeeting id={d.m.id}/></div>}</div>
    <section className="time-banner"><span className="badge">대학 주관</span><h2>활동 안내</h2>{d.m.projectTitle&&<p>프로젝트: {d.m.projectTitle}</p>}<p>학생 {d.m.memberCount}/{d.m.capacity}명 · 자료 보관 만료: {new Date(d.m.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p><p className="help">활동 서류는 제출한 본인과 주관 담당자만 확인합니다. 연락처·계좌번호 등 불필요한 개인정보를 작성하지 마세요.</p></section>
    {d.m.activityType&&d.m.activityType!=='general'&&<section className="hosted-detail-poster"><h2>{hostedActivities[d.m.activityType].label}</h2><HostedActivityPoster type={d.m.activityType}/><p className="help">참고 포스터입니다. 실제 일정·장소는 위 활동 안내를 확인하세요. 앱에서는 지원금 지급·정산을 제공하지 않습니다.</p></section>}
    <Notices id={id} institution={institution} members={'members' in d.m?d.m.members:undefined} reload={state.reload}/>
    {!institution&&<StudentDocuments meeting={d.m} c={d.c!} me={d.me} reload={state.reload}/>}
  </>}</>;
}

function StudentDocuments({meeting,c,me,reload}:{meeting:HostedMeeting;c:Config;me?:Me;reload:()=>void}) {
  if(!meeting.isMember)return null;
  return <>
    {meeting.canSchedule&&c.school&&<ScheduleForm meeting={meeting} c={c} reload={reload}/>}
    <section className="detail-section vertical-card"><h2>활동 서류 제출</h2>{meeting.myDocuments&&me&&<DocumentView meetingId={meeting.id} userId={me.id} documents={meeting.myDocuments}/>}<ReportForm meeting={meeting} reload={reload}/></section><Popup className="account-controls" title="참여 취소"><Form danger label="참여 취소·서류 삭제" submit={async()=>{await api(`hosted-meetings/${meeting.id}/members/me`,{method:'DELETE'});return '/meetings/manage';}}><label className="check-line"><input type="checkbox" name="confirm" required/>참여와 제출 서류를 함께 삭제합니다.</label></Form></Popup>
  </>;
}

function DeleteHostedMeeting({id}:{id:string}) {
  return <Popup title="주관 모임 삭제" trigger={<ManagementIcon action="delete" label="주관 모임 삭제"/>} triggerClassName="button danger management-button"><Form danger label="주관 모임·전체 서류 삭제" submit={async()=>{await api(`hosted-meetings/${id}`,{method:'DELETE'});return base(true);}}><label className="check-line"><input type="checkbox" name="confirm" required/>모임과 모든 참여·공지·제출 서류를 함께 삭제합니다. 삭제 후 되돌릴 수 없습니다.</label></Form></Popup>;
}

function DocumentView({meetingId,userId,documents}:{meetingId:string;userId:string;documents:Documents}) {
  const url=`/api/v1/hosted-meetings/${meetingId}/documents/${userId}`;
  return <div className="document-view"><p className="help">최초 제출 {new Date(documents.submittedAt).toLocaleString('ko-KR')} · 최종 수정 {new Date(documents.updatedAt).toLocaleString('ko-KR')}</p>
    <Popup title="제출 서류 보기">{documents.activitySubmitted&&<><h3>활동 내용</h3><p className="document-text">{documents.content}</p><h3>활동 성과</h3><p className="document-text">{documents.outcome}</p></>}{documents.expensesSubmitted&&<><h3>활동비 사용 내역</h3>{documents.expenses.length===0?<p>지출 없음</p>:<ul className="expense-items">{documents.expenses.map((e,i)=><li key={i}><span>{e.date} · {e.description}</span><strong>{e.amount.toLocaleString('ko-KR')}원</strong></li>)}</ul>}<p><strong>합계 {documents.expenses.reduce((n,e)=>n+e.amount,0).toLocaleString('ko-KR')}원</strong></p></>}</Popup>
    <div className="form-actions">{documents.activitySubmitted&&<a className="button" href={`${url}/activity.csv`} download>활동 보고서 CSV</a>}{documents.expensesSubmitted&&<a className="button" href={`${url}/expenses.csv`} download>사용 내역서 CSV</a>}</div>
  </div>;
}

export function ReportForm({meeting,reload}:{meeting:HostedMeeting;reload:()=>void}) {
  const [expenses,setExpenses]=useState((meeting.myDocuments?.expenses??[]).map(e=>({...e,amount:String(e.amount)})));
  function change(index:number,key:'date'|'description'|'amount',value:string) {setExpenses(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));}
  return <Form dirtyGuard disabled={!meeting.canSubmit} label={meeting.myDocuments?'서류 수정 제출':'요구 서류 제출'} onConflict={reload} submit={async f=>{
    const {activity,expenses:requiresExpenses}=meeting.documentRequirements;
    try {
      await api(`hosted-meetings/${meeting.id}/documents/me`,{method:'PATCH',body:{
        content:activity?String(f.get('content')):undefined,
        outcome:activity?String(f.get('outcome')):undefined,
        expenses:requiresExpenses?expenses.map(e=>({...e,amount:Number(e.amount)})):undefined,
      },etag:meeting.myDocuments?.etag});
      reload();
    } catch(error) {if(error instanceof RequestError&&error.code==='STATE_CONFLICT')reload();throw error;}
  }}>
    {!meeting.documentRequirements.activity&&!meeting.documentRequirements.expenses?<p>현재 제출을 요구하는 서류가 없습니다.</p>:!meeting.canSubmit&&<p>활동 일정·장소를 설정하면 활동일부터 제출할 수 있습니다.</p>}
    <fieldset className="stack document-fields" hidden={!meeting.documentRequirements.activity} disabled={!meeting.documentRequirements.activity}><div className="form-section-heading"><h3>활동 보고서</h3><p className="help">무엇을 했고, 어떤 결과를 얻었는지 작성해주세요.</p></div><label htmlFor="activity-content">활동 내용</label><textarea id="activity-content" required maxLength={5000} name="content" defaultValue={meeting.myDocuments?.content??''}/><label htmlFor="activity-outcome">활동 성과</label><textarea id="activity-outcome" required maxLength={2000} name="outcome" defaultValue={meeting.myDocuments?.outcome??''}/></fieldset>
    <fieldset className="stack document-fields" hidden={!meeting.documentRequirements.expenses} disabled={!meeting.documentRequirements.expenses}><div className="form-section-heading"><h3>활동비 사용 내역서</h3></div><p className="help">지출이 없다면 항목을 추가하지 않고 제출하세요. 금액은 원 단위이며 최대 합계 100,000,000원입니다.</p>
    {expenses.map((e,i)=><fieldset className="expense-row" key={i}><legend>지출 {i+1}</legend><div><label htmlFor={`expense-date-${i}`}>지출일</label><input id={`expense-date-${i}`} type="date" required value={e.date} onChange={event=>change(i,'date',event.target.value)}/></div><div><label htmlFor={`expense-purpose-${i}`}>사용 목적</label><input id={`expense-purpose-${i}`} required maxLength={120} value={e.description} onChange={event=>change(i,'description',event.target.value)}/></div><div><label htmlFor={`expense-amount-${i}`}>금액 (원)</label><input id={`expense-amount-${i}`} type="number" required min={1} max={100000000} step={1} value={e.amount} onChange={event=>change(i,'amount',event.target.value)}/></div><button className="button" type="button" onClick={()=>setExpenses(rows=>rows.filter((_,index)=>index!==i))}>항목 삭제</button></fieldset>)}
    <button className="button" type="button" disabled={expenses.length>=20} onClick={()=>setExpenses(rows=>[...rows,{date:meeting.date??'',description:'',amount:''}])}>지출 항목 추가</button><p className="expense-total" role="status">합계 {expenses.reduce((n,e)=>n+(Number(e.amount)||0),0).toLocaleString('ko-KR')}원 · {expenses.length}/20항목</p></fieldset><p className="help">제출하면 주관 담당자가 제출한 서류를 열람·다운로드할 수 있습니다.</p>
  </Form>;
}
