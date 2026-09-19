# 모잇 (Moit)

## 소개

같은 학교 학생이 관심 주제와 가능 시간에 맞춰 소규모 모임을 여는 모바일 웹. MVP는 구현했으며 AWS 운영 연결·출시는 대기 중이다.

## 기술 스택

Next.js App Router·TypeScript·PostgreSQL·SMTP. 구조는 [구현 계획](plan.md)을 따른다.

## 시작하기

Node.js 22.9 이상·PostgreSQL을 준비하고 저장소 루트에서 실행한다.

```sh
npm ci
cp frontend/.env.example frontend/.env.local
# DB 연결·32자 이상 AUTH_SECRET·APP_ORIGIN 설정
npm run db:migrate
npm run dev
```

[환경 변수](frontend/.env.example)를 설정한다. 개발 메일은 `TEST_MAIL_DIR`에 저장한다. 학교·학기 등 운영 설정과 출시 검증이 완료되기 전에는 가입이 차단된다.

## 사용 방법

### 로컬 로그인 데모

별도 로컬 PostgreSQL DB 이름을 `_demo`로 끝나도록 만들고 `frontend/.env.local`에 해당 `DATABASE_URL`, `APP_ORIGIN=http://127.0.0.1:3000`, 32자 이상 `AUTH_SECRET`, `DEMO_LOGIN=true`를 설정한다.

```sh
npm run demo:setup
WATCHPACK_POLLING=true npm run dev -- --hostname 127.0.0.1 --webpack
```

로그인 화면에서 학생 또는 대학 담당자 합성 계정을 선택하고 인증번호를 받는다. 화면의 번호로 인증하면 해당 유형의 화면으로 이동한다. 실제 메일은 발송하지 않는다. 데모 제한은 [요구사항](spec.md#로컬-로그인-데모)을 따른다. 운영은 `DEMO_LOGIN=false`와 별도 운영 DB·메일 설정을 사용한다.

### 일반 사용

`/`에서 로그인 → 학생은 `/meetings` 탐색·`/profile` 시간 등록 또는 `/meetings/new` 개설 → 상세에서 참여·조율·코멘트. 프로필 시간표에서 이미지 업로드 목업으로 예시 공강을 채우고 직접 수정·저장할 수 있다. 프로필에서 차단 해제·로그아웃·탈퇴, `/privacy`에서 운영 고지를 확인한다.

API는 `/api/v1`. 변경 요청에 `Origin: APP_ORIGIN`·쿠키·`X-CSRF-Token`을 전달한다. `GET /auth/csrf`로 토큰을 받고 로그인 후 재발급한다. 조율 요청은 상세 ETag를 `If-Match`로 전달한다. 공개 설정은 `GET /configuration`에서 조회한다.

대학 담당자는 동일한 이메일 인증 후 `/institutions`로 이동한다. 담당자 지정은 [운영 안내](docs/operations.md#계정-유형-관리)를 따른다. 지표 정의와 데이터 정책은 [기관 시연 요구사항](spec.md#기관-시연)을 따른다.

담당자는 `/institutions/meetings`에서 프로젝트를 만든 뒤 선택한다. 모임 입력을 추가해 각 모임의 이름과 학생 이메일을 작성하고 한 번에 등록한다. 프로젝트별 모임을 조회하고, 여러 모임에 공지를 게시하며 제출 현황·서류를 확인한다. 주관 모임 상세의 삭제 메뉴에서 확인 후 모임과 전체 서류를 삭제할 수 있다. 배정된 학생은 `/meetings/institution`에서 활동일·장소를 설정하고 공지를 확인한 뒤 활동일부터 보고서·사용 내역서를 작성한다. 두 서류는 각각 CSV로 내려받으며 제출 범위·보관은 [주관 모임 정책](spec.md#대학-주관-모임제출-서류)을 따른다.

## 테스트

[GitHub Actions](.github/workflows/ci.yml)가 push·PR마다 마이그레이션·타입 검사·테스트·빌드를 실행한다. 검사 명령과 결과는 워크플로·Actions에서 확인한다.

## 관련 문서

[요구사항](spec.md) · [구현 계획](plan.md) · [디자인](docs/design.md) · [운영](docs/operations.md) · [작업 지침](AGENTS.md)
