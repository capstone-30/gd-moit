import MeetingPage from '../../components/meeting';
export const metadata={title:'모임 상세'};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <MeetingPage id={id}/>;}
