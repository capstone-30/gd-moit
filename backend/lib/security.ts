import 'server-only';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {requireThat} from './errors';
export function secret() {const value=process.env.AUTH_SECRET;requireThat(value && value.length>=32,503,'REGISTRATION_UNAVAILABLE');return value;}
export function hmac(value:string) {return createHmac('sha256',secret()).update(value).digest('hex');}
export function hash(value:string) {return createHash('sha256').update(value).digest('hex');}
export function token() {return randomBytes(32).toString('base64url');}
export function equal(a:string,b:string) {const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
export function cookie(request:Request,name:string) {return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1)??'';}
export function cookieHeader(name:string,value:string,maxAge:number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
export function csrfFor(sessionToken:string) {return hmac(`csrf:${sessionToken}`);}
export function preauth() {const value=`${Date.now()+10*60*1000}.${token()}`;return `${value}.${hmac(`preauth:${value}`)}`;}
export function validPreauth(value:string) {const parts=value.split('.');return parts.length===3 && Number(parts[0])>Date.now() && equal(parts[2],hmac(`preauth:${parts[0]}.${parts[1]}`));}
export function checkCsrf(request:Request,sessionToken:string,authenticated:boolean) {
  requireThat(request.headers.get('origin')===process.env.APP_ORIGIN,403,'CSRF_INVALID');
  const binding=authenticated?sessionToken:cookie(request,'moit_preauth');
  requireThat(authenticated || validPreauth(binding),403,'CSRF_INVALID');
  requireThat(equal(request.headers.get('x-csrf-token')??'',csrfFor(binding)),403,'CSRF_INVALID');
}
