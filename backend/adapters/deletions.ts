import 'server-only';
export async function sendDeletions(records:{entityId:string;deletedAt:string}[]) {
  if(!process.env.DELETION_DELIVERY_URL || !process.env.DELETION_DELIVERY_TOKEN) throw new Error('DELETION_DELIVERY_UNCONFIGURED');
  // Receiver must idempotently persist {entityId,deletedAt} in a separate private store with an 8-day lifecycle.
  const response=await fetch(process.env.DELETION_DELIVERY_URL,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.DELETION_DELIVERY_TOKEN}`},body:JSON.stringify(records),signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('DELETION_DELIVERY_FAILED');
}
