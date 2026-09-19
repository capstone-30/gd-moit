import 'server-only';
import {randomUUID} from 'node:crypto';
import {requireThat} from '../domain/errors';
import type {AccessAudit} from '../application/ports';

export function auditOperator():AccessAudit {
  const operatorId=process.env.OPERATOR_ID,url=process.env.AUDIT_DELIVERY_URL,token=process.env.AUDIT_DELIVERY_TOKEN;
  requireThat(operatorId&&url&&token,503,'AUDIT_UNAVAILABLE');
  return {operatorId,async record(targetId,action,reason) {
    const event={id:randomUUID(),operatorId,at:new Date().toISOString(),targetId,action,reason};
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(event),signal:AbortSignal.timeout(10000)});
    requireThat(response.ok,503,'AUDIT_UNAVAILABLE');
  }};
}
