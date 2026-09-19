import 'server-only';
import {randomUUID} from 'node:crypto';
import {requireThat} from './errors';

export function auditOperator() {
  const operatorId=process.env.OPERATOR_ID,url=process.env.AUDIT_DELIVERY_URL,token=process.env.AUDIT_DELIVERY_TOKEN;
  requireThat(operatorId&&url&&token,503,'AUDIT_UNAVAILABLE');
  return {operatorId,url,token};
}
export async function recordAccess(operator:ReturnType<typeof auditOperator>,targetId:string,action:string,reason:string) {
  const event={id:randomUUID(),operatorId:operator.operatorId,at:new Date().toISOString(),targetId,action,reason};
  const response=await fetch(operator.url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${operator.token}`},body:JSON.stringify(event),signal:AbortSignal.timeout(10000)});
  requireThat(response.ok,503,'AUDIT_UNAVAILABLE');
}
