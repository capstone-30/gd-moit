import {requireAccount} from '../../../components/server-session';
import {HostedProjectMeetings} from '../../../components/hosted-meetings';

export default async function Page() {
  await requireAccount('institution');
  return <HostedProjectMeetings />;
}
