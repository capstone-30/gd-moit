import {HostedMeetingDetail} from '../../../components/hosted-meetings';

export const metadata={title:'대학 주관 모임'};

export default async function Page({params}:{params:Promise<{id:string}>}) {return <HostedMeetingDetail id={(await params).id}/>;}
