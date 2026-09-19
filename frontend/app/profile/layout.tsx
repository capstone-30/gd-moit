import {requireAccount} from '../components/server-session';

export default async function ProfileLayout({children}:{children:React.ReactNode}) {
  await requireAccount('student');
  return children;
}
