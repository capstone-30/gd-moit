import type {AccountRole} from '../../shared/account';
import {changeAccountRole} from '../application/operations';
import {run} from './run';
import {auditOperator,recordAccess} from '../adapters/audit';
import {transaction} from '../composition';
import {uuid,text,choice} from '../adapters/http/input';

// 웹 요청에서 계정 유형을 변경하지 않고 지정 운영자·감사 환경만 사용한다.
const [userId,role,reason]=process.argv.slice(2);
await run('ACCOUNT_ROLE_FAILED',async()=>{
  uuid(userId);choice(role,['student','institution']);text(reason,1000);
  const operator=auditOperator();
  await transaction(db=>changeAccountRole(db,{operatorId:operator.operatorId,record:(...args)=>recordAccess(operator,...args)},userId,role as AccountRole,reason));
});
