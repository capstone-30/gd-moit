# 모잇 (Moit)

## 소개

같은 학교 학생이 관심 주제와 가능 시간에 맞춰 모각공·커피챗·런치챗을 여는 모바일 웹서비스.

PostgreSQL·REST API에 연결한 MVP 화면을 구현했다. 실제 AWS 운영 연동·출시는 후속 작업이다. [구현·검증 현황](docs/tasks.md).

## 기술 스택

Next.js App Router·TypeScript·PostgreSQL(`pg`)·SMTP. 배포 계획은 AWS Lightsail·관리형 PostgreSQL·SES다. [선정 근거](docs/plan.md#기술-스택).

## 시작하기

Node.js 22.9 이상과 PostgreSQL이 필요하다.

```sh
npm ci
cp .env.example .env.local
# .env.local에 DB 연결·32자 이상 AUTH_SECRET·APP_ORIGIN 설정
npm run db:migrate
npm run dev
```

학교·학기·교시·공개 장소·고지·운영자 연락처는 검증한 값만 DB에 설정한다. 설정 행이 없거나 출시 검증 전에는 가입할 수 없다. 개발 메일은 `TEST_MAIL_DIR`에 저장하고 실서비스는 SMTP를 설정한다. 프로덕션 DB는 `DATABASE_CA`로 인증서를 검증한다.

## 사용 방법

`/login`에서 학교 이메일 인증 → `/profile`에서 학기 시간 등록 → `/`에서 모임 탐색 또는 `/meetings/new`에서 개설 → 상세에서 참여·확정/제안·수락·코멘트를 이용한다. 상세 안전 메뉴에서 신고·차단·내보내기, 프로필에서 차단 해제·로그아웃·탈퇴를 제공한다. `/privacy`에서 정책과 실제 운영 고지를 확인한다.

데이터 원본은 [마이그레이션](db/migrations/001_initial.sql), HTTP 경로·메서드·입력 원본은 [Controller](lib/controllers/api.ts), 업무 규칙은 `lib/models`다. `/api/v1/configuration`으로 공개 운영 설정을 조회한다.

상태 변경은 `Origin: APP_ORIGIN`, 세션/사전 인증 쿠키, `X-CSRF-Token`이 필요하다. 먼저 `GET /api/v1/auth/csrf`에서 토큰을 받고 로그인 후 다시 발급한다. 조율은 모임 상세의 ETag를 `If-Match`로 전달한다. JSON 응답은 `data`, 목록은 `nextCursor`를 포함하며 개인정보는 캐시하지 않는다. [미확정 정책](docs/spec.md#구현-정책-확인-대기)의 시간 변경만 결정 전 차단한다.

운영 시 Caddy가 외부 `X-Real-IP`를 덮어써야 하며 Next.js는 프록시 뒤의 루프백에서 실행한다. 일일 스케줄러가 `npm run retention`을 실행하고 실패 종료를 알리도록 설정한다. 삭제 전달 수신부는 ID·삭제 시각을 별도 비공개 저장소에 멱등 저장·8일 보관하며, 미전달 기록이 남으면 복구 서비스를 열지 않는다.

지정 운영자만 별도 감사 저장소 환경으로 `npm run reports:review -- <reportId> <upheld|dismissed> '<reason>'`를 실행한다. 감사 수신부는 운영자·시각·대상 내부 ID·작업·사유만 1년 보관하고 일반 앱의 수정/삭제를 금지한다. 복구 전 별도 저장소와 미전달 outbox를 합친 JSON 배열(`entityId`, `deletedAt`)을 `npm run db:restore-deletions -- <file>`로 재적용한 뒤 삭제·운영 검증을 다시 수행한다.

## 테스트

```sh
npm run typecheck
npm test
npm run build
# 실제 DB 통합 검증: 반드시 이름이 _test로 끝나는 별도 DB 사용
DATABASE_URL=postgresql://localhost/moit_test npm run db:migrate
DATABASE_URL=postgresql://localhost/moit_test npm test
```

통합 테스트는 합성 데이터를 만들기 위해 테스트 DB를 초기화한다. 테스트 DB URL이 없으면 통합 검증은 건너뛴다. [검증 증거와 미실행 항목](docs/tasks.md#검증).

## 관련 문서

[요구사항](docs/spec.md) · [구현 계획](docs/plan.md) · [GitHub Project](https://github.com/orgs/capstone-30/projects/1) · [작업 현황](docs/tasks.md) · [작업 지침](AGENTS.md) · [제안서](docs/proposal.md) · [심사 기준](docs/evaluation.md) · [브랜드 기준](docs/brand.md)

디자인 자산: [앱 아이콘](app/icon.svg) · [화면 스타일](app/globals.css) · [디자인 토큰](tokens.css).
