import './globals.css';
export const metadata={title:{default:'모잇',template:'%s · 모잇'},description:'같은 학교, 같은 관심사. 함께할 시간을 찾아요.'};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="ko"><body><a className="skip-link" href="#content">본문으로 건너뛰기</a><header className="site-header"><a className="wordmark" href="/">모잇<span className="wordmark-dot">.</span></a><nav aria-label="주 메뉴"><a href="/">모임 찾기</a><a href="/profile">내 시간·프로필</a><a href="/login">로그인</a></nav></header><main id="content" className="main">{children}</main><footer className="site-footer"><span>관심사가 만나는 시간, 모잇.</span><a href="/privacy">개인정보 처리 안내</a></footer></body></html>;
}
