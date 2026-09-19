import {requireAccount} from '../../components/server-session';
import Dashboard from '../dashboard';
import './dashboard.css';

export const metadata={title:'ESG 성과'};

export default async function Page() {
  await requireAccount('institution');
  return <Dashboard/>;
}
