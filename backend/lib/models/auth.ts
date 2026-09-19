import 'server-only';
import {randomInt,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import nodemailer from 'nodemailer';
import type {DB} from '../db';
import {transaction} from '../db';
import {ApiError,requireThat} from '../errors';
import {hmac,hash,token,equal} from '../security';
import {registrationReady,settings} from './configuration';
export function normalizeEmail(email:string) {const trimmed=email.trim();const at=trimmed.lastIndexOf('@');requireThat(at>0 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(trimmed) && trimmed.length<=254,400,'INVALID_INPUT');return `${trimmed.slice(0,at)}@${trimmed.slice(at+1).toLowerCase()}`;}
export async function session(db:DB,rawToken:string) {
  if(!rawToken) return null;
  return (await db.query(`SELECT u.*,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(rawToken)])).rows[0]??null;
}
async function limit(db:DB,kind:string,key:string,max:number,gap:number) {
  const keyHash=hmac(`${kind}:${key}`);
  await db.query('DELETE FROM auth_limits WHERE kind=$1 AND key_hmac=$2 AND expires_at<=now()',[kind,keyHash]);
  const r=(await db.query('SELECT *,extract(epoch FROM now()-last_sent_at) AS elapsed,ceil(extract(epoch FROM expires_at-now())) AS remaining FROM auth_limits WHERE kind=$1 AND key_hmac=$2 FOR UPDATE',[kind,keyHash])).rows[0];
  if(r && (r.count>=max || (gap && Number(r.elapsed)<gap))) throw new ApiError(429,'RATE_LIMITED',undefined,r.count>=max?Number(r.remaining):Math.ceil(gap-Number(r.elapsed)));
  await db.query(`INSERT INTO auth_limits(kind,key_hmac,count,expires_at,last_sent_at) VALUES($1,$2,1,now()+interval '1 hour',now())
    ON CONFLICT(kind,key_hmac) DO UPDATE SET count=auth_limits.count+1,last_sent_at=now()`,[kind,keyHash]);
}
export async function issueOtp(db:DB,emailInput:string,ip:string) {
  const email=normalizeEmail(emailInput), c=await settings(db);
  requireThat(await registrationReady(db,c),503,'REGISTRATION_UNAVAILABLE');
  const domain=email.slice(email.lastIndexOf('@')+1);
  const school=(await db.query('SELECT school_id FROM school_domains WHERE domain=$1',[domain])).rows[0];
  requireThat(school && school.school_id===c.school_id,400,'INVALID_INPUT');
  await limit(db,'email',email,5,60);await limit(db,'ip',ip,20,0);
  const id=randomUUID(),code=randomInt(0,1000000).toString().padStart(6,'0');
  await db.query('DELETE FROM otp_challenges WHERE email=$1',[email]);
  await db.query(`INSERT INTO otp_challenges(id,school_id,email,code_hmac,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,[id,school.school_id,email,hmac(`otp:${id}:${email}:${code}`)]);
  return {id,code,email};
}
export async function sendOtp(challenge:{id:string,code:string,email:string}) {
  try {
    if(process.env.NODE_ENV!=='production' && process.env.TEST_MAIL_DIR) {
      await mkdir(process.env.TEST_MAIL_DIR,{recursive:true,mode:0o700});
      await writeFile(`${process.env.TEST_MAIL_DIR}/${challenge.id}.json`,JSON.stringify({to:{address:challenge.email,name:''},code:challenge.code}),{mode:0o600});
    } else {
      const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
      await transport.sendMail({from:process.env.SMTP_FROM,to:{address:challenge.email,name:''},subject:'모잇 인증번호',text:`인증번호: ${challenge.code}\n10분 이내에 입력해주세요.`});
    }
  } catch {
    await transaction(db=>db.query('DELETE FROM otp_challenges WHERE id=$1',[challenge.id]));
    throw new ApiError(503,'MAIL_UNAVAILABLE');
  }
}
// Failure returns a value so attempts/consumed OTP are committed, never rolled back.
export async function login(db:DB,input:{challengeId:string,code:string,privacyVersion:string,privacyAcknowledged:boolean}) {
  const otp=(await db.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE',[input.challengeId])).rows[0];
  if(!otp) return {error:new ApiError(401,'OTP_INVALID')};
  if(new Date(otp.expires_at)<=new Date() || !equal(otp.code_hmac,hmac(`otp:${otp.id}:${otp.email}:${input.code}`))) {
    if(new Date(otp.expires_at)<=new Date() || otp.attempts>=4) await db.query('DELETE FROM otp_challenges WHERE id=$1',[otp.id]);
    else await db.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1',[otp.id]);
    return {error:new ApiError(401,'OTP_INVALID')};
  }
  const c=await settings(db);
  requireThat(c && input.privacyVersion===c.privacy_version,409,'PRIVACY_VERSION_CHANGED');
  let user=(await db.query('SELECT * FROM users WHERE email=$1',[otp.email])).rows[0];
  if(!user) {
    requireThat(await registrationReady(db,c),503,'REGISTRATION_UNAVAILABLE');
    requireThat(otp.school_id===c.school_id,503,'REGISTRATION_UNAVAILABLE');
    user=(await db.query(`INSERT INTO users(school_id,email,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,now()) RETURNING *`,[otp.school_id,otp.email,c.privacy_version])).rows[0];
  } else await db.query('UPDATE users SET privacy_version=$2,privacy_acknowledged_at=now() WHERE id=$1',[user.id,c.privacy_version]);
  await db.query('DELETE FROM otp_challenges WHERE id=$1',[otp.id]);
  const raw=token();await db.query(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')`,[user.id,hash(raw)]);
  return {user,token:raw};
}
export async function logout(db:DB,raw:string) {await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(raw)]);}
