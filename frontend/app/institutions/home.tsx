export default function InstitutionHome() {
  return <div className="home-dashboard institution-home">
    <div className="page-heading"><div><h1>대학 담당자 홈</h1><p className="lede">캠퍼스 활동을 만들고, 프로젝트와 성과를 살펴보세요.</p></div></div>
    <div className="home-overview">
      <section className="home-card home-start"><div><h2>새로운 캠퍼스 활동</h2><p>플로깅·멘토링·학습공동체 템플릿이나 빈 템플릿으로 프로젝트를 시작하세요.</p></div><a className="button primary" href="/institutions/projects/new">프로젝트 생성 <span aria-hidden="true">+</span></a></section>
      <section className="home-card home-start"><div><h2>진행 중인 프로젝트</h2><p>프로젝트별로 모임과 학생을 구성하고 공지·제출 서류를 관리하세요.</p></div><a className="button" href="/institutions/meetings">프로젝트 관리 <span aria-hidden="true">→</span></a></section>
    </div>
    <section className="home-card home-start"><div><h2>ESG 성과 살펴보기</h2><p>합성 데이터로 환경·사회·거버넌스 영역별 캠퍼스 활동을 확인하세요. 실제 ESG 평가나 환경 효과를 측정한 수치는 아닙니다.</p></div><a className="text-link" href="/institutions/esg">ESG 성과 보기 <span aria-hidden="true">→</span></a></section>
  </div>;
}

