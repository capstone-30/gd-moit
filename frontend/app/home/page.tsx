import '../components/home-dashboard.css';
import {requireAccount} from '../components/server-session';
import HomeDashboard from '../components/home-dashboard';

export default async function HomePage() {
  await requireAccount('student');
  return <HomeDashboard/>;
}
