import {coordinationRange} from '../../../shared/date';
export function dateRange(timezone:string,startsOn:string,endsOn:string,now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(key:string)=>parts.find(p=>p.type===key)!.value;
  const today=`${part('year')}-${part('month')}-${part('day')}`;
  return coordinationRange(today,startsOn,endsOn);
}
