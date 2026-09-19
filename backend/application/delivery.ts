import type {Challenge,Delivery,Transaction} from './ports';

export async function sendOtp(transaction:Transaction,delivery:Delivery['mail'],challenge:Challenge) {
  try {await delivery(challenge);}
  catch(error) {
    await transaction(db=>db.auth.removeChallenge([challenge.id]));
    throw error;
  }
}
export async function deliverDeletions(transaction:Transaction,delivery:Delivery['deletions']) {
  const records=await transaction(async db=>(await db.operations.pendingDeletions()).rows,false);
  if(!records.length) return 0;
  await delivery(records.map(r=>({entityId:r.entity_id,deletedAt:r.deleted_at.toISOString()})));
  await transaction(db=>db.operations.markDelivered([records.map(r=>r.id)]));
  return records.length;
}
