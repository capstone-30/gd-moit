'use client';
import {useContext,useState} from 'react';
import {FormChange} from './client';

export function interestValues(tags:string[],draft:string) {
  return [...new Set([...tags,draft.trim()].filter(Boolean))];
}

export default function ProfileInterests({initial}:{initial:string[]}) {
  const [tags,setTags]=useState(initial),[draft,setDraft]=useState('');
  const onChange=useContext(FormChange),values=interestValues(tags,draft);
  function add() {
    if(!draft.trim())return;
    setTags(interestValues(tags,draft));setDraft('');onChange();
  }
  return <div className="stack profile-interests">
    <label htmlFor="interests">관심 주제 (선택)</label>
    <p className="help" id="interests-help">한 개씩 입력하고 Enter 또는 추가를 누르세요. 최대 10개까지 등록할 수 있어요.</p>
    {values.map(value=><input key={value} type="hidden" name="interests" value={value}/>)}
    {tags.length>0&&<ul className="interest-tags" aria-label="입력한 관심 주제">{tags.map(tag=><li key={tag}><span>{tag}</span><button type="button" aria-label={`${tag} 삭제`} onClick={()=>{setTags(tags.filter(value=>value!==tag));onChange();}}>×</button></li>)}</ul>}
    <div className="interest-entry"><input id="interests" value={draft} maxLength={100} pattern="[^,]*" title="쉼표 없이 주제를 한 개씩 입력해주세요." disabled={tags.length>=10} aria-describedby="interests-help interests-count" placeholder={tags.length>=10?'주제 10개를 입력했어요':'예: 웹 개발'} onChange={event=>{setDraft(event.target.value);}} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();if(event.currentTarget.checkValidity())add();else event.currentTarget.reportValidity();}}}/><button type="button" className="button" disabled={!draft.trim()||draft.includes(',')||tags.length>=10} onClick={add}>추가</button></div>
    <p className="help" id="interests-count" role="status">{values.length}/10개 · 입력 중인 주제도 저장됩니다.</p>
  </div>;
}
