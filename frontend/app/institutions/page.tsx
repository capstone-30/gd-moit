import '../components/home-dashboard.css';
import InstitutionHome from './home';
import {requireAccount} from '../components/server-session';

export const metadata={title:'대학 담당자 홈'};

export default async function InstitutionsPage() {
  await requireAccount('institution');
  return <InstitutionHome/>;
}
