import 'server-only';
import {transaction as postgresTransaction} from './adapters/db';
import {repositories} from './adapters/repositories';
import * as security from './adapters/security';
import {sendOtp as sendMail} from './adapters/mail';
import {sendOtp as deliverOtp,deliverDeletions as drainDeletions} from './application/delivery';
import {randomInt,randomUUID} from 'node:crypto';
import {demoEnabled} from './domain/demo';
import {sendDeletions} from './adapters/deletions';
import {createHandler} from './adapters/http/api';
import {session} from './application/auth';
import type {DB} from './application/ports';

export const runtime={get demoEnabled(){return demoEnabled(process.env);},
  get deletionDeliveryReady(){return Boolean(process.env.DELETION_DELIVERY_URL&&process.env.DELETION_DELIVERY_TOKEN);},
  get mailReady(){return Boolean(process.env.SMTP_HOST||(process.env.NODE_ENV!=='production'&&process.env.TEST_MAIL_DIR));},
  security,now:()=>Date.now(),newId:randomUUID,otpCode:()=>randomInt(0,1000000).toString().padStart(6,'0')};
export function transaction<T>(work:(db:DB)=>Promise<T>,write=true):Promise<T> {
  return postgresTransaction(client=>work(repositories(client,runtime)),write);
}
export const sendOtp=(challenge:Parameters<typeof sendMail>[0])=>deliverOtp(transaction,sendMail,challenge);
export const deliverDeletions=()=>drainDeletions(transaction,sendDeletions);
export const handle=createHandler({transaction,sendOtp,deliverDeletions});
export const currentSession=(raw:string)=>transaction(db=>session(db,raw),false);
