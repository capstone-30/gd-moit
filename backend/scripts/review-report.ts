import {run} from './run';
import {auditOperator,recordAccess} from '../lib/audit';
import {transaction} from '../lib/db';
import {requireThat} from '../lib/errors';
import {uuid,text,choice} from '../lib/controllers/input';
// Run only with designated operator credentials; app sessions cannot reach this script.
const [reportId,status,reason]=process.argv.slice(2);
await run('REPORT_REVIEW_FAILED',async()=>{
  uuid(reportId);choice(status,['upheld','dismissed']);text(reason,1000);
  const operator=auditOperator();
  await transaction(async db=>{
    const report=(await db.query('SELECT * FROM reports WHERE id=$1 AND expires_at>now() FOR UPDATE',[reportId])).rows[0];requireThat(report,404,'NOT_FOUND');
    await recordAccess(operator,report.id,`report.${status}`,reason);
    await db.query('UPDATE reports SET status=$2,reviewed_at=now(),reviewer_id=$3,review_reason=$4 WHERE id=$1',[reportId,status,operator.operatorId,reason]);
  });
});
