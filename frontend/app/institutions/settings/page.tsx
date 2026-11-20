import {requireAccount} from '../../components/server-session';
import AccountControls from '../../components/account-controls';
import {Heading} from '../../components/client';
import ProfileCards from '../../components/profile-cards';

export const metadata={title:'프로필'};

export default async function SettingsPage() {
  const account=await requireAccount('institution');
  return <div className="profile-page"><Heading title="프로필" description="담당자 계정 정보와 로그인 상태를 관리해요."/><div className="profile-account-summary"><p>대학 담당자</p><p className="help break-word">{account.email}</p></div><ProfileCards cards={[
    {id:'account-info',label:'계정 정보',content:<section className="detail-section"><h2>계정 정보</h2><dl className="profile-account-facts"><div><dt>학교 이메일</dt><dd className="break-word">{account.email}</dd></div><div><dt>계정 유형</dt><dd>대학 담당자</dd></div></dl></section>},
    {id:'account',label:'계정',content:<AccountControls/>},
  ]}/></div>;
}
