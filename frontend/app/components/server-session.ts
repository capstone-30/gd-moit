import 'server-only';
import {accountHome,loginPath,type AccountRole} from '../../../shared/account';
import {cache} from 'react';
import {cookies,headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentSession} from '../../../backend/composition';

export const currentAccount=cache(async()=>{
  const raw=(await cookies()).get('moit_session')?.value;
  if(!raw) return null;
  return currentSession(raw);
});

export async function requireAccount(role:AccountRole) {
  const account=await currentAccount();
  if(!account) redirect(loginPath((await headers()).get('x-moit-path')??accountHome(role)));
  if(account.role!==role) redirect(accountHome(account.role));
  return account;
}
