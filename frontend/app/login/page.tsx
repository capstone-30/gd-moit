import {redirect} from 'next/navigation';
import {accountDestination} from '../../../shared/account';
import {currentAccount} from '../components/server-session';
import LoginForm from './login-form';

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string|string[]}>}) {
  const query=await searchParams,next=typeof query.next==='string'?query.next:undefined;
  const account=await currentAccount();
  if(account) redirect(accountDestination(account.role,next));
  return <LoginForm next={next}/>;
}
