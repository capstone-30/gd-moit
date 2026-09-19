'use client';
import {useCallback} from 'react';
import {api,useData,Heading,Loading,Retry,type Config,type Me} from '../../components/client';
import NewMeetingForm from './new-meeting-form';
export default function NewMeeting(){
  const load=useCallback(async(signal:AbortSignal)=>{const [config,me]=await Promise.all([api<Config>('configuration',{signal}),api<Me>('me',{signal})]);return {c:config.data,me:me.data};},[]);const state=useData(load),d=state.data;
  return <div className="narrow create-page"><a className="text-link back-link" href="/meetings">← 모임 목록</a><Heading title="모임 열기" description="관심사를 먼저 정하고, 시간은 참여자와 함께 맞춰요."/><Retry error={state.error} reload={state.reload}/>{!d&&state.loading&&<Loading/>}{d&&(d.me.creationRestricted?<div className="empty-state"><h2>현재 개설이 제한되어 있습니다</h2><p>신고 검토·이의 제기는 개인정보 안내의 운영자 연락처로 요청해주세요.</p><a href="/privacy">운영자 연락처 확인</a></div>:!d.c.term||!d.c.places.length?<div className="empty-state"><h2>개설 준비 중입니다</h2><p>학기와 공개 장소가 설정된 뒤 모임을 열 수 있습니다.</p></div>:<NewMeetingForm config={d.c}/>)}</div>;
}
