import {hmac,equal} from './security';
import {ApiError,requireThat} from './errors';
export type Page={limit:number,after:null|{at:string,id:string,rank?:number},binding:string};
export function page(query:URLSearchParams,binding:string):Page {
  const l=query.get('limit')??'20';requireThat(/^\d+$/.test(l) && Number(l)>=1 && Number(l)<=50,400,'INVALID_INPUT');
  let after=null;
  const cursor=query.get('cursor');
  if(cursor) {
    try {
      requireThat(cursor.length<=2048,400,'INVALID_INPUT');const [data,signature,...rest]=cursor.split('.');requireThat(!rest.length && equal(signature??'',hmac(`cursor:${data}`)),400,'INVALID_INPUT');
      const parsed=JSON.parse(Buffer.from(data,'base64url').toString());
      requireThat(parsed.binding===binding && typeof parsed.at==='string' && /^\d{4}-\d\d-\d\dT/.test(parsed.at) && !Number.isNaN(Date.parse(parsed.at)) && /^[0-9a-f-]{36}$/.test(parsed.id),400,'INVALID_INPUT');
      requireThat(parsed.rank===undefined || parsed.rank===0 || parsed.rank===1,400,'INVALID_INPUT');
      after={at:parsed.at,id:parsed.id,...(parsed.rank===undefined?{}:{rank:parsed.rank})};
    } catch {throw new ApiError(400,'INVALID_INPUT');}
  }
  return {limit:Number(l),after,binding};
}
export function cursor(p:Page,at:Date|string,id:string,rank?:number) {const data=Buffer.from(JSON.stringify({binding:p.binding,at:typeof at==='string'?at:at.toISOString(),id,rank})).toString('base64url');return `${data}.${hmac(`cursor:${data}`)}`;}

type CursorRow={id:string,cursor_at:string,cursor_rank?:number};
export function paginate<T extends CursorRow>(rows:T[],p:Page):{data:T[];nextCursor:string|null};
export function paginate<T extends CursorRow,U>(rows:T[],p:Page,map:(row:T)=>U):{data:U[];nextCursor:string|null};
export function paginate<T extends CursorRow,U>(rows:T[],p:Page,map?:(row:T)=>U) {
  const data=rows.slice(0,p.limit),last=data.at(-1);
  return {data:map?data.map(map):data,nextCursor:rows.length>p.limit && last?cursor(p,last.cursor_at,last.id,last.cursor_rank):null};
}
