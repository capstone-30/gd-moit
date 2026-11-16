# 기술 구조 및 설계 — 모잇

[요구사항](../01-func/README.md) · [테스트 명세](../04-test/01-verification.md) · [README](../../README.md)

## 아키텍처와 경계

- 전체 구성은 [기술 스택](../../README.md#기술-스택)과 [헥사고날 아키텍처](../assets/hexagonal-architecture.svg)를 따른다. `backend/application`은 `backend/domain`에만 의존하며 두 계층은 어댑터를 참조하지 않고 `composition`에서 포트를 주입한다([아키텍처 경계 검증](../04-test/01-verification.md#아키텍처-경계-검증)).
- HTTP 계약은 [REST API 계약](#rest-api-계약)을 따른다. 라우트 선언은 요청 실행·응답 처리와 분리하고, 화면 공통 코드는 데이터 조회·폼 제출·시간표·표현을 각각 담당한다. 공통 응답 타입은 `shared`에서 관리한다.

## 소스 구조

루트 [package.json](../../package.json)에서 의존성·스크립트를 관리한다.

| 경로 | 책임 |
| --- | --- |
| `frontend/app` | 화면·입력 상태·Next.js 진입점(`institutions/demo.ts`: ESG 합성 시나리오, `public/posters`: 포스터 원본) |
| `backend/domain` · `backend/application` | 순수 업무 규칙·오류 및 유스케이스·포트 인터페이스 |
| `backend/adapters` · `backend/composition.ts` | HTTP·PostgreSQL·메일·외부 전달 어댑터 및 의존성 주입 |
| `backend/scripts` · `backend/db/migrations` · `deploy` | 운영 CLI, DB 마이그레이션, 배포 설정 |
| `shared` | 화면·서버 공통 타입(`account.ts`: 진입 경로, `hosted-activities.ts`: 주관 활동 템플릿·제출 기본값·포스터 매핑) |
| `backend/bruno` | API 수동 확인 컬렉션 |

정책은 [요구사항](../01-func/README.md), 표현은 [디자인 기준](../02-uxui/01-design.md), 배포·CLI는 [운영 명세](../05-ops/README.md)를 따른다.

## REST API 계약

- **진입점·원본**: 기본 경로는 `/api/v1`, 문서는 `/docs`, OpenAPI JSON은 `/openapi.json`([OpenAPI 생성기](../../frontend/app/openapi.json/route.ts))이다. 상세 경로·권한·필드 계약의 원본은 [HTTP 라우트](../../backend/adapters/http/routes.ts)와 [입력 검증](../../backend/adapters/http/input.ts)이며 수동 호출은 [Bruno 요청](../../backend/bruno/README.md)을 따른다.
- **RESTful 규칙**: 자원 중심 URL과 HTTP 메서드(GET·HEAD 조회, POST 생성·처리, PUT 전체 교체, PATCH 부분 수정, DELETE 무본문 삭제, PUT·DELETE 멱등성)를 사용한다. 상태 코드(생성 `201`+`Location`, 비동기 `202`, 무본문 `204`, 문법 오류 `400`, 미디어 타입 오류 `415`, `If-Match` 누락 `428`·불일치 `412`), `Link` 헤더(자신·다음 페이지), `OPTIONS`/`Allow`, `HEAD`, 개인정보 `Cache-Control: no-store`를 제공한다.
- **인증·권한**: `moit_session` 쿠키와 변경 요청 `X-CSRF-Token`(`GET /api/v1/auth/csrf`)으로 인증하며 역할별 권한은 [인증·접근 권한](../01-func/01-common.md#인증접근-권한)을 따른다(업무 요청은 자원 ID·입력·ETag 조건만으로 처리).
- **응답·오류**: 성공은 `{data, nextCursor?}`(CSRF는 `{csrfToken}`, CSV·204·405 제외), 오류는 `{error: {code, message, requestId, row?}}` 형식이며 미허용 쿼리는 거부한다(일괄 등록 오류 `row`는 1부터 시작하는 순서이며 이메일·계정 정보 미포함). OTP 검증은 오입력 `OTP_INVALID`, 만료 `OTP_EXPIRED`, 5회 오입력 폐기·재사용 불가 `OTP_DISCARDED`를 구분한다(모두 401).

## 남은 작업과 리스크

작업 기간은 `2026-09-28~2026-12-28`이며 일정·우선순위는 [GitHub Project](https://github.com/orgs/capstone-30/projects/1)에서 관리한다.

| 항목 | 대기 이유 | 재개 조건·작업 |
| --- | --- | --- |
| AI 작성 지원 | `tukorea.console.runyour.ai`(약 20,000크레딧) API 규격·모델·단가·유효기간·처리 조건 미확인 | 문서·조건 확보 후 [AI 작성 지원](../01-func/02-student.md#ai-작성-지원) 서버 연동·한도/실패 처리 구현 |
| 운영 연결 | AWS 서버·SMTP·삭제/감사 저장소·경보 수신부 미확정 | 접속 정보 확보 후 배포 템플릿 설치 및 삭제·복구·메일 수신 검증 |
| 실제 가입 | [출시 조건](../01-func/01-common.md#출시-조건) 운영값·고지 미확정 | 확정값 반영·운영 검증 후 가입 개방 |
| 사용성 검증 | 대상 기기 미확보 | 기기 확보 후 반응형 및 핵심 흐름 확인 |
| [사용성 후속 정책·근거](https://github.com/capstone-30/gd-moit/issues/2) | 참여자 제안 거절·수동 재조율·로그인 복귀 정책 및 원본 점검 자료 미확정 | 정책 결정 후 요구사항 갱신, 원본 재현 단계 확보 후 미판정 항목 검증. 로그인은 현재 역할별 홈 이동 계약 유지 |
