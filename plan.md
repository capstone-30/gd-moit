# 구현 계획

## 기술 구조

단일 Next.js 앱으로 화면과 서버를 제공한다. 루트 [package.json](package.json)에서 의존성·명령을 공유한다.

`브라우저 → /api/v1 Route Handler → Controller → Model → PostgreSQL`

| 경로·원본 | 책임 |
| --- | --- |
| [frontend/app](frontend/app) | 화면·입력 상태·Route Handler 진입점 |
| [서버 세션](frontend/app/components/server-session.ts) | 화면별 인증·계정 유형 확인·이동 |
| [로컬 로그인 데모](backend/lib/models/demo.ts) | 합성 계정·설정 생성과 개발 환경 제한 |
| [기관 시연](frontend/app/institutions) | 담당자 인증과 합성 데이터 집계·필터 화면 |
| [주관 모임 모델](backend/lib/models/hosted-meetings.ts) · [공통 화면](frontend/app/components/hosted-meetings.tsx) | 프로젝트·주관 모임 일괄 생성·학생 배정·학생 일정 설정·여러 모임 공지·서류 수신·권한 확인·CSV 출력 |
| [공통 폼](frontend/app/components/client.tsx) · [API 호출](frontend/app/components/api.ts) | 조회·오류·제출·CSRF·ETag; 충돌 시 입력 보존·재조회 |
| [Controller](backend/lib/controllers/api.ts) | HTTP 경로·입력·세션·권한·응답 계약 |
| [Model](backend/lib/models) | 데이터·업무 규칙; 화면 프레임워크에 의존하지 않음 |
| [공유 값·날짜](shared) | 서버·화면에서 사용하는 계정별 경로·고지 항목·모임 유형과 순수 날짜 처리 |
| [DB](backend/lib/db.ts) · [마이그레이션](backend/db/migrations) | 연결·트랜잭션·잠금·관계·제약 |
| [배포 설정](deploy) | Caddy·systemd 앱 실행·일일 삭제·실패 알림 템플릿 |

SQL·인증·업무 판정을 화면에 복제하지 않는다. 디자인은 [디자인 기준](docs/design.md), 배포 구성과 CLI는 [운영 안내](docs/operations.md)를 따른다.

## 남은 작업

- AWS 대상 서버·SMTP·별도 삭제/감사 저장소·경보 수신부 정보가 없어 운영 연결 대기. 정보 확보 후 배포 템플릿을 설치하고 삭제·복구·실제 학교 메일 수신을 검증한다.
- 운영 학교·도메인·학기·교시·공개 장소·연락처·위탁/이전 고지 확정 대기. 확정값과 운영 검증을 확보하면 설정을 반영하고 가입을 연다.
- 대상 기기 확보 대기. 확보 후 반응형 기준과 핵심 흐름 사용성을 확인한다.
- 작업 기간은 2026-09-28~2026-12-28. 우선순위·담당·선행 조건은 [GitHub Project](https://github.com/orgs/capstone-30/projects/1)에서 관리한다.
