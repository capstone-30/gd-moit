'use client';
import Popup from '../components/popup';
import {useState} from 'react';
import {api,loadAvailabilityContext,useData,useApiData,usePaginatedData,PageButtons,Form,Heading,LoadFeedback,Slots,ProfileText,type Config,type Me,type Profile,type Availability} from '../components/client';
import AccountControls from '../components/account-controls';
import ProfileCards from '../components/profile-cards';
import ProfileInterests from '../components/profile-interests';
import TimetableImageImport from '../components/timetable-image-import';
import {reusableSlots,type SavedAvailability} from '../components/availability';
export default function ProfilePage(){
  const state=useData(loadAvailabilityContext),d=state.data;
  return <div className="profile-page"><Heading title="프로필"/><LoadFeedback state={state}/>{d&&<><div className="profile-account-summary"><p>{d.c.school?.name}</p><p className="help break-word">{d.me.email}</p></div><ProfileCards cards={[
    {id:'availability',label:'가능 시간',content:<section className="detail-section"><h2>학기 가능 시간</h2>{d.c.term?<AvailabilityForm key={JSON.stringify([d.c.term,d.times])} term={d.c.term} times={d.times} reload={state.reload}/>:<p>학기가 아직 설정되지 않았습니다. 설정되면 여기에서 시간을 등록할 수 있어요.</p>}</section>},
    {id:'optional-profile',label:'내 정보',content:<section className="detail-section"><h2>선택 프로필</h2><p className="help">입력하지 않아도 모임을 이용할 수 있어요. 학과·입학 연도·관심 주제만 참여자에게 공개하며, 표시 이름은 나에게만 보입니다.</p><ProfileForm key={JSON.stringify([d.me.displayName,d.me.department,d.me.entryYear,d.me.interests,d.me.optionalProfileConsent])} me={d.me} c={d.c} reload={state.reload}/></section>},
    {id:'blocked-users',label:'차단',content:<Blocks/>},
    {id:'account',label:'계정',content:<AccountControls/>},
  ]}/></>}</div>;
}
function ProfileForm({me,c,reload}:{me:Me,c:Config,reload:()=>void}){
  const [consent,setConsent]=useState(me.optionalProfileConsent);
  return <Form dirtyGuard successMessage="프로필을 저장했어요." label="프로필 저장" submit={async f=>{await api('me',{method:'PATCH',body:consent?{optionalProfileConsent:true,displayName:String(f.get('displayName')).trim()||null,department:String(f.get('department'))||null,entryYear:f.get('entryYear')?Number(f.get('entryYear')):null,interests:f.getAll('interests')}:{optionalProfileConsent:false}});reload();}}><label className="check-line"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>선택 프로필 수집·공개에 동의합니다. 동의를 철회해 저장하면 선택 정보가 삭제됩니다.</span></label><p className="help" id="profile-consent-help">{consent?'공개할 정보만 입력해주세요. 표시 이름은 나에게만 보입니다.':'위 항목에 동의하면 아래 정보를 입력할 수 있어요.'}</p><fieldset className="stack" disabled={!consent} aria-describedby="profile-consent-help"><label htmlFor="displayName">표시 이름 (선택)</label><input id="displayName" name="displayName" maxLength={100} defaultValue={me.displayName??''}/><label htmlFor="department">학과 (선택)</label><select id="department" name="department" defaultValue={me.department??''}><option value="">선택 안 함</option>{c.school?.departments.map(d=><option key={d}>{d}</option>)}</select><label htmlFor="entryYear">입학 연도 (선택)</label><select id="entryYear" name="entryYear" defaultValue={me.entryYear??''}><option value="">선택 안 함</option>{c.school?.entryYears.map(y=><option key={y} value={y}>{y}</option>)}</select><ProfileInterests initial={me.interests}/></fieldset></Form>;
}
function Blocks(){
  const state=usePaginatedData<{userId:string,profile:Profile}>('me/blocks');
  return <section className="detail-section"><h2>차단 관리</h2><p className="help">차단한 사용자를 확인하고 다시 모임을 볼 수 있도록 해제할 수 있어요.</p><LoadFeedback state={state}/>{state.data?.data.length===0&&<div className="profile-empty"><h3>차단한 사용자가 없어요</h3><p className="help">모임 상세의 안전 메뉴에서 사용자를 차단할 수 있어요.</p></div>}{state.data?.data.map((b,i)=><div className="profile-block-row" key={b.userId}><p>차단 사용자 {(state.pages.length-1)*20+i+1} · <ProfileText profile={b.profile}/></p><Form label="차단 해제" submit={async()=>{await api(`me/blocks/${b.userId}`,{method:'DELETE'});state.reload();}}><span className="help">해제하면 상대 모임이 다시 표시됩니다.</span></Form></div>)}<div className="form-actions"><PageButtons {...state} nextCursor={state.data?.nextCursor}/></div></section>;
}

function AvailabilityForm({term,times,reload}:{term:NonNullable<Config['term']>,times:Availability|null,reload:()=>void}) {
  const [selected,setSelected]=useState(times?.slots??[]),[imported,setImported]=useState<{name:string,skipped:number}|null>(null);
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  function select(slots:number[]){setSelected(slots);setDirty(true);}
  const history=useApiData<SavedAvailability[]>('me/availability'),sources=history.data?.data.filter(t=>t.termId!==term.id)??[];
  return <Form dirtyGuard dirty={dirty} onDirtyChange={setDirty} onBusy={setBusy} successMessage="가능 시간을 저장했어요." label="가능 시간 저장" submit={async()=>{await api(`me/availability/${term.id}`,{method:'PUT',body:{slots:selected}});reload();}}>
    <p className="profile-save-status" role="status">{busy?'저장 중…':dirty?'저장하지 않은 변경사항':times?.registered?'✓ 저장됨':'아직 저장하지 않았어요'}</p>
    <p className="help">{term.startsOn} ~ {term.endsOn} · {times?.registered?'등록한 시간을 모임마다 재사용합니다.':'아직 시간을 등록하지 않았습니다.'}</p>
    <Popup className="profile-import" title="이미지·다른 학기에서 불러오기">
    <LoadFeedback state={history}/>
    {sources.length>0?<><label htmlFor="source-term">다른 학기 시간 불러오기</label><select id="source-term" defaultValue="" onChange={e=>{
      const source=sources.find(t=>t.termId===e.target.value);if(!source)return;
      const slots=reusableSlots(source,term.slots);select(slots);setImported({name:source.name,skipped:source.slots.length-slots.length});
    }}><option value="" disabled>불러올 학기를 선택하세요</option>{sources.map(t=><option key={t.termId} value={t.termId}>{t.name} ({t.startsOn} ~ {t.endsOn})</option>)}</select><p className="help">보관 기간이 남은 내 시간만 표시합니다. 요일·교시와 시작·종료 시간이 같은 시간만 불러옵니다. 현재 선택을 대체하며 저장 전까지 원본과 모임은 변경되지 않습니다.</p></>:history.data&&<p className="help">불러올 다른 학기 시간이 없습니다.</p>}
    {imported&&<p role="status">{imported.name} 시간을 불러왔습니다. 제외된 교시 {imported.skipped}개. 아래 선택을 검토한 뒤 저장해주세요.</p>}
    <TimetableImageImport slots={term.slots} selected={selected} onApply={select}/>
    </Popup>
    <Slots slots={term.slots} selected={selected} onSelectedChange={select}/>
  </Form>;
}
