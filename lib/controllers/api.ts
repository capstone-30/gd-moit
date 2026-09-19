import 'server-only';
import {randomUUID} from 'node:crypto';
import {transaction,type DB} from '../db';
import {ApiError,messages,requireThat} from '../errors';
import {cookie,cookieHeader,checkCsrf,csrfFor,preauth} from '../security';
import * as input from './input';
import {page} from '../pagination';
import * as auth from '../models/auth';
import {configuration} from '../models/configuration';
import * as profile from '../models/profile';
import * as meeting from '../models/meetings';
import * as safety from '../models/safety';
import * as lists from '../models/lists';
import {deliverDeletions} from '../models/retention';

// One route table is the executable HTTP contract; no second API specification.
export const routes = [
  ['configuration','GET'],['auth/csrf','GET'],['auth/otp-challenges','POST'],['auth/sessions','POST'],['auth/sessions/current','DELETE'],
  ['me','GET PATCH DELETE'],['me/availability/:termId','GET PUT'],['meetings','GET POST'],['meetings/:meetingId','GET'],
  ['meetings/:meetingId/members/me','PUT DELETE'],['meetings/:meetingId/members/:userId','DELETE'],
  ['meetings/:meetingId/availability/me','GET PUT DELETE'],['meetings/:meetingId/confirmation','PUT'],
  ['meetings/:meetingId/proposals','POST'],['meetings/:meetingId/proposals/:proposalId/acceptances/me','PUT'],
  ['meetings/:meetingId/comments','GET POST'],['reports','POST'],['me/blocks','GET'],['me/blocks/:userId','PUT DELETE'],
] as const;
type Result={data?:unknown,status?:number,headers?:Record<string,string>,cookies?:string[],list?:boolean,nextCursor?:string|null,otp?:{id:string,email:string,code:string},error?:ApiError};
function queryOnly(q:URLSearchParams,keys:string[]) {requireThat([...q.keys()].every(k=>keys.includes(k)) && keys.every(k=>q.getAll(k).length<=1),400,'INVALID_INPUT');}
function empty(body:unknown) {input.object(body,[]);}
function selectRoute(path:string) {
  const parts=path.split('/');
  for(const [pattern,methods] of routes) {
    const keys=pattern.split('/');if(keys.length!==parts.length) continue;
    const params:Record<string,string>={};
    if(keys.every((key,i)=>key.startsWith(':')?(params[key.slice(1)]=input.uuid(parts[i]),true):key===parts[i])) return {pattern,methods,params};
  }
  throw new ApiError(404,'NOT_FOUND');
}
async function execute(db:DB,request:Request,route:ReturnType<typeof selectRoute>,b:unknown):Promise<Result> {
  const {pattern,params}=route,method=request.method,q=new URL(request.url).searchParams;
  const raw=cookie(request,'moit_session'),actor=await auth.session(db,raw);
  const isPublic=['configuration','auth/csrf','auth/otp-challenges','auth/sessions','auth/sessions/current'].includes(pattern);
  if(!isPublic) requireThat(actor,401,'UNAUTHENTICATED');
  if(method!=='GET') checkCsrf(request,raw,Boolean(actor) || pattern==='auth/sessions/current' && Boolean(raw));
  queryOnly(q,pattern==='meetings' && method==='GET'?['topic','type','overlapOnly','cursor','limit']:pattern==='me/blocks'||pattern.endsWith('/comments') && method==='GET'?['cursor','limit']:[]);
  if(pattern==='configuration') return {data:await configuration(db)};
  if(pattern==='auth/csrf') {
    const binding=actor?raw:preauth();return {data:{csrfToken:csrfFor(binding)},cookies:actor?[]:[cookieHeader('moit_preauth',binding,600)]};
  }
  if(pattern==='auth/otp-challenges') {const v=input.object(b,['email']);const otp=await auth.issueOtp(db,input.text(v.email,254),request.headers.get('x-real-ip')??'unavailable');return {status:202,data:{challengeId:otp.id,expiresIn:600,retryAfter:60},otp};}
  if(pattern==='auth/sessions') {
    const v=input.object(b,['challengeId','code','privacyVersion','privacyAcknowledged']);const code=input.text(v.code,6);requireThat(/^\d{6}$/.test(code) && v.privacyAcknowledged===true,400,'INVALID_INPUT');
    const result=await auth.login(db,{challengeId:input.uuid(v.challengeId),code,privacyVersion:input.text(v.privacyVersion,100),privacyAcknowledged:true});
    if(result.error) return {error:result.error};
    return {data:{user:await profile.me(db,result.user!)},cookies:[cookieHeader('moit_session',result.token!,604800),cookieHeader('moit_preauth','',0)]};
  }
  if(pattern==='auth/sessions/current') {empty(b);await auth.logout(db,raw);return {status:204,cookies:[cookieHeader('moit_session','',0)]};}
  // Session was read within this transaction and protected again after concurrent deletion retries.
  requireThat(actor,401,'UNAUTHENTICATED');
  if(pattern==='me') {
    if(method==='GET') return {data:await profile.me(db,actor)};
    if(method==='DELETE') {const v=input.object(b,['confirmDeletion']);requireThat(v.confirmDeletion===true,400,'INVALID_INPUT');await profile.deleteAccount(db,actor);return {status:204,cookies:[cookieHeader('moit_session','',0)]};}
    const v=input.object(b,['displayName','department','entryYear','interests','optionalProfileConsent']);
    for(const k of ['displayName','department']) if(v[k]!=null) v[k]=input.text(v[k],100,true);
    if(v.entryYear!=null) v.entryYear=input.integer(v.entryYear,1,9999);
    if(v.interests!=null) {requireThat(Array.isArray(v.interests) && v.interests.length<=10,400,'INVALID_INPUT');v.interests=[...new Set(v.interests.map((s:unknown)=>input.text(s,100)))];}
    if(v.optionalProfileConsent!==undefined) input.boolean(v.optionalProfileConsent);
    return {data:await profile.updateProfile(db,actor,v)};
  }
  if(pattern==='me/availability/:termId') {
    const v=method==='PUT'?input.object(b,['slots']):{};return {data:await profile.availability(db,actor,params.termId,method==='PUT'?input.slots(v.slots):undefined)};
  }
  if(pattern==='meetings') {
    if(method==='GET') {
      const filter={topic:q.has('topic')?input.text(q.get('topic'),100,true):'',type:q.has('type')?input.choice(q.get('type'),['study','coffee','lunch']):null,overlapOnly:q.has('overlapOnly')?input.choice(q.get('overlapOnly'),['true','false'])==='true':false};
      return {...await lists.listMeetings(db,actor,filter,page(q,JSON.stringify({actor:actor.id,filter}))),list:true};
    }
    const v=input.object(b,['termId','topic','type','placeId','capacity','twoPersonAcknowledged']);
    if(v.twoPersonAcknowledged!==undefined) input.boolean(v.twoPersonAcknowledged);
    const data=await meeting.createMeeting(db,actor,{termId:input.uuid(v.termId),topic:input.text(v.topic,100),type:input.choice(v.type,['study','coffee','lunch']),placeId:input.uuid(v.placeId),capacity:v.capacity===undefined?3:input.integer(v.capacity,2,4),twoPersonAcknowledged:v.twoPersonAcknowledged});
    return {data,status:201,headers:{Location:`/api/v1/meetings/${data.id}`,ETag:meeting.etag(data)}};
  }
  if(pattern==='meetings/:meetingId') {const data=await meeting.detail(db,actor,params.meetingId);return {data,headers:{ETag:meeting.etag(data)}};}
  if(pattern==='meetings/:meetingId/members/me') {
    empty(b);if(method==='PUT') return {data:await meeting.join(db,actor,params.meetingId)};
    await meeting.leave(db,actor,params.meetingId);return {status:204};
  }
  if(pattern==='meetings/:meetingId/members/:userId') {empty(b);await meeting.leave(db,actor,params.meetingId,params.userId,true);return {status:204};}
  if(pattern==='meetings/:meetingId/availability/me') {
    const v=method==='PUT'?input.object(b,['slots']):{};if(method==='DELETE') empty(b);
    const data=await meeting.override(db,actor,params.meetingId,method==='PUT'?input.slots(v.slots):method==='DELETE'?null:undefined);return method==='DELETE'?{status:204}:{data};
  }
  if(['meetings/:meetingId/confirmation','meetings/:meetingId/proposals'].includes(pattern)) {
    const v=input.object(b,['date','slot']),isProposal=pattern.endsWith('/proposals');
    const data=await meeting.coordinate(db,actor,params.meetingId,input.date(v.date),input.integer(v.slot,101,799),request.headers.get('if-match'),isProposal);
    const m=await meeting.getMeeting(db,actor,params.meetingId);
    return {data,status:isProposal?201:200,headers:{ETag:meeting.etag(m),...(isProposal?{Location:`/api/v1/meetings/${params.meetingId}/proposals/${data.id}`}:{})}};
  }
  if(pattern==='meetings/:meetingId/proposals/:proposalId/acceptances/me') {empty(b);const data=await meeting.accept(db,actor,params.meetingId,params.proposalId,request.headers.get('if-match'));return {data,headers:{ETag:meeting.etag(await meeting.getMeeting(db,actor,params.meetingId))}};}
  if(pattern==='meetings/:meetingId/comments') {
    if(method==='GET') return {...await lists.comments(db,actor,params.meetingId,page(q,`comments:${actor.id}:${params.meetingId}`)),list:true};
    const v=input.object(b,['body']),data=await meeting.addComment(db,actor,params.meetingId,input.text(v.body,1000));return {data,status:201,headers:{Location:`/api/v1/meetings/${params.meetingId}/comments/${data.id}`}};
  }
  if(pattern==='reports') {
    const v=input.object(b,['targetType','targetId','reason']);const data=await safety.report(db,actor,{targetType:input.choice(v.targetType,['user','meeting']),targetId:input.uuid(v.targetId),reason:input.text(v.reason,1000)});return {data,status:201,headers:{Location:`/api/v1/reports/${data.id}`}};
  }
  if(pattern==='me/blocks') return {...await lists.blocks(db,actor,page(q,`blocks:${actor.id}`)),list:true};
  if(pattern==='me/blocks/:userId') {empty(b);const data=await safety.block(db,actor,params.userId,method==='DELETE');return method==='DELETE'?{status:204}:{data};}
  throw new ApiError(404,'NOT_FOUND');
}
export async function handle(request:Request):Promise<Response> {
  const requestId=randomUUID();
  try {
    const path=new URL(request.url).pathname.replace(/^\/api\/v1\/?/,'').replace(/\/$/,'');
    // Validate method/path before consuming a stream or touching DB.
    const route=selectRoute(path);
    if(!route.methods.split(' ').includes(request.method)) return new Response(null,{status:405,headers:{Allow:route.methods.split(' ').join(', '),'Cache-Control':'no-store'}});
    const parsed=request.method==='GET'?{}:await input.body(request);
    const result=await transaction(db=>execute(db,request,route,parsed),request.method!=='GET');
    if(result.error) throw result.error;
    if(result.otp) await auth.sendOtp(result.otp);
    if(path==='me' && request.method==='DELETE') {
      try {await deliverDeletions();}catch {console.error(JSON.stringify({requestId,code:'DELETION_DELIVERY_PENDING',at:new Date().toISOString()}));}
    }
    const headers=new Headers({'Cache-Control':'no-store',...result.headers});for(const c of result.cookies??[]) headers.append('Set-Cookie',c);
    const data=result.list?{data:result.data,nextCursor:result.nextCursor}:path==='auth/csrf'?result.data:{data:result.data};
    return result.status===204?new Response(null,{status:204,headers}):Response.json(data,{status:result.status??200,headers});
  } catch(error) {
    const expected=error instanceof ApiError,e=expected?error:new ApiError(500,'INTERNAL_ERROR');
    if(!expected) console.error(JSON.stringify({requestId,code:e.code,at:new Date().toISOString()}));
    return Response.json({error:{code:e.code,message:messages[e.code]??'요청을 처리할 수 없습니다.',requestId,...(e.fields?{fields:e.fields}:{})}},{status:e.status,headers:{'Cache-Control':'no-store',...(e.retryAfter?{'Retry-After':String(e.retryAfter)}:{})}});
  }
}
