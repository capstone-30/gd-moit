export function parseDate(value:string) {
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value?date:null;
}

export function coordinationRange(today:string,startsOn:string,endsOn:string) {
  const end=new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate()+28);
  const latest=end.toISOString().slice(0,10);
  return {min:today>startsOn?today:startsOn,max:latest<endsOn?latest:endsOn};
}
export function slotMatchesDate(date:string,slot:number) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay()||7)===Math.floor(slot/100);
}
