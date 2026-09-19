export type Actor={id:string,school_id:string};
export const publicProfile=(r:Record<string,unknown>)=>({department:r.department,entryYear:r.entry_year,interests:r.interests});
export const etag=(m:{id:string,version:string|number})=>`"meeting-${m.id}-v${m.version}"`;
export function intersection(arrays:number[][]) {return arrays.length?arrays[0].filter(s=>arrays.every(a=>a.includes(s))):[];}
export function shouldReset(state:string,count:number,confirmedSlot:number|null,slots:number[],checkTime=true) {
  if(state==='proposing') return true;
  if(state!=='confirmed') return false;
  return count<2 || checkTime && !slots.includes(confirmedSlot!);
}
