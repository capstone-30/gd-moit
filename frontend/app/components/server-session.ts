import 'server-only';
import {accountHome} from '../../../shared/account';
import {cache} from 'react';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {transaction} from '../../../backend/lib/db';
import {session} from '../../../backend/lib/models/auth';

export const currentAccount=cache(async()=>{
  const raw=(await cookies()).get('moit_session')?.value;
  if(!raw) return null;
  return transaction(db=>session(db,raw),false);
});

export async function requireAccount(role:'student'|'institution') {
  const account=await currentAccount();
  if(!account) redirect('/login');
  if(account.role!==role) redirect(accountHome(account.role));
  return account;
}
