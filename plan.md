# 구현 계획

[기술 구조](#기술-구조) · [남은 작업](#남은-작업) · [요구사항](spec.md)

## 기술 구조

전체 구성은 [README의 아키텍처 그림](README.md#기술-스택)을 따른다. 아래는 소스별 구현 책임과 의존성 기준이다.

루트 [package.json](package.json)에서 의존성·명령을 공유한다.

`backend/application`은 `backend/domain`에 의존하며 두 계층은 어댑터를 참조하지 않는다. 어댑터는 application의 포트를 구현하고 composition에서 연결한다. HTTP 계약은 [RESTful API 기준](spec.md#restful-api)을 따르며 트랜잭션·잠금·보관 정책은 유지한다.

| 경로 | 책임 |
| --- | --- |
| `frontend/app` | 화면·입력 상태·Next.js 진입점 |
| `backend/domain` | 순수 업무 규칙·오류 |
| `backend/application` | 유스케이스·저장소 및 외부 서비스 포트 |
| `backend/adapters` | HTTP 입력/응답·PostgreSQL·메일·외부 전달 |
| `backend/composition.ts` | 실제 어댑터 주입·실행 경계 |
| `backend/scripts` | 운영 CLI 진입점 |
| `shared` | 화면·서버 공통 타입과 순수 값 |
| `backend/db/migrations` · `deploy` | 스키마·배포 구성 |
| `backend/bruno` | HTTP API 수동 확인용 요청 컬렉션·로컬 환경 예시 |

의존성 경계는 backend 테스트에서 검사한다. 화면은 공통 API 호출·세션 처리를 사용한다.

| 공통 구현 | 원본·구조 |
| --- | --- |
| 계정별 진입 경로 | `shared/account.ts` |
| 대학 주관 활동 템플릿·제출 기본값·포스터 매핑 | `shared/hosted-activities.ts`, 이미지 원본은 `frontend/public/posters` |
| ESG 합성 시나리오·영역 분류 | `frontend/app/institutions/demo.ts` |
| 프로젝트 생성·관리 | 주관 모임 컴포넌트와 API 공유 |
| 함께 배포한 공지 | 모임별 공지를 공통 배포 ID로 묶음 |

화면·권한·업무 정책은 [요구사항](spec.md), 화면 표현은 [디자인 기준](docs/design.md), 배포와 CLI는 [운영 안내](docs/operations.md)를 따른다.

## 남은 작업

| 항목 | 대기 이유 | 재개 조건·작업 |
| --- | --- | --- |
| AI 작성 지원 | `tukorea.console.runyour.ai`에서 약 20,000크레딧 제공 예정. API 호출 규격·사용 가능 모델·단가·유효기간·외부 처리 조건 미확인 | API 문서·이용 조건 확보 후 [선정 기능](docs/specs/student.md#ai-작성-지원)의 서버 연동, 사용 한도·실패 처리와 화면 구현. 키는 서버에서만 사용하고 실제 호출 비용을 측정해 한도 결정 |
| 운영 연결 | AWS 서버·SMTP·삭제/감사 저장소·경보 수신부 미확정 | 접속 정보 확보 후 배포 템플릿 설치, 삭제·복구·학교 메일 수신 검증 |
| 실제 가입 | [출시 조건](spec.md#출시-조건)의 운영값·고지 미확정 | 확정값 반영과 운영 검증 후 가입 개방 |
| 사용성 검증 | 대상 기기 미확보 | 기기 확보 후 반응형 기준과 핵심 흐름 확인 |

작업 기간은 2026-09-28~2026-12-28이다. 우선순위·담당·선행 조건은 [GitHub Project](https://github.com/orgs/capstone-30/projects/1)에서 관리한다.
