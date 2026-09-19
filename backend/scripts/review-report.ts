import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../lib/db';
import {requireThat} from '../lib/errors';
import {uuid,text,choice} from '../lib/controllers/input';
// Run only with designated operator credentials; app sessions cannot reach this script.
const [reportId,status,reason]=process.argv.slice(2);
try {
  uuid(reportId);choice(status,['upheld','dismissed']);text(reason,1000);
  const operator=process.env.OPERATOR_ID;
  requireThat(operator && process.env.AUDIT_DELIVERY_URL && process.env.AUDIT_DELIVERY_TOKEN,503,'AUDIT_UNAVAILABLE');
  await transaction(async db=>{
    const report=(await db.query('SELECT * FROM reports WHERE id=$1 AND expires_at>now() FOR UPDATE',[reportId])).rows[0];requireThat(report,404,'NOT_FOUND');
    const event={id:randomUUID(),operatorId:operator,at:new Date().toISOString(),targetId:report.id,action:`report.${status}`,reason};
    const response=await fetch(process.env.AUDIT_DELIVERY_URL!,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.AUDIT_DELIVERY_TOKEN}`},body:JSON.stringify(event),signal:AbortSignal.timeout(10000)});
    requireThat(response.ok,503,'AUDIT_UNAVAILABLE');
    await db.query('UPDATE reports SET status=$2,reviewed_at=now(),reviewer_id=$3,review_reason=$4 WHERE id=$1',[reportId,status,operator,reason]);
  });
} catch {console.error(JSON.stringify({code:'REPORT_REVIEW_FAILED',at:new Date().toISOString()}));process.exitCode=1;}
finally {await pool.end();}
