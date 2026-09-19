import './components/home-dashboard.css';
import {requireAccount} from './components/server-session';
import HomeDashboard from './components/home-dashboard';

export default async function StartPage() {
  await requireAccount('student');
  return <HomeDashboard/>;
}
