'use client';
import {useCallback,useState,type FormEvent} from 'react';
import {api,useData,Heading,Loading,Retry,kinds,slotLabel,type Config,type Meeting} from './components/client';
export default function Home(){
  const [filter,setFilter]=useState({topic:'',type:'',overlapOnly:false}),[cursor,setCursor]=useState<string|null>(null),[previous,setPrevious]=useState<(string|null)[]>([]);
  const config=useData(useCallback(async(signal:AbortSignal)=>(await api<Config>('configuration','GET',undefined,undefined,signal)).data,[]));
  const load=useCallback(async(signal:AbortSignal)=>{const q=new URLSearchParams({topic:filter.topic,overlapOnly:String(filter.overlapOnly)});if(filter.type)q.set('type',filter.type);if(cursor)q.set('cursor',cursor);const r=await api<Meeting[]>(`meetings?${q}`,'GET',undefined,undefined,signal);return {meetings:r.data,nextCursor:r.nextCursor};},[filter,cursor]);const state=useData(load);
  function search(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setCursor(null);setPrevious([]);setFilter({topic:String(f.get('topic')),type:String(f.get('type')),overlapOnly:f.get('overlap')==='on'});}
  return <>
    <Heading title="함께하면 더 좋은 시간" description="같은 학교에서, 관심사가 맞는 동료를 만나보세요.">
      <a className="button primary" href="/meetings/new">모임 열기 <span aria-hidden="true">＋</span></a>
    </Heading>
    <div className="workspace">

      <section className="discovery" aria-labelledby="find-meetings">
        <h2 id="find-meetings">어떤 모임을 찾으세요?</h2>
        <form className="search-form" onSubmit={search}>
          <label htmlFor="topic">관심 주제</label>
          <div className="search-field"><input id="topic" name="topic" maxLength={100} placeholder="관심 주제로 찾아보세요"/><button className="button primary" type="submit">검색</button></div>
          <fieldset className="type-filters"><legend>모임 유형</legend>{[['','전체'],...Object.entries(kinds)].map(([value,label])=><label key={value}><input type="radio" name="type" value={value} defaultChecked={value===''} /><span>{label}</span></label>)}</fieldset>
          <label className="check-line"><input type="checkbox" name="overlap"/>내 가능 시간과 겹치는 모임만</label>
        </form>
        <div className="section-heading results-heading"><h2>함께할 모임</h2><span className="help">관심사부터, 시간은 함께</span></div>
        <Retry error={state.error} reload={state.reload}/>
        {state.loading&&<Loading/>}
        {!state.loading&&state.data&&<>
          {state.data.meetings.length===0?<div className="empty-state"><span className="empty-mark" aria-hidden="true">＋</span><h3>아직 모임이 없어요</h3><p>원하는 주제로 첫 모임을 열어보세요.</p><a className="button primary" href="/meetings/new">모임 열기</a></div>:
          <ul className="meetings">{state.data.meetings.map(m=><li className="meeting-row" key={m.id}>
            <div className="meeting-top"><span className="badge">{kinds[m.type]}</span><span className="meeting-meta">{m.memberCount}/{m.capacity}명 참여</span></div>
            <h3><a href={`/meetings/${m.id}`}>{m.topic}</a></h3>
            <p className="meeting-meta">{m.place.name}</p>
            <p className="meeting-meta">{m.confirmation?`${m.confirmation.date} ${slotLabel(m.confirmation.slot)}`:m.state==='proposing'?'시간 제안 조율 중':'시간은 참여 후 함께 정해요'}</p>
            <div className="meeting-bottom"><p className={m.overlapsMyAvailability?'overlap':'muted'}>{m.overlapsMyAvailability?'✓ 내 시간과 겹쳐요':'시간을 함께 조율해요'}</p><a className="text-link" href={`/meetings/${m.id}`} aria-label={`${m.topic} 모임 보기`}>모임 보기 <span aria-hidden="true">→</span></a></div>
          </li>)}</ul>}
          <div className="form-actions">{previous.length>0&&<button className="button" onClick={()=>{setCursor(previous.at(-1)!);setPrevious(p=>p.slice(0,-1));}}>이전</button>}{state.data.nextCursor&&<button className="button" onClick={()=>{setPrevious(p=>[...p,cursor]);setCursor(state.data!.nextCursor!);}}>다음</button>}</div>
        </>}
      </section>
      <aside className="availability-summary">
        <span className="summary-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 5 3 3 6-5"/></svg></span>
        <p className="school-label">{config.data?.school?.name??'같은 학교, 같은 관심사'}</p>
        <h2>만날 수 있는 시간을 <br/>알려주세요</h2>
        <p>한 번 등록하면 모임마다 다시 쓸 수 있어요. 참여는 직접 결정해요.</p>
        <a className="text-link" href="/profile">내 시간 등록·수정 <span aria-hidden="true">→</span></a>
        {config.data&&!config.data.registrationAvailable&&<p className="registration-note">신규 가입을 준비 중이에요</p>}
        <Retry error={config.error} reload={config.reload}/>
      </aside>
    </div>
  </>;
}
