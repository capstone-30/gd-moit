import {requireAccount} from '../../../components/server-session';
import {HostedProjectMeetings} from '../../../components/hosted-meetings';

export const metadata={title:'전체 모임 관리'};

export default async function Page() {
  await requireAccount('institution');
  return <HostedProjectMeetings />;
}
