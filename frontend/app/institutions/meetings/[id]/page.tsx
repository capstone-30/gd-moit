import {requireAccount} from '../../../components/server-session';
import {HostedMeetingDetail} from '../../../components/hosted-meetings';

export const metadata={title:'주관 모임 관리'};

export default async function Page({params}:{params:Promise<{id:string}>}) {
  await requireAccount('institution');
  return <HostedMeetingDetail id={(await params).id} institution/>;
}
