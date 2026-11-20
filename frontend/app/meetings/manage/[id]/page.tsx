import MeetingPage from '../../../components/meeting';

export const metadata={title:'참여 모임 관리'};

export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <MeetingPage id={id} managed/>;
}
