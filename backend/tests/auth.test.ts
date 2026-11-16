import test from 'node:test';
import assert from 'node:assert/strict';
import {login} from '../application/auth';
import type {DB} from '../application/ports';

test('OTP는 재입력 가능한 오류와 만료·폐기를 구분하고 삭제/시도를 보존한다',async()=>{
  for(const [attempts,expired,missing,code,action] of [
    [0,false,false,'OTP_INVALID','attempt'],
    [3,false,false,'OTP_INVALID','attempt'],
    [4,false,false,'OTP_DISCARDED','remove'],
    [0,true,false,'OTP_EXPIRED','remove'],
    [0,false,true,'OTP_DISCARDED',''],
  ] as const) {
    const calls:string[]=[];
    const db={auth:{
      lockChallenge:async()=>({rows:missing?[]:[{id:'challenge',email:'synthetic@example.test',expires_at:new Date(expired?1000:2000),attempts}]}),
      removeChallenge:async()=>{calls.push('remove');},
      recordFailedAttempt:async()=>{calls.push('attempt');},
    },runtime:{now:()=>1000,security:{hmac:()=>'',equal:()=>false}}} as unknown as DB;
    const result=await login(db,{challengeId:'challenge',code:'000000',privacyVersion:'test'});
    assert.equal(result.error?.status,401);assert.equal(result.error?.code,code);
    assert.deepEqual(calls,action?[action]:[]);
  }
});
