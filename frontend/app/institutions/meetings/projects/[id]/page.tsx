import {requireAccount} from '../../../../components/server-session';
import {HostedProjectMeetings} from '../../../../components/hosted-meetings';

export default async function Page({params}:{params:Promise<{id:string}>}) {
  await requireAccount('institution');
  return <HostedProjectMeetings projectId={(await params).id}/>;
}
