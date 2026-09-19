import {requireAccount} from '../../components/server-session';
import {HostedProjectManager} from '../../components/hosted-meetings';

export const metadata={title:'프로젝트 관리'};

export default async function Page() {
  await requireAccount('institution');
  return <HostedProjectManager/>;
}
