import {coordinationRange} from '../../../shared/date';
export function dateRange(timezone:string,startsOn:string,endsOn:string,now=new Date()) {
  return coordinationRange(schoolDate(timezone,now),startsOn,endsOn);
}
export function schoolDate(timezone:string,now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(key:string)=>parts.find(p=>p.type===key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatTimestamp(value:string,timezone:string) {
  return new Intl.DateTimeFormat('ko-KR',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
