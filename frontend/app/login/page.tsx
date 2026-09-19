import {redirect} from 'next/navigation';
import {accountHome} from '../../../shared/account';
import {currentAccount} from '../components/server-session';
import LoginForm from './login-form';

export default async function LoginPage() {
  const account=await currentAccount();
  if(account) redirect(accountHome(account.role));
  return <LoginForm/>;
}
