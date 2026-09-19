import 'server-only';
import {logError} from '../log';
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
import {demoEnabled} from '../models/demo';
import * as hosted from '../models/hosted-meetings';

type Result={data?:unknown,status?:number,headers?:Record<string,string>,cookies?:string[],nextCursor?:string|null,otp?:{id:string,email:string,code:string},error?:ApiError,csv?:string};
type Context={db:DB;request:Request;pattern:string;params:Record<string,string>;b:unknown;q:URLSearchParams;raw:string;actor:Awaited<ReturnType<typeof auth.session>>};
type Handler=(context:Context)=>Promise<Result>;
type RouteOptions={public?:boolean;paginated?:boolean;filters?:string[];maxBodyBytes?:number};
function queryOnly(q:URLSearchParams,keys:string[]) {requireThat([...q.keys()].every(k=>keys.includes(k)) && keys.every(k=>q.getAll(k).length<=1),400,'INVALID_INPUT');}
function empty(body:unknown) {input.object(body,[]);}
const download:Handler=async({db,pattern,params,actor})=>{
  const kind=pattern.endsWith('/activity.csv')?'activity':'expenses';
  return {csv:await hosted.download(db,actor,params.meetingId,params.userId,kind),headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${kind==='activity'?'activity-report':'expense-statement'}.csv"`,'X-Content-Type-Options':'nosniff'}};
};
const coordinate:Handler=async({db,request,pattern,params,b,actor})=>{
  const v=input.object(b,['date','slot']),isProposal=pattern.endsWith('/proposals');
  const {data,etag}=await meeting.coordinate(db,actor,params.meetingId,input.date(v.date),input.integer(v.slot,101,799),request.headers.get('if-match'),isProposal);
  return {data,status:isProposal?201:200,headers:{ETag:etag,...(isProposal?{Location:`/api/v1/meetings/${params.meetingId}/proposals/${data.id}`}:{})}};
};
// Each route owns its HTTP options and handler.
export const routes:[string,string,Handler,RouteOptions?][] = [
  ['hosted-projects','GET POST',async({db,request,b,q,actor})=>{
    if(request.method==='GET') return hosted.projects(db,actor,page(q,`projects:${actor.id}`));
    const data=await hosted.createProject(db,actor,input.hostedProject(b));return {data,status:201};
  },{paginated:true}],
  ['hosted-projects/:projectId/meetings','POST',async({db,params,b,actor})=>({data:await hosted.createBatch(db,actor,params.projectId,input.hostedMeetingBatch(b)),status:201}),{maxBodyBytes:32768}],
  ['hosted-meetings','GET POST',async({db,request,b,q,actor})=>{
    if(request.method==='GET') {
      const projectId=q.has('projectId')?input.uuid(q.get('projectId')):undefined;
      return hosted.list(db,actor,page(q,`hosted:${actor.id}:${projectId??''}`),projectId);
    }
    const data=await hosted.create(db,actor,input.hostedMeeting(b));return {data,status:201,headers:{Location:`/api/v1/hosted-meetings/${data.id}`}};
  },{paginated:true,filters:['projectId']}],
  ['hosted-meetings/notices','POST',async({db,b,actor})=>({data:await hosted.publishNotice(db,actor,input.hostedNotice(b)),status:201}),{maxBodyBytes:32768}],
  ['hosted-meetings/:meetingId','GET DELETE',async({db,request,params,b,actor})=>{
    if(request.method==='GET') return {data:await hosted.detail(db,actor,params.meetingId)};
    const v=input.object(b,['confirmDeletion']);requireThat(v.confirmDeletion===true,400,'INVALID_INPUT');
    await hosted.remove(db,actor,params.meetingId);return {status:204};
  }],
  ['hosted-meetings/:meetingId/schedule','PUT',async({db,request,params,b,actor})=>({data:await hosted.schedule(db,actor,params.meetingId,input.hostedSchedule(b),request.headers.get('if-match'))})],
  ['hosted-meetings/:meetingId/notices','GET',async({db,params,q,actor})=>(hosted.notices(db,actor,params.meetingId,page(q,`notices:${actor.id}:${params.meetingId}`))),{paginated:true}],
  ['hosted-meetings/:meetingId/members/me','DELETE',async({db,params,b,actor})=>{
    const v=input.object(b,['confirmWithdrawal']);requireThat(v.confirmWithdrawal===true,400,'INVALID_INPUT');
    await hosted.leave(db,actor,params.meetingId);return {status:204};
  }],
  ['hosted-meetings/:meetingId/documents/me','PUT',async({db,request,params,b,actor})=>({data:await hosted.submit(db,actor,params.meetingId,input.activityDocuments(b),request.headers.get('if-match'))}),{maxBodyBytes:32768}],
  ['hosted-meetings/:meetingId/documents/:userId/activity.csv','GET',download],
  ['hosted-meetings/:meetingId/documents/:userId/expenses.csv','GET',download],
  ['configuration','GET',async({db})=>({data:await configuration(db)}),{public:true}],
  ['auth/csrf','GET',async({raw,actor})=>{
    const binding=actor?raw:preauth();return {data:{csrfToken:csrfFor(binding)},cookies:actor?[]:[cookieHeader('moit_preauth',binding,600)]};
  },{public:true}],
  ['auth/otp-challenges','POST',async({db,request,b})=>{
    const v=input.object(b,['email']);const otp=await auth.issueOtp(db,input.text(v.email,254),request.headers.get('x-real-ip')??'unavailable');return {status:202,data:{challengeId:otp.id,expiresIn:600,retryAfter:60},otp};
  },{public:true}],
  ['auth/sessions','POST',async({db,b})=>{
    const v=input.object(b,['challengeId','code','privacyVersion','privacyAcknowledged']);const code=input.text(v.code,6);requireThat(/^\d{6}$/.test(code) && v.privacyAcknowledged===true,400,'INVALID_INPUT');
    const result=await auth.login(db,{challengeId:input.uuid(v.challengeId),code,privacyVersion:input.text(v.privacyVersion,100)});
    if(result.error) return {error:result.error};
    return {data:{user:await profile.me(db,result.user!)},cookies:[cookieHeader('moit_session',result.token!,604800),cookieHeader('moit_preauth','',0)]};
  },{public:true}],
  ['auth/sessions/current','DELETE',async({db,b,raw})=>{
    empty(b);await auth.logout(db,raw);return {status:204,cookies:[cookieHeader('moit_session','',0)]};
  },{public:true}],
  ['me','GET PATCH DELETE',async({db,request,b,actor})=>{
    if(request.method==='GET') return {data:await profile.me(db,actor)};
    if(request.method==='DELETE') {const v=input.object(b,['confirmDeletion']);requireThat(v.confirmDeletion===true,400,'INVALID_INPUT');await profile.deleteAccount(db,actor);return {status:204,cookies:[cookieHeader('moit_session','',0)]};}
    return {data:await profile.updateProfile(db,actor,input.profileUpdate(b))};
  }],
  ['me/availability','GET',async({db,actor})=>({data:await profile.savedAvailability(db,actor)})],
  ['me/availability/:termId','GET PUT',async({db,request,params,b,actor})=>{
    if(request.method==='GET') return {data:await profile.availability(db,actor,params.termId)};
    const v=input.object(b,['slots']);return {data:await profile.saveAvailability(db,actor,params.termId,input.slots(v.slots))};
  }],
  ['meetings','GET POST',async({db,request,b,q,actor})=>{
    if(request.method==='GET') {
      const filter=input.meetingFilter(q);
      return lists.listMeetings(db,actor,filter,page(q,JSON.stringify({actor:actor.id,filter})));
    }
    const data=await meeting.createMeeting(db,actor,input.meetingCreate(b));
    return {data,status:201,headers:{Location:`/api/v1/meetings/${data.id}`,ETag:meeting.etag(data)}};
  },{paginated:true,filters:['topic','type','overlapOnly','membership']}],
  ['meetings/:meetingId','GET',async({db,params,actor})=>{
    const data=await meeting.detail(db,actor,params.meetingId);return {data,headers:{ETag:meeting.etag(data)}};
  }],
  ['meetings/:meetingId/members/me','PUT DELETE',async({db,request,params,b,actor})=>{
    empty(b);if(request.method==='PUT') return {data:await meeting.join(db,actor,params.meetingId)};
    await meeting.leave(db,actor,params.meetingId);return {status:204};
  }],
  ['meetings/:meetingId/members/:userId','DELETE',async({db,params,b,actor})=>{
    empty(b);await meeting.leave(db,actor,params.meetingId,params.userId,true);return {status:204};
  }],
  ['meetings/:meetingId/availability/me','GET PUT DELETE',async({db,request,params,b,actor})=>{
    if(request.method==='GET') return {data:await meeting.override(db,actor,params.meetingId)};
    if(request.method==='DELETE') {empty(b);await meeting.deleteOverride(db,actor,params.meetingId);return {status:204};}
    const v=input.object(b,['slots']);return {data:await meeting.saveOverride(db,actor,params.meetingId,input.slots(v.slots))};
  }],
  ['meetings/:meetingId/confirmation','PUT',coordinate],
  ['meetings/:meetingId/proposals','POST',coordinate],
  ['meetings/:meetingId/proposals/:proposalId/acceptances/me','PUT',async({db,request,params,b,actor})=>{
    empty(b);const {data,etag}=await meeting.accept(db,actor,params.meetingId,params.proposalId,request.headers.get('if-match'));return {data,headers:{ETag:etag}};
  }],
  ['meetings/:meetingId/comments','GET POST',async({db,request,params,b,q,actor})=>{
    if(request.method==='GET') return lists.comments(db,actor,params.meetingId,page(q,`comments:${actor.id}:${params.meetingId}`));
    const v=input.object(b,['body']),data=await meeting.addComment(db,actor,params.meetingId,input.text(v.body,1000));return {data,status:201,headers:{Location:`/api/v1/meetings/${params.meetingId}/comments/${data.id}`}};
  },{paginated:true}],
  ['reports','POST',async({db,b,actor})=>{
    const v=input.object(b,['targetType','targetId','reason']);const data=await safety.report(db,actor,{targetType:input.choice(v.targetType,['user','meeting']),targetId:input.uuid(v.targetId),reason:input.text(v.reason,1000)});return {data,status:201,headers:{Location:`/api/v1/reports/${data.id}`}};
  }],
  ['me/blocks','GET',async({db,q,actor})=>(lists.blocks(db,actor,page(q,`blocks:${actor.id}`))),{paginated:true}],
  ['me/blocks/:userId','PUT DELETE',async({db,request,params,b,actor})=>{
    empty(b);const data=await safety.block(db,actor,params.userId,request.method==='DELETE');return request.method==='DELETE'?{status:204}:{data};
  }],
];
function selectRoute(path:string) {
  const parts=path.split('/');
  for(const [pattern,methods,run,options={}] of routes) {
    const keys=pattern.split('/');if(keys.length!==parts.length) continue;
    const params:Record<string,string>={};
    if(keys.every((key,i)=>key.startsWith(':')?(params[key.slice(1)]=input.uuid(parts[i]),true):key===parts[i])) return {pattern,methods,params,options,run};
  }
  throw new ApiError(404,'NOT_FOUND');
}
async function execute(db:DB,request:Request,route:ReturnType<typeof selectRoute>,b:unknown):Promise<Result> {
  const {pattern,params}=route,method=request.method,q=new URL(request.url).searchParams;
  const raw=cookie(request,'moit_session'),actor=await auth.session(db,raw);
  const isPublic=route.options.public;
  if(!isPublic) requireThat(actor,401,'UNAUTHENTICATED');
  if(!isPublic && !pattern.startsWith('hosted-') && !(pattern==='me' && ['GET','DELETE'].includes(method))) requireThat(actor?.role==='student',403,'FORBIDDEN');
  if(method!=='GET') checkCsrf(request,raw,Boolean(actor) || pattern==='auth/sessions/current' && Boolean(raw));
  const paginated=method==='GET'&&route.options.paginated;
  const filters=route.options.filters??[];
  queryOnly(q,paginated?[...filters,'cursor','limit']:[]);
  return route.run({db,request,pattern,params,b,q,raw,actor});
}
export async function handle(request:Request):Promise<Response> {
  const requestId=randomUUID();
  try {
    const path=new URL(request.url).pathname.replace(/^\/api\/v1\/?/,'').replace(/\/$/,'');
    // Validate method/path before consuming a stream or touching DB.
    const route=selectRoute(path);
    if(!route.methods.split(' ').includes(request.method)) return new Response(null,{status:405,headers:{Allow:route.methods.split(' ').join(', '),'Cache-Control':'no-store'}});
    const parsed=request.method==='GET'?{}:await input.body(request,route.options.maxBodyBytes);
    const result=await transaction(db=>execute(db,request,route,parsed),request.method!=='GET');
    if(result.error) throw result.error;
    if(result.otp) {
      await auth.sendOtp(result.otp);
      if(demoEnabled()) result.data={...(result.data as Record<string,unknown>),demoCode:result.otp.code};
    }
    if(path==='me' && request.method==='DELETE') {
      try {await deliverDeletions();}catch {logError('DELETION_DELIVERY_PENDING',requestId);}
    }
    const headers=new Headers({'Cache-Control':'no-store',...result.headers});for(const c of result.cookies??[]) headers.append('Set-Cookie',c);
    if(result.csv!==undefined) return new Response(result.csv,{headers});
    const data=result.nextCursor!==undefined?{data:result.data,nextCursor:result.nextCursor}:path==='auth/csrf'?result.data:{data:result.data};
    return result.status===204?new Response(null,{status:204,headers}):Response.json(data,{status:result.status??200,headers});
  } catch(error) {
    const expected=error instanceof ApiError,e=expected?error:new ApiError(500,'INTERNAL_ERROR');
    if(!expected) logError(e.code,requestId);
    return Response.json({error:{code:e.code,message:messages[e.code]??'요청을 처리할 수 없습니다.',requestId}},{status:e.status,headers:{'Cache-Control':'no-store',...(e.retryAfter?{'Retry-After':String(e.retryAfter)}:{})}});
  }
}
