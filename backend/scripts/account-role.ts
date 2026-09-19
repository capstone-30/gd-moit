import {run} from './run';
import {auditOperator,recordAccess} from '../lib/audit';
import {transaction} from '../lib/db';
import {requireThat} from '../lib/errors';
import {uuid,text,choice} from '../lib/controllers/input';

// 웹 요청에서 계정 유형을 변경하지 않고 지정 운영자·감사 환경만 사용한다.
const [userId,role,reason]=process.argv.slice(2);
await run('ACCOUNT_ROLE_FAILED',async()=>{
  uuid(userId);choice(role,['student','institution']);text(reason,1000);
  const operator=auditOperator();
  await transaction(async db=>{
    const user=(await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
    requireThat(user,404,'NOT_FOUND');
    await recordAccess(operator,user.id,`account.role.${role}`,reason);
    await db.query('UPDATE users SET role=$2 WHERE id=$1',[userId,role]);
    await db.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
  });
});
