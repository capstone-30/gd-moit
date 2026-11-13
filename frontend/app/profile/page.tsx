'use client';
import {useState} from 'react';
import {api,loadAvailabilityContext,useData,usePaginatedData,PageButtons,Form,Heading,LoadFeedback,ProfileText,type Config,type Me,type Profile} from '../components/client';
import AccountControls from '../components/account-controls';
import ProfileCards from '../components/profile-cards';
import ProfileInterests from '../components/profile-interests';
import AvailabilityForm from '../components/availability-form';
export default function ProfilePage(){
  const state=useData(loadAvailabilityContext),d=state.data;
  const [profileNotice,setProfileNotice]=useState('');
  const [availabilityDirty,setAvailabilityDirty]=useState(false),[availabilityReset,setAvailabilityReset]=useState(0),[availabilityBusy,setAvailabilityBusy]=useState(false);
  return <div className="profile-page"><Heading title="프로필"/><LoadFeedback state={state}/>{d&&<><div className="profile-account-summary"><p>{d.c.school?.name}</p><p className="help break-word">{d.me.email}</p></div><ProfileCards cards={[
    {id:'availability',label:'가능 시간',dirty:availabilityDirty,busy:availabilityBusy,onDiscard:()=>{setAvailabilityDirty(false);setAvailabilityReset(n=>n+1);},content:<section className="detail-section"><h2>학기 가능 시간</h2>{d.c.term?<AvailabilityForm key={JSON.stringify([d.c.term,d.times,availabilityReset])} term={d.c.term} times={d.times} reload={state.reload} dirty={availabilityDirty} busy={availabilityBusy} onDirtyChange={setAvailabilityDirty} onBusyChange={setAvailabilityBusy}/>:<p>학기가 아직 설정되지 않았습니다. 설정되면 여기에서 시간을 등록할 수 있어요.</p>}</section>},
    {id:'optional-profile',label:'내 정보',content:<section className="detail-section" onChange={()=>setProfileNotice('')}><h2>선택 프로필</h2><p className="help">입력하지 않아도 모임을 이용할 수 있어요. 학과·입학 연도·관심 주제만 참여자에게 공개하며, 표시 이름은 나에게만 보입니다.</p><p className="feedback success-message" role="status">{profileNotice}</p><ProfileForm onSaved={()=>setProfileNotice('프로필을 저장했어요.')} key={JSON.stringify([d.me.displayName,d.me.department,d.me.entryYear,d.me.interests,d.me.optionalProfileConsent])} me={d.me} c={d.c} reload={state.reload}/></section>},
    {id:'blocked-users',label:'차단',content:<Blocks/>},
    {id:'account',label:'계정',content:<AccountControls/>},
  ]}/></>}</div>;
}
function ProfileForm({me,c,reload,onSaved}:{me:Me,c:Config,reload:()=>void;onSaved:()=>void}){
  const [consent,setConsent]=useState(me.optionalProfileConsent);
  return <Form dirtyGuard confirmation={!consent&&Boolean(me.displayName||me.department||me.entryYear||me.interests.length)?{title:"선택 프로필을 삭제할까요?",message:"표시 이름·학과·입학 연도·관심 주제를 모두 삭제합니다. 삭제 후 되돌릴 수 없습니다.",confirmLabel:"선택 정보 삭제·저장"}:null} successMessage="" label="프로필 저장" submit={async f=>{await api('me',{method:'PATCH',body:consent?{optionalProfileConsent:true,displayName:String(f.get('displayName')).trim()||null,department:String(f.get('department'))||null,entryYear:f.get('entryYear')?Number(f.get('entryYear')):null,interests:f.getAll('interests')}:{optionalProfileConsent:false}});onSaved();reload();}}><label className="check-line"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>선택 프로필 수집·공개에 동의합니다. 동의를 철회해 저장하면 선택 정보가 삭제됩니다.</span></label><p className="help" id="profile-consent-help">{consent?'공개할 정보만 입력해주세요. 표시 이름은 나에게만 보입니다.':'위 항목에 동의하면 아래 정보를 입력할 수 있어요.'}</p><fieldset className="stack" disabled={!consent} aria-describedby="profile-consent-help"><label htmlFor="displayName">표시 이름 (선택)</label><input id="displayName" name="displayName" maxLength={100} defaultValue={me.displayName??''}/><label htmlFor="department">학과 (선택)</label><select id="department" name="department" defaultValue={me.department??''}><option value="">선택 안 함</option>{c.school?.departments.map(d=><option key={d}>{d}</option>)}</select><label htmlFor="entryYear">입학 연도 (선택)</label><select id="entryYear" name="entryYear" defaultValue={me.entryYear??''}><option value="">선택 안 함</option>{c.school?.entryYears.map(y=><option key={y} value={y}>{y}</option>)}</select><ProfileInterests initial={me.interests}/></fieldset></Form>;
}
function Blocks(){
  const state=usePaginatedData<{userId:string,profile:Profile}>('me/blocks');
  return <section className="detail-section"><h2>차단 관리</h2><p className="help">차단한 사용자를 확인하고 다시 모임을 볼 수 있도록 해제할 수 있어요.</p><LoadFeedback state={state}/>{state.data?.data.length===0&&<div className="profile-empty"><h3>차단한 사용자가 없어요</h3><p className="help">모임 상세의 안전 메뉴에서 사용자를 차단할 수 있어요.</p></div>}{state.data?.data.map((b,i)=><div className="profile-block-row" key={b.userId}><p>차단 사용자 {(state.pages.length-1)*20+i+1} · <ProfileText profile={b.profile}/></p><Form label="차단 해제" submit={async()=>{await api(`me/blocks/${b.userId}`,{method:'DELETE'});state.reload();}}><span className="help">해제하면 상대 모임이 다시 표시됩니다.</span></Form></div>)}<div className="form-actions"><PageButtons {...state} nextCursor={state.data?.nextCursor}/></div></section>;
}
