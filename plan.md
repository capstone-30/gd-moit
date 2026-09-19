# 구현 계획

## 기술 구조

전체 구성은 [README의 아키텍처 그림](README.md#기술-스택)을 따른다. 아래는 소스별 구현 책임과 의존성 기준이다.

루트 [package.json](package.json)에서 의존성·명령을 공유한다.

application은 domain에 의존하며 안쪽 계층은 어댑터를 참조하지 않는다. API 계약과 트랜잭션·잠금·보관 정책은 유지한다.

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

의존성 경계는 backend 테스트에서 검사한다. 화면은 공통 API 호출·세션 처리를 사용하고 충돌 시 입력을 보존한 채 최신 상태를 조회한다. 디자인은 [디자인 기준](docs/design.md), 배포 구성과 CLI는 [운영 안내](docs/operations.md)를 따른다.

## 남은 작업

| 항목 | 대기 이유 | 재개 조건·작업 |
| --- | --- | --- |
| AI 작성 지원 | `tukorea.console.runyour.ai`에서 약 20,000크레딧 제공 예정. API 호출 규격·사용 가능 모델·단가·유효기간·외부 처리 조건 미확인 | API 문서·이용 조건 확보 후 [선정 기능](spec.md#ai-작성-지원)의 서버 연동, 사용 한도·실패 처리와 화면 구현. 키는 서버에서만 사용하고 실제 호출 비용을 측정해 한도 결정 |
| 운영 연결 | AWS 서버·SMTP·삭제/감사 저장소·경보 수신부 미확정 | 접속 정보 확보 후 배포 템플릿 설치, 삭제·복구·학교 메일 수신 검증 |
| 실제 가입 | 학교·도메인·학기·교시·공개 장소·연락처·위탁/이전 고지 미확정 | 확정값 반영과 운영 검증 후 가입 개방 |
| 사용성 검증 | 대상 기기 미확보 | 기기 확보 후 반응형 기준과 핵심 흐름 확인 |

작업 기간은 2026-09-28~2026-12-28이다. 우선순위·담당·선행 조건은 [GitHub Project](https://github.com/orgs/capstone-30/projects/1)에서 관리한다.
