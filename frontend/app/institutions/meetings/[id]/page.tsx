import {requireAccount} from '../../../components/server-session';
import {HostedMeetingDetail} from '../../../components/hosted-meetings';

export default async function Page({params}:{params:Promise<{id:string}>}) {
  await requireAccount('institution');
  return <HostedMeetingDetail id={(await params).id} institution/>;
}
