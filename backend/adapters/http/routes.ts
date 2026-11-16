import 'server-only';
import type {DB} from '../../application/ports';
import {ApiError,requireThat} from '../../domain/errors';
import {cookieHeader,csrfFor,preauth} from '../security';
import * as input from './input';
import {page} from './pagination';
import * as auth from '../../application/auth';
import {configuration} from '../../application/configuration';
import * as profile from '../../application/profile';
import * as meeting from '../../application/meetings';
import * as safety from '../../application/safety';
import * as lists from '../../application/lists';
import * as hosted from '../../application/hosted-meetings';

export type Result={data?:unknown,status?:number,headers?:Record<string,string>,cookies?:string[],nextCursor?:string|null,otp?:{id:string,email:string,code:string},error?:ApiError,csv?:string};
type Context={db:DB;request:Request;pattern:string;params:Record<string,string>;b:unknown;q:URLSearchParams;raw:string;actor:Awaited<ReturnType<typeof auth.session>>};
type Handler=(context:Context)=>Promise<Result>;
type RouteOptions={public?:boolean;paginated?:boolean;filters?:string[];maxBodyBytes?:number};
function empty(body:unknown) {input.object(body,[]);}
function noticeVersion(request:Request,id:string) {
  const value=request.headers.get('if-match');
  requireThat(value,428,'PRECONDITION_REQUIRED');
  const match=value.match(new RegExp(`^"${id}-v([1-9][0-9]*)"$`));
  requireThat(match&&Number(match[1])<=2147483647,412,'VERSION_CONFLICT');
  return Number(match[1]);
}
const download:Handler=async({db,pattern,params,actor})=>{
  const kind=pattern.endsWith('/activity.csv')?'activity':'expenses';
  return {csv:await hosted.download(db,actor,params.meetingId,params.userId,kind),headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${kind==='activity'?'activity-report':'expense-statement'}.csv"`,'X-Content-Type-Options':'nosniff'}};
};
const coordinate:Handler=async({db,request,pattern,params,b,actor})=>{
  const v=input.object(b,['date','slot']),isProposal=pattern.endsWith('/proposals');
  const {data,etag}=await meeting.coordinate(db,actor,params.meetingId,input.date(v.date),input.integer(v.slot,101,799),request.headers.get('if-match'),isProposal);
  return {data,status:isProposal?201:200,headers:{ETag:etag,Link:`</api/v1/meetings/${params.meetingId}>; rel="related"`}};
};
// Each route owns its HTTP options and handler.
export const routes:[string,string,Handler,RouteOptions?][] = [
  ['hosted-projects','GET POST',async({db,request,b,q,actor})=>{
    if(request.method==='GET') return hosted.projects(db,actor,page(q,`projects:${actor.id}`));
    const data=await hosted.createProject(db,actor,input.hostedProject(b));return {data,status:201,headers:{Location:`/api/v1/hosted-projects/${data.id}`}};
  },{paginated:true}],
  ['hosted-projects/:projectId','GET PATCH DELETE',async({db,request,params,b,actor})=>{
    if(request.method==='DELETE') {
      empty(b);
      await hosted.deleteProject(db,actor,params.projectId);return {status:204};
    }
    return {data:request.method==='GET'?await hosted.projectDetail(db,actor,params.projectId)
      :await hosted.renameProject(db,actor,params.projectId,input.hostedProjectTitle(b))};
  }],
  ['hosted-projects/:projectId/notices','GET POST',async({db,request,params,q,b,actor})=>request.method==='GET'
    ?hosted.projectNotices(db,actor,params.projectId,page(q,`project-notices:${actor.id}:${params.projectId}`))
    :{data:await hosted.publishProjectNotice(db,actor,params.projectId,input.hostedNoticeContent(b)),status:201},{paginated:true,maxBodyBytes:32768}],
  ['hosted-projects/:projectId/notices/:noticeId','PATCH DELETE',async({db,request,params,b,actor})=>{
    if(request.method==='PATCH')return {data:await hosted.updateProjectNotice(db,actor,params.projectId,params.noticeId,input.hostedNoticeUpdate(b))};
    empty(b);
    await hosted.deleteProjectNotice(db,actor,params.projectId,params.noticeId,noticeVersion(request,params.noticeId));return {status:204};
  }],
  ['hosted-projects/:projectId/meetings','POST',async({db,params,b,actor})=>({data:await hosted.createBatch(db,actor,params.projectId,input.hostedMeetingBatch(b)),status:201}),{maxBodyBytes:32768}],
  ['hosted-meetings','GET',async({db,q,actor})=>{
    const projectId=q.has('projectId')?input.uuid(q.get('projectId')):undefined;
    return hosted.list(db,actor,page(q,`hosted:${actor.id}:${projectId??''}`),projectId);
  },{paginated:true,filters:['projectId']}],
  ['hosted-meetings/notices','POST',async({db,b,actor})=>({data:await hosted.publishNotice(db,actor,input.hostedNotice(b)),status:201}),{maxBodyBytes:32768}],
  ['hosted-meetings/:meetingId','GET DELETE',async({db,request,params,b,actor})=>{
    if(request.method==='GET') return {data:await hosted.detail(db,actor,params.meetingId)};
    empty(b);
    await hosted.remove(db,actor,params.meetingId);return {status:204};
  }],
  ['hosted-meetings/:meetingId/schedule','PUT',async({db,request,params,b,actor})=>({data:await hosted.schedule(db,actor,params.meetingId,input.hostedSchedule(b),request.headers.get('if-match'))})],
  ['hosted-meetings/:meetingId/notices','GET POST',async({db,request,params,q,b,actor})=>request.method==='GET'
    ?hosted.notices(db,actor,params.meetingId,page(q,`notices:${actor.id}:${params.meetingId}`))
    :{data:await hosted.publishNotice(db,actor,{...input.hostedNoticeContent(b),meetingIds:[params.meetingId]}),status:201},{paginated:true,maxBodyBytes:32768}],
  ['hosted-meetings/:meetingId/members/me','DELETE',async({db,params,b,actor})=>{
    empty(b);
    await hosted.leave(db,actor,params.meetingId);return {status:204};
  }],
  ['hosted-meetings/:meetingId/documents/me','PATCH',async({db,request,params,b,actor})=>({data:await hosted.submit(db,actor,params.meetingId,input.activityDocuments(b),request.headers.get('if-match'))}),{maxBodyBytes:32768}],
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
    return {status:201,data:{user:await profile.me(db,result.user!)},headers:{Link:'</api/v1/me>; rel="related"'},cookies:[cookieHeader('moit_session',result.token!,604800),cookieHeader('moit_preauth','',0)]};
  },{public:true}],
  ['auth/sessions/current','DELETE',async({db,b,raw})=>{
    empty(b);await auth.logout(db,raw);return {status:204,cookies:[cookieHeader('moit_session','',0)]};
  },{public:true}],
  ['me','GET PATCH DELETE',async({db,request,b,actor})=>{
    if(request.method==='GET') return {data:await profile.me(db,actor)};
    if(request.method==='DELETE') {empty(b);await profile.deleteAccount(db,actor);return {status:204,cookies:[cookieHeader('moit_session','',0)]};}
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
  },{paginated:true,filters:['type','membership']}],
  ['meetings/:meetingId','GET DELETE',async({db,request,params,b,actor})=>{
    if(request.method==='DELETE') {empty(b);await meeting.closeMeeting(db,actor,params.meetingId);return {status:204};}
    const data=await meeting.detail(db,actor,params.meetingId);return {data,headers:{ETag:meeting.etag(data)}};
  }],
  ['meetings/:meetingId/host','PUT',async({db,request,params,b,actor})=>{
    const v=input.object(b,['userId']);const {data,etag}=await meeting.transferHost(db,actor,params.meetingId,input.uuid(v.userId),request.headers.get('if-match'));return {data,headers:{ETag:etag}};
  }],
  ['meetings/:meetingId/members/me','PUT DELETE',async({db,request,params,b,actor})=>{
    empty(b);if(request.method==='PUT') return {data:await meeting.join(db,actor,params.meetingId)};
    await meeting.leave(db,actor,params.meetingId);return {status:204};
  }],
  ['meetings/:meetingId/members/:userId','DELETE',async({db,params,b,actor})=>{
    empty(b);await meeting.leave(db,actor,params.meetingId,params.userId,true);return {status:204};
  }],
  ['meetings/:meetingId/confirmation','PUT DELETE',async context=>{
    if(context.request.method==='PUT') return coordinate(context);
    empty(context.b);
    const {etag}=await meeting.cancelConfirmation(context.db,context.actor,context.params.meetingId,context.request.headers.get('if-match'));
    return {status:204,headers:{ETag:etag}};
  }],
  ['meetings/:meetingId/proposals','POST',coordinate],
  ['meetings/:meetingId/proposals/:proposalId','DELETE',async({db,request,params,b,actor})=>{
    empty(b);const {etag}=await meeting.withdrawProposal(db,actor,params.meetingId,params.proposalId,request.headers.get('if-match'));return {status:204,headers:{ETag:etag}};
  }],
  ['meetings/:meetingId/proposals/:proposalId/acceptances/me','PUT',async({db,request,params,b,actor})=>{
    empty(b);const {data,etag}=await meeting.accept(db,actor,params.meetingId,params.proposalId,request.headers.get('if-match'));return {data,headers:{ETag:etag}};
  }],
  ['meetings/:meetingId/proposals/:proposalId/rejections','POST',async({db,request,params,b,actor})=>{
    empty(b);const {data,etag}=await meeting.withdrawProposal(db,actor,params.meetingId,params.proposalId,request.headers.get('if-match'),true);return {data,headers:{ETag:etag}};
  }],
  ['meetings/:meetingId/comments','GET POST',async({db,request,params,b,q,actor})=>{
    if(request.method==='GET') return lists.comments(db,actor,params.meetingId,page(q,`comments:${actor.id}:${params.meetingId}`));
    const v=input.object(b,['body']),data=await meeting.addComment(db,actor,params.meetingId,input.text(v.body,1000));return {data,status:201,headers:{Link:`</api/v1/meetings/${params.meetingId}/comments>; rel="related"`}};
  },{paginated:true}],
  ['reports','POST',async({db,b,actor})=>{
    const v=input.object(b,['targetType','targetId','reason']);const data=await safety.report(db,actor,{targetType:input.choice(v.targetType,['user','meeting']),targetId:input.uuid(v.targetId),reason:input.text(v.reason,1000)});return {data,status:201,headers:{Link:'</api/v1/me>; rel="related"'}};
  }],
  ['me/blocks','GET',async({db,q,actor})=>(lists.blocks(db,actor,page(q,`blocks:${actor.id}`))),{paginated:true}],
  ['me/blocks/:userId','PUT DELETE',async({db,request,params,b,actor})=>{
    empty(b);const data=await safety.block(db,actor,params.userId,request.method==='DELETE');return request.method==='DELETE'?{status:204}:{data};
  }],
];
