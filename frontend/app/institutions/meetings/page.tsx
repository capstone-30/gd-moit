import {requireAccount} from '../../components/server-session';
import {HostedProjectManager} from '../../components/hosted-meetings';

export default async function Page() {
  await requireAccount('institution');
  return <HostedProjectManager/>;
}
