import {HostedMeetingDetail} from '../../../components/hosted-meetings';

export default async function Page({params}:{params:Promise<{id:string}>}) {return <HostedMeetingDetail id={(await params).id}/>;}
