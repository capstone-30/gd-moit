export default function Landing() {
  return <div className="landing">
    <section className="landing-intro" aria-labelledby="landing-title">
      <div className="landing-copy">
        <p className="school-label">같은 학교, 같은 관심사</p>
        <h1 id="landing-title">혼자 하던 공부도,<br/>함께 나누고 싶은 이야기도.</h1>
        <p className="lede">가능한 시간을 등록하고 관심사가 맞는 동료를 만나보세요. 모임을 찾는 일부터 함께할 시간을 정하는 일까지, 모잇에서 이어집니다.</p>
        <a className="button primary" href="/login">학교 이메일로 시작하기 <span aria-hidden="true">→</span></a>
        <p className="help">학생과 대학 담당자 모두 같은 로그인으로 시작해요.</p>
      </div>
      <div className="landing-types" aria-labelledby="landing-types-title">
        <h2 id="landing-types-title">어떤 시간을 함께할까요?</h2>
        <ul>
          <li><strong>모각공</strong><span>각자 공부해도, 함께 꾸준히</span></li>
          <li><strong>커피챗</strong><span>궁금한 이야기를 가볍게 나눠요</span></li>
          <li><strong>런치챗</strong><span>점심시간에 새로운 동료를 만나요</span></li>
          <li><strong>회고</strong><span>경험과 배움, 다음 시도를 함께 나눠요</span></li>
        </ul>
      </div>
    </section>
    <section className="landing-roles" aria-labelledby="landing-roles-title">
      <h2 id="landing-roles-title">각자의 자리에서, 함께하는 모임</h2>
      <div>
        <article><h3>학생</h3><p>가능 시간을 등록하고 모임을 찾거나 직접 열어요. 배정된 대학 주관 모임의 공지와 제출 서류도 한곳에서 확인해요.</p></article>
        <article><h3>대학 담당자</h3><p>프로젝트와 대학 주관 모임을 만들고, 공지를 보내고 학생들의 제출 서류를 확인해요.</p><p className="help">기관 대시보드의 통계는 합성 데이터 시연으로 제공해요.</p></article>
      </div>
      <p className="help">로그인하면 등록된 계정 유형에 맞는 화면으로 이동해요. 담당자 계정은 운영자가 지정해요.</p>
    </section>
  </div>;
}
