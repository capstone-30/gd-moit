import 'server-only';
import {logError} from '../log';
import {randomUUID} from 'node:crypto';
import type {Transaction,DB} from '../../application/ports';
import {ApiError,messages,requireThat} from '../../domain/errors';
import {cookie,checkCsrf} from '../security';
import * as input from './input';
import * as auth from '../../application/auth';
import {demoEnabled} from '../../application/demo';
import {routes,type Result} from './routes';

function queryOnly(q:URLSearchParams,keys:string[]) {requireThat([...q.keys()].every(k=>keys.includes(k)) && keys.every(k=>q.getAll(k).length<=1),400,'INVALID_INPUT');}
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
  // /auth/csrf와 같은 기준으로 검증한다. 유효 세션이 없으면(만료·폐기된 쿠키로 로그아웃할 때 포함) 사전 인증 토큰을 쓴다.
  if(method!=='GET') checkCsrf(request,raw,Boolean(actor));
  const paginated=method==='GET'&&route.options.paginated;
  const filters=route.options.filters??[];
  queryOnly(q,paginated?[...filters,'cursor','limit']:[]);
  return route.run({db,request,pattern,params,b,q,raw,actor});
}
export function createHandler({transaction,sendOtp,deliverDeletions}:{transaction:Transaction;sendOtp:(challenge:{id:string,email:string,code:string})=>Promise<void>;deliverDeletions:()=>Promise<number>}) {
return async function handle(request:Request):Promise<Response> {
  const requestId=randomUUID(),head=request.method==='HEAD';
  const respond=(response:Response)=>head?new Response(null,{status:response.status,headers:response.headers}):response;
  try {
    const path=new URL(request.url).pathname.replace(/^\/api\/v1\/?/,'').replace(/\/$/,'');
    // Validate method/path before consuming a stream or touching DB.
    const route=selectRoute(path);
    const methods=route.methods.split(' ');
    if(methods.includes('GET')) methods.push('HEAD');
    methods.push('OPTIONS');
    const allowed={Allow:methods.join(', '),'Cache-Control':'no-store'};
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:allowed});
    if(!methods.includes(request.method)) return respond(new Response(null,{status:405,headers:allowed}));
    if(head) request=new Request(request,{method:'GET'});
    const parsed=request.method==='GET'?{}:await input.body(request,route.options.maxBodyBytes);
    const result=await transaction(db=>execute(db,request,route,parsed),request.method!=='GET');
    if(result.error) throw result.error;
    if(result.otp) {
      await sendOtp(result.otp);
      if(demoEnabled(process.env)) result.data={...(result.data as Record<string,unknown>),demoCode:result.otp.code};
    }
    if(path==='me' && request.method==='DELETE') {
      try {await deliverDeletions();}catch {logError('DELETION_DELIVERY_PENDING',requestId);}
    }
    const headers=new Headers({'Cache-Control':'no-store',...result.headers});for(const c of result.cookies??[]) headers.append('Set-Cookie',c);
    if(result.status===201 && !headers.has('Location') && !headers.has('Link')) {
      const related=route.pattern==='hosted-projects/:projectId/meetings'
        ?`/api/v1/hosted-meetings?projectId=${route.params.projectId}`
        :route.pattern==='hosted-meetings/notices'?'/api/v1/hosted-meetings':new URL(request.url).pathname.replace(/\/$/,'');
      headers.set('Link',`<${related}>; rel="related"`);
    }
    if(request.method==='GET') {
      const url=new URL(request.url);
      headers.append('Link',`<${url.pathname+url.search}>; rel="self"`);
      if(result.nextCursor) {
        url.searchParams.set('cursor',result.nextCursor);
        headers.append('Link',`<${url.pathname+url.search}>; rel="next"`);
      }
    }
    if(result.csv!==undefined) return respond(new Response(result.csv,{headers}));
    const data=path==='auth/csrf'?result.data:{data:result.data,nextCursor:result.nextCursor};
    return respond(result.status===204?new Response(null,{status:204,headers}):Response.json(data,{status:result.status??200,headers}));
  } catch(error) {
    const expected=error instanceof ApiError,e=expected?error:new ApiError(500,'INTERNAL_ERROR');
    if(!expected) logError(e.code,requestId);
    return respond(Response.json({error:{code:e.code,message:messages[e.code]??'요청을 처리할 수 없습니다.',requestId,...(e.row?{row:e.row}:{})}},{status:e.status,headers:{'Cache-Control':'no-store',...(e.retryAfter?{'Retry-After':String(e.retryAfter)}:{})}}));
  }
}
}
