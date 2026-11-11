# 모잇 (Moit)

## 소개

같은 학교 학생이 관심 주제와 가능 시간에 맞춰 소규모 모임을 여는 모바일 웹이다. 운영 연결·출시 대기 항목은 [기술 구조](docs/03-tech/01-architecture.md#남은-작업과-리스크)에서 관리한다.

![모잇 핵심 기능](docs/assets/key-features.svg)

### 주요 화면

로컬 데모의 합성 계정·데이터를 모바일 뷰로 촬영했다(클릭 시 원본 표시).

| 학생 홈 | 모임 찾기 | 함께 가능한 시간 | 대학 담당자 프로젝트 관리 |
| --- | --- | --- | --- |
| [![학생 홈에서 가능 시간과 참여 모임 확인](docs/assets/student-home.png)](docs/assets/student-home.png) | [![유형별 열린 모임 탐색](docs/assets/meeting-discovery.png)](docs/assets/meeting-discovery.png) | [![참여자 모두 가능한 교시를 표시한 시간표](docs/assets/meeting-coordination.png)](docs/assets/meeting-coordination.png) | [![주관 프로젝트의 소속 모임과 공지 관리](docs/assets/institution-projects.png)](docs/assets/institution-projects.png) |
| 가능 시간·참여 모임·배정 활동을 확인한다. | 모각공·커피챗·런치챗·회고 모임을 찾아 참여한다. | 참여자 교집합 교시를 확인하고 조율한다. | 프로젝트별 소속 모임·공지·제출 서류를 관리한다. |

## 기술 스택

Next.js App Router · TypeScript · PostgreSQL · SMTP. 구조는 [기술 구조](docs/03-tech/01-architecture.md)를 따른다.

![모잇 시스템 아키텍처](docs/assets/architecture.svg)

## 시작하기

Node.js 버전은 [package.json](package.json)의 `engines`를 따르며 PostgreSQL을 준비해 저장소 루트에서 실행한다(`http://localhost:3000`).

```sh
npm ci
cp frontend/.env.example frontend/.env.local
# DB 연결·32자 이상 AUTH_SECRET·APP_ORIGIN 설정
npm run db:migrate
npm run dev
```

환경 변수는 [설정 예시](frontend/.env.example)를 따른다(개발 메일 파일 수신은 `TEST_MAIL_DIR` 설정). 실제 가입은 [출시 조건](docs/01-func/01-common.md#출시-조건) 충족 전까지 차단된다.

## 사용 방법

### 로컬 로그인 데모

`_demo`로 끝나는 로컬 PostgreSQL DB를 만들고 `frontend/.env.local`에 해당 `DATABASE_URL`, `APP_ORIGIN=http://127.0.0.1:3000`, 32자 이상 `AUTH_SECRET`, `DEMO_LOGIN=true`를 설정한다.

```sh
npm run demo:setup
WATCHPACK_POLLING=true npm run dev -- --hostname 127.0.0.1 --webpack
```

- 로그인 화면에서 학생·담당자 합성 계정을 선택하고 화면에 표시된 인증번호로 로그인한다([로컬 로그인 데모 정책](docs/01-func/01-common.md#로컬-로그인-데모) · [배포 가이드](docs/05-ops/01-deploy.md)).
- `demo:setup`은 합성 가능 시간·자율 모임·템플릿별 주관 프로젝트·공지·제출 예시를 생성한다(재실행 시 기존 활동을 보존한 채 기간 연장 및 누락된 `[데모]` 예시만 보충).

### 학생

학교 이메일 로그인 → 프로필 가능 시간 등록 → 모임 찾기·열기 → 모임 관리 순서로 이용한다([학생 내비게이션](docs/01-func/02-student.md#내비게이션프로필) · [시간표·이미지 불러오기](docs/01-func/02-student.md#시간표이미지-불러오기) · [서류 제출·열람](docs/01-func/03-institution.md#서류-제출열람)).

### 대학 담당자

[운영자 지정](docs/05-ops/02-operations.md#계정-유형-관리) 후 재로그인해 `프로젝트 생성 → 모임 등록 → 공지 작성 → 제출 자료 확인` 순서로 이용한다([기관 내비게이션](docs/01-func/03-institution.md#내비게이션프로필) · [주관 모임 정책](docs/01-func/03-institution.md#대학-주관-모임제출-서류) · [디자인 기준](docs/02-uxui/01-design.md#대학-주관-모임)).

### API

기본 경로는 `/api/v1`([RESTful API 기준](docs/03-tech/api.md#restful-api) · [HTTP 어댑터](backend/adapters/http/api.ts) · [Scalar 문서](http://localhost:3000/docs))이다.

- 변경 요청에 `Origin: APP_ORIGIN`·쿠키·`X-CSRF-Token`(`GET /auth/csrf`에서 발급, 로그인 후 재발급)을 전달한다.
- 조율 요청은 상세 ETag를 `If-Match`로 전달하며 공개 설정은 `GET /configuration`에서 조회한다.
- 수동 호출은 [`backend/bruno`](backend/bruno)와 [Bruno 사용 안내](backend/bruno/README.md)를 따른다.

## 테스트

별도 테스트 DB를 `DATABASE_URL`에 지정·마이그레이션한 뒤 실행한다([테스트 명세](docs/04-test/01-verification.md#검증-전략) · [package.json](package.json) · [CI 워크플로](.github/workflows/ci.yml)).

```sh
npm run typecheck
npm test
npm run build
```

## 관련 문서

- [작업 지침](AGENTS.md): 작업 순서·문서 관리.

### 문서 분류 기준

<!-- doc-standard:start — doc-standard에서 동기화한다. 이 구간은 직접 고치지 않는다. -->
| 위치 | 담는 내용 |
| --- | --- |
| [`docs/01-func/`](docs/01-func/README.md) | 범위, 역할별 기능, 업무 정책, 완료 기준 |
| [`docs/02-uxui/`](docs/02-uxui/01-design.md) | 화면 배치·조작·디자인 기준·시각 자산 |
| [`docs/03-tech/`](docs/03-tech/README.md) | 아키텍처, 소스 구조, 데이터 모델, REST/IPC 계약 |
| [`docs/04-test/`](docs/04-test/01-verification.md) | 검증 방법, 판정 기준, 최신 판정과 증거 |
| [`docs/05-ops/`](docs/05-ops/README.md) | 배포·인프라 구성·운영 점검·장애 대응 |
| `docs/` 루트·주제 폴더 | 비명세 자료(과제 안내, 보고서, 발표, 협업 규칙, 자료 수집 기록) |
| 코드 저장소 루트 README | 로컬 설치·실행·테스트 명령 |

API 상세 원본은 OpenAPI·라우터·DTO이며 명세에는 원본 위치와 한계만 적는다. 배포 절차는 `05-ops/`(없으면 기술 명세)에 두고 로컬 실행 명령은 README를 링크한다.
<!-- doc-standard:end -->
