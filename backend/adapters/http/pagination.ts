import {hmac,equal} from '../security';
import {ApiError,requireThat} from '../../domain/errors';
import type {Page} from '../../application/pagination';
export {paginate} from '../../application/pagination';
export function page(query:URLSearchParams,binding:string):Page {
  const l=query.get('limit')??'20';requireThat(/^\d+$/.test(l) && Number(l)>=1 && Number(l)<=50,400,'INVALID_INPUT');
  let after=null;
  const encoded=query.get('cursor');
  if(encoded) {
    try {
      requireThat(encoded.length<=2048,400,'INVALID_INPUT');const [data,signature,...rest]=encoded.split('.');requireThat(!rest.length && equal(signature??'',hmac(`cursor:${data}`)),400,'INVALID_INPUT');
      const parsed=JSON.parse(Buffer.from(data,'base64url').toString());
      requireThat(parsed.binding===binding && typeof parsed.at==='string' && /^\d{4}-\d\d-\d\dT/.test(parsed.at) && !Number.isNaN(Date.parse(parsed.at)) && /^[0-9a-f-]{36}$/.test(parsed.id),400,'INVALID_INPUT');
      requireThat(parsed.rank===undefined || parsed.rank===0 || parsed.rank===1,400,'INVALID_INPUT');
      after={at:parsed.at,id:parsed.id,...(parsed.rank===undefined?{}:{rank:parsed.rank})};
    } catch {throw new ApiError(400,'INVALID_INPUT');}
  }
  return {limit:Number(l),after,binding,encode:cursor};
}
export function cursor(p:Page,at:string,id:string,rank?:number) {const data=Buffer.from(JSON.stringify({binding:p.binding,at,id,rank})).toString('base64url');return `${data}.${hmac(`cursor:${data}`)}`;}

