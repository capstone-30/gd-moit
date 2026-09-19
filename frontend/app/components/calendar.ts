export function dateRange(timezone:string,startsOn:string,endsOn:string,now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(key:string)=>parts.find(p=>p.type===key)!.value;
  const today=`${part('year')}-${part('month')}-${part('day')}`;
  const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+28);
  return {min:today>startsOn?today:startsOn,max:end.toISOString().slice(0,10)<endsOn?end.toISOString().slice(0,10):endsOn};
}
export function slotMatchesDate(date:string,slot:number){return (new Date(`${date}T00:00:00Z`).getUTCDay()||7)===Math.floor(slot/100);}
