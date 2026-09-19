import './globals.css';
import Navigation from './components/navigation';
import Header from './components/site-header';
import {currentAccount} from './components/server-session';
export const metadata={title:{default:'모잇',template:'%s · 모잇'},description:'같은 학교, 같은 관심사. 함께할 시간을 찾아요.'};
export default async function Layout({children}:{children:React.ReactNode}) {
  const account=await currentAccount();
  return <html lang="ko"><body className={account?'has-bottom-navigation':undefined}><a className="skip-link" href="#content">본문으로 건너뛰기</a><Header/><main id="content" className="main" tabIndex={-1}>{children}</main><footer className="site-footer"><span>관심사가 만나는 시간, 모잇.</span><a href="/privacy">개인정보 처리 안내</a></footer>{account&&<Navigation institution={account.role==='institution'}/>}</body></html>;
}
