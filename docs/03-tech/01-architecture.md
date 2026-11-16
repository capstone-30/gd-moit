# 기술 구조 및 설계 — 모잇

[요구사항](../01-func/README.md) · [테스트 명세](../04-test/01-verification.md) · [README](../../README.md)

## 아키텍처와 경계

- 전체 구성은 [기술 스택](../../README.md#기술-스택)을 따른다. `backend/application`은 `backend/domain`에만 의존하며 두 계층은 어댑터를 참조하지 않고 `composition`에서 포트를 주입한다([아키텍처 경계 검증](../04-test/01-verification.md#아키텍처-경계-검증)).
- HTTP 계약은 [RESTful API 기준](api.md#restful-api)을 따른다.

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

## 남은 작업과 리스크

작업 기간은 `2026-09-28~2026-12-28`이며 일정·우선순위는 [GitHub Project](https://github.com/orgs/capstone-30/projects/1)에서 관리한다.

| 항목 | 대기 이유 | 재개 조건·작업 |
| --- | --- | --- |
| AI 작성 지원 | `tukorea.console.runyour.ai`(약 20,000크레딧) API 규격·모델·단가·유효기간·처리 조건 미확인 | 문서·조건 확보 후 [AI 작성 지원](../01-func/02-student.md#ai-작성-지원) 서버 연동·한도/실패 처리 구현 |
| 운영 연결 | AWS 서버·SMTP·삭제/감사 저장소·경보 수신부 미확정 | 접속 정보 확보 후 배포 템플릿 설치 및 삭제·복구·메일 수신 검증 |
| 실제 가입 | [출시 조건](../01-func/01-common.md#출시-조건) 운영값·고지 미확정 | 확정값 반영·운영 검증 후 가입 개방 |
| 사용성 검증 | 대상 기기 미확보 | 기기 확보 후 반응형 및 핵심 흐름 확인 |
| [사용성 후속 정책·근거](https://github.com/capstone-30/gd-moit/issues/2) | 참여자 제안 거절·수동 재조율·로그인 복귀 정책 및 원본 점검 자료 미확정 | 정책 결정 후 요구사항 갱신, 원본 재현 단계 확보 후 미판정 항목 검증. 로그인은 현재 역할별 홈 이동 계약 유지 |
