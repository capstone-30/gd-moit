import Dashboard from './dashboard';
import {requireAccount} from '../components/server-session';

export const metadata={title:'대학 담당자 시연'};

export default async function InstitutionsPage() {
  await requireAccount('institution');
  return <Dashboard/>;
}
