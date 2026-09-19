import {requireAccount} from '../components/server-session';

export default async function MeetingsLayout({children}:{children:React.ReactNode}) {
  await requireAccount('student');
  return children;
}
