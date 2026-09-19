import {redirect} from 'next/navigation';
import {accountHome} from '../../shared/account';
import {currentAccount} from './components/server-session';
import Landing from './components/landing';
import './components/landing.css';

export default async function StartPage() {
  const account=await currentAccount();
  if(account) redirect(accountHome(account.role));
  return <Landing/>;
}
