import 'server-only';
import {mkdir,writeFile} from 'node:fs/promises';
import nodemailer from 'nodemailer';
import {ApiError} from '../domain/errors';
import {demoEnabled} from '../application/demo';
export async function sendOtp(challenge:{id:string,code:string,email:string}) {
  if(demoEnabled(process.env)) return;
  try {
    if(process.env.NODE_ENV!=='production' && process.env.TEST_MAIL_DIR) {
      await mkdir(process.env.TEST_MAIL_DIR,{recursive:true,mode:0o700});
      await writeFile(`${process.env.TEST_MAIL_DIR}/${challenge.id}.json`,JSON.stringify({to:{address:challenge.email,name:''},code:challenge.code}),{mode:0o600});
    } else {
      const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
      await transport.sendMail({from:process.env.SMTP_FROM,to:{address:challenge.email,name:''},subject:'모잇 인증번호',text:`인증번호: ${challenge.code}\n10분 이내에 입력해주세요.`});
    }
  } catch {throw new ApiError(503,'MAIL_UNAVAILABLE');}
}
