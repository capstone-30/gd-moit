import {reviewReport} from '../application/operations';
import {run} from './run';
import {auditOperator,recordAccess} from '../adapters/audit';
import {transaction} from '../composition';
import {uuid,text,choice} from '../adapters/http/input';
// Run only with designated operator credentials; app sessions cannot reach this script.
const [reportId,status,reason]=process.argv.slice(2);
await run('REPORT_REVIEW_FAILED',async()=>{
  uuid(reportId);choice(status,['upheld','dismissed']);text(reason,1000);
  const operator=auditOperator();
  await transaction(db=>reviewReport(db,{operatorId:operator.operatorId,record:(...args)=>recordAccess(operator,...args)},reportId,status,reason));
});
