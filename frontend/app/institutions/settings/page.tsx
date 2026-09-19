import {requireAccount} from '../../components/server-session';
import AccountControls from '../../components/account-controls';
import ProfileCards from '../../components/profile-cards';

export const metadata={title:'설정'};

export default async function SettingsPage() {
  const account=await requireAccount('institution');
  return <div className="profile-page"><div className="page-heading"><div><h1>프로필</h1></div></div><ProfileCards cards={[
    {id:'account-info',label:'계정 정보',content:<section className="detail-section"><h2>계정 정보</h2><dl className="profile-account-facts"><div><dt>학교 이메일</dt><dd className="break-word">{account.email}</dd></div><div><dt>계정 유형</dt><dd>대학 담당자</dd></div></dl></section>},
    {id:'account',label:'계정 관리',content:<AccountControls/>},
  ]}/></div>;
}
