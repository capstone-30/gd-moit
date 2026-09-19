import type {MeetingType} from '../../../shared/meeting-types';
export {meetingTypes,type MeetingType} from '../../../shared/meeting-types';
export const periods = ['2026-09','2026-10','2026-11'] as const;

// 고정 합성 시나리오. 사용자 식별자와 운영 데이터는 포함하지 않는다.
const meetings:ReadonlyArray<{month:string;type:MeetingType;topic:string;members:number;capacity:number;confirmed:boolean}> = [
  {month:'2026-09',type:'study',topic:'알고리즘',members:3,capacity:4,confirmed:true},
  {month:'2026-09',type:'study',topic:'웹 개발',members:2,capacity:3,confirmed:false},
  {month:'2026-09',type:'coffee',topic:'진로 탐색',members:3,capacity:3,confirmed:true},
  {month:'2026-09',type:'lunch',topic:'캠퍼스 생활',members:2,capacity:4,confirmed:false},
  {month:'2026-10',type:'study',topic:'알고리즘',members:4,capacity:4,confirmed:true},
  {month:'2026-10',type:'study',topic:'웹 개발',members:3,capacity:3,confirmed:true},
  {month:'2026-10',type:'coffee',topic:'진로 탐색',members:2,capacity:3,confirmed:false},
  {month:'2026-10',type:'lunch',topic:'캠퍼스 생활',members:3,capacity:4,confirmed:true},
];

export function summarizeDemo(month:string,type:MeetingType|'') {
  const selected=meetings.filter(m=>(!month||m.month===month)&&(!type||m.type===type));
  const members=selected.reduce((sum,m)=>sum+m.members,0);
  const capacity=selected.reduce((sum,m)=>sum+m.capacity,0);
  const topics=new Map<string,{topic:string;meetings:number;members:number;confirmed:number}>();
  for(const m of selected) {
    const row=topics.get(m.topic)??{topic:m.topic,meetings:0,members:0,confirmed:0};
    row.meetings++;row.members+=m.members;row.confirmed+=Number(m.confirmed);
    topics.set(m.topic,row);
  }
  return {
    meetings:selected.length,confirmed:selected.filter(m=>m.confirmed).length,members,
    fillRate:capacity?Math.round(members/capacity*100):0,
    topics:[...topics.values()].sort((a,b)=>b.members-a.members||a.topic.localeCompare(b.topic,'ko')),
  };
}
