import {requireAccount} from '../../../components/server-session';
import {CreateHostedProject} from '../../../components/hosted-meetings';

export const metadata={title:'프로젝트 생성'};

export default async function Page() {
  await requireAccount('institution');
  return <CreateHostedProject/>;
}
