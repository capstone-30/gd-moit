import type {MeetingType} from '../../../shared/meeting-types';
export {meetingTypes,type MeetingType} from '../../../shared/meeting-types';
export const periods = ['2026-09','2026-10','2026-11'] as const;

export const esgAreas = {
  E:{label:'환경',english:'Environment',description:'캠퍼스 환경 실천',examples:'플로깅 · 자원순환'},
  S:{label:'사회',english:'Social',description:'함께 배우고 성장하는 캠퍼스',examples:'학습 나눔 · 진로 멘토링'},
  G:{label:'거버넌스',english:'Governance',description:'함께 정하는 공동체 운영',examples:'참여 규칙 · 운영 회고'},
} as const;
export type EsgArea = keyof typeof esgAreas;

// 고정 합성 시나리오. 사용자 식별자와 운영 데이터는 포함하지 않는다.
const meetings:ReadonlyArray<{month:string;type:MeetingType;topic:string;area:EsgArea;members:number;capacity:number;confirmed:boolean}> = [
  {month:'2026-09',type:'study',topic:'학습 나눔',area:'S',members:3,capacity:4,confirmed:true},
  {month:'2026-09',type:'study',topic:'자원순환 실천',area:'E',members:2,capacity:3,confirmed:false},
  {month:'2026-09',type:'coffee',topic:'진로 멘토링',area:'S',members:3,capacity:3,confirmed:true},
  {month:'2026-09',type:'lunch',topic:'캠퍼스 플로깅',area:'E',members:2,capacity:4,confirmed:false},
  {month:'2026-10',type:'study',topic:'학습 나눔',area:'S',members:4,capacity:4,confirmed:true},
  {month:'2026-10',type:'study',topic:'자원순환 실천',area:'E',members:3,capacity:3,confirmed:true},
  {month:'2026-10',type:'coffee',topic:'진로 멘토링',area:'S',members:2,capacity:3,confirmed:false},
  {month:'2026-10',type:'lunch',topic:'캠퍼스 플로깅',area:'E',members:3,capacity:4,confirmed:true},
  {month:'2026-10',type:'reflection',topic:'공동체 운영 회고',area:'G',members:3,capacity:3,confirmed:true},
];

function summarize(rows:typeof meetings) {
  return {meetings:rows.length,members:rows.reduce((sum,m)=>sum+m.members,0),confirmed:rows.filter(m=>m.confirmed).length};
}

export function summarizeDemo(month:string,type:MeetingType|'') {
  const selected=meetings.filter(m=>(!month||m.month===month)&&(!type||m.type===type));
  const summary=summarize(selected),capacity=selected.reduce((sum,m)=>sum+m.capacity,0);
  return {
    ...summary,
    areas:(Object.keys(esgAreas) as EsgArea[]).map(area=>({area,...summarize(selected.filter(m=>m.area===area))})),
    fillRate:capacity?Math.round(summary.members/capacity*100):0,
    topics:Array.from(Map.groupBy(selected,m=>m.topic),([topic,rows])=>({topic,...summarize(rows)}))
      .sort((a,b)=>b.members-a.members||a.topic.localeCompare(b.topic,'ko')),
  };
}
