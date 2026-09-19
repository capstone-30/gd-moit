export type Page={limit:number,after:null|{at:string,id:string,rank?:number},binding:string,encode:(p:Page,at:string,id:string,rank?:number)=>string};
type CursorRow={id:string,cursor_at:string,cursor_rank?:number};
export function paginate<T extends CursorRow,U>(rows:T[],p:Page,map:(row:T)=>U) {
  const data=rows.slice(0,p.limit),last=data.at(-1);
  return {data:data.map(map),nextCursor:rows.length>p.limit && last?p.encode(p,last.cursor_at,last.id,last.cursor_rank):null};
}
