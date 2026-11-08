'use client';
import {useContext,useState} from 'react';
import {api,useApiData,Form,LoadFeedback,Slots,type Config,type Availability} from './client';
import Popup from './popup';
import {CloseProfileCard} from './profile-cards';
import TimetableImageImport from './timetable-image-import';
import {reusableSlots,type SavedAvailability} from './availability';

export default function AvailabilityForm({term,times,reload,dirty,busy,onDirtyChange,onBusyChange}:{term:NonNullable<Config['term']>,times:Availability|null,reload:()=>void,dirty:boolean,busy:boolean,onDirtyChange:(dirty:boolean)=>void,onBusyChange:(busy:boolean)=>void}) {
  const [selected,setSelected]=useState(times?.slots??[]),[imported,setImported]=useState<{name:string,skipped:number}|null>(null);
  // 다른 학기를 불러오면 이미지 적용을 새로 시작해, 이미지의 적용 취소가 불러온 학기 시간까지 되돌리지 않게 한다.
  const [imageReset,setImageReset]=useState(0);
  const closeCard=useContext(CloseProfileCard);
  function select(slots:number[]){setSelected(slots);onDirtyChange(true);}
  const history=useApiData<SavedAvailability[]>('me/availability'),sources=history.data?.data.filter(t=>t.termId!==term.id)??[];
  return <Form dirtyGuard dirty={dirty} onDirtyChange={onDirtyChange} onBusy={onBusyChange} successMessage="가능 시간을 저장했어요." label="변경 사항 저장" submit={async()=>{await api(`me/availability/${term.id}`,{method:'PUT',body:{slots:selected}});onDirtyChange(false);closeCard();reload();}}>
    <p className="profile-save-status" role="status">{busy?'저장 중…':dirty?'저장하지 않은 변경사항':times?.registered?'✓ 저장됨':'아직 저장하지 않았어요'}</p>
    <p className="help">{term.startsOn} ~ {term.endsOn} · {times?.registered?'등록한 시간을 모임마다 재사용합니다.':'아직 시간을 등록하지 않았습니다.'}</p>
    <Popup className="profile-import" title="이미지·다른 학기에서 불러오기">
    <LoadFeedback state={history}/>
    {sources.length>0?<><label htmlFor="source-term">다른 학기 시간 불러오기</label><select id="source-term" defaultValue="" onChange={e=>{
      const source=sources.find(t=>t.termId===e.target.value);if(!source)return;
      const slots=reusableSlots(source,term.slots);select(slots);setImported({name:source.name,skipped:source.slots.length-slots.length});setImageReset(n=>n+1);
    }}><option value="" disabled>불러올 학기를 선택하세요</option>{sources.map(t=><option key={t.termId} value={t.termId}>{t.name} ({t.startsOn} ~ {t.endsOn})</option>)}</select><p className="help">보관 기간이 남은 내 시간만 표시합니다. 요일·교시와 시작·종료 시간이 같은 시간만 불러옵니다. 현재 선택을 대체하며 저장 전까지 원본과 모임은 변경되지 않습니다.</p></>:history.data&&<p className="help">불러올 다른 학기 시간이 없습니다.</p>}
    {imported&&<p role="status">{imported.name} 시간을 불러왔습니다. 제외된 교시 {imported.skipped}개. 아래 선택을 검토한 뒤 저장해주세요.</p>}
    <TimetableImageImport key={imageReset} slots={term.slots} selected={selected} onApply={slots=>{select(slots);setImported(null);}}/>
    </Popup>
    <Slots slots={term.slots} selected={selected} onSelectedChange={select}/>
  </Form>;
}
