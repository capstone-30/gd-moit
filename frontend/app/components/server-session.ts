import 'server-only';
import {accountHome,type AccountRole} from '../../../shared/account';
import {cache} from 'react';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentSession} from '../../../backend/composition';

export const currentAccount=cache(async()=>{
  const raw=(await cookies()).get('moit_session')?.value;
  if(!raw) return null;
  return currentSession(raw);
});

export async function requireAccount(role:AccountRole) {
  const account=await currentAccount();
  if(!account) redirect('/login');
  if(account.role!==role) redirect(accountHome(account.role));
  return account;
}
