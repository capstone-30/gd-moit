import type {AccountRole} from '../../shared/account';
import type {DB} from './ports';
import {ApiError,requireThat} from '../domain/errors';
import {registrationReady,settings} from './configuration';
import {demoAccounts,demoPrivacyVersion} from './demo';
export type Account={id:string;school_id:string;role:AccountRole;email:string;display_name:string|null;department:string|null;entry_year:number|null;interests:string[];optional_profile_consented_at:Date|null};
import {normalizeEmail} from '../domain/email';
export {normalizeEmail} from '../domain/email';
export async function session(db:DB,rawToken:string) {
  if(!rawToken) return null;
  return (await db.auth.findSession([db.runtime.security.hash(rawToken)])).rows[0]??null;
}
async function limit(db:DB,kind:string,key:string,max:number,gap:number) {
  const keyHash=db.runtime.security.hmac(`${kind}:${key}`);
  await db.auth.removeExpiredLimit([kind,keyHash]);
  const r=(await db.auth.lockLimit([kind,keyHash])).rows[0];
  if(r && (r.count>=max || (gap && Number(r.elapsed)<gap))) throw new ApiError(429,'RATE_LIMITED',r.count>=max?Number(r.remaining):Math.ceil(gap-Number(r.elapsed)));
  await db.auth.recordSend([kind,keyHash]);
}
export async function issueOtp(db:DB,emailInput:string,ip:string) {
  const email=normalizeEmail(emailInput), c=await settings(db);
  if(db.runtime.demoEnabled) requireThat(c?.privacy_version===demoPrivacyVersion&&demoAccounts.some(account=>account.email===email),400,'INVALID_INPUT');
  requireThat(await registrationReady(db,c),503,'REGISTRATION_UNAVAILABLE');
  const domain=email.slice(email.lastIndexOf('@')+1);
  const school=(await db.auth.findSchoolDomain([domain])).rows[0];
  requireThat(school && school.school_id===c.school_id,400,'INVALID_INPUT');
  await limit(db,'email',email,5,60);await limit(db,'ip',ip,20,0);
  const id=db.runtime.newId(),code=db.runtime.otpCode();
  await db.auth.removeChallengesForEmail([email]);
  await db.auth.createChallenge([id,school.school_id,email,db.runtime.security.hmac(`otp:${id}:${email}:${code}`)]);
  return {id,code,email};
}
// Failure returns a value so attempts/consumed OTP are committed, never rolled back.
export async function login(db:DB,input:{challengeId:string,code:string,privacyVersion:string}) {
  const otp=(await db.auth.lockChallenge([input.challengeId])).rows[0];
  if(!otp) return {error:new ApiError(401,'OTP_INVALID')};
  const expired=otp.expires_at.getTime()<=db.runtime.now();
  if(expired || !db.runtime.security.equal(otp.code_hmac,db.runtime.security.hmac(`otp:${otp.id}:${otp.email}:${input.code}`))) {
    if(expired || otp.attempts>=4) await db.auth.removeChallenge([otp.id]);
    else await db.auth.recordFailedAttempt([otp.id]);
    return {error:new ApiError(401,'OTP_INVALID')};
  }
  const c=await settings(db);
  requireThat(c && input.privacyVersion===c.privacy_version,409,'PRIVACY_VERSION_CHANGED');
  let user=(await db.auth.findUserByEmail([otp.email])).rows[0];
  if(!user) {
    requireThat(await registrationReady(db,c),503,'REGISTRATION_UNAVAILABLE');
    requireThat(otp.school_id===c.school_id,503,'REGISTRATION_UNAVAILABLE');
    user=(await db.auth.registerUser([otp.school_id,otp.email,c.privacy_version])).rows[0];
  } else await db.auth.acknowledgePrivacy([user.id,c.privacy_version]);
  await db.auth.consumeChallenge([otp.id]);
  const raw=db.runtime.security.token();await db.auth.createSession([user.id,db.runtime.security.hash(raw)]);
  return {user,token:raw};
}
export async function logout(db:DB,raw:string) {await db.auth.removeSession([db.runtime.security.hash(raw)]);}
