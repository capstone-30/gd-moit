# 구현 계획

## 구현 방향

기술 선택·화면 구성·검증 방법의 원본이다. 데이터·HTTP 계약 원본은 `backend/db/migrations`와 `/api/v1` 구현이다. 모바일 우선으로 설계하며 제품 동작은 [요구사항](spec.md#요구사항), 실행 순서·일정 배정은 [GitHub Project](https://github.com/orgs/capstone-30/projects/1)를 따른다.

## 기술 스택

초기 단일 캠퍼스·50명 확보 목표에 맞춰 하나의 Next.js 앱과 관리형 관계형 DB를 사용한다. 이는 용량 검증 결과가 아니라 초기 구성 선택이다.


| 영역       | 결정                                                                  | 이유                                                                    |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 웹·서버   | Next.js App Router·TypeScript, Server Actions/Route Handlers         | 단일 앱으로 웹·서버 통합. Spring Boot·별도 API 서버 도입 안 함        |
| 실행       | 서울`ap-northeast-2`, Lightsail Linux IPv4 2GB 1대                    | 작은 시범 서비스의 배포·비용 구조 단순화                               |
| DB         | 같은 계정·리전 Lightsail 관리형 PostgreSQL, 암호화 지원 2GB Standard | 트랜잭션·행 잠금·자동 백업 사용. 정확한 지원 엔진 버전은 생성 시 고정 |
| 인증·메일 | 서버 OTP·DB 세션 + 서울 SES SMTP                                     | 6자리 OTP·세션을 서버에서 구현, 인증 저장소 일원화                     |
| HTTPS·DNS | Lightsail 고정 IP·DNS + Caddy 자동 TLS                               | 단일 출처로 웹·서버 제공. 도메인 소유 확인 후 실제 URL 기록            |
| 디자인     | CSS 토큰·HTML 폼                                                     | 보존한 디자인 CSS·아이콘 사용. Figma는 별도 디자인 작업                |

### 저장소 구조

- `backend/`: 서버 전용 `lib/`, DB 마이그레이션, 운영 스크립트, API·업무 규칙 테스트.
- `frontend/`: Next.js `app/`, 디자인 토큰, Next.js·TypeScript 설정, 환경 파일, 화면 테스트. `/api/v1` Route Handler는 Next.js 진입점으로 두고 `backend/` Controller에 위임한다.
- `docs/`: 제안서·브랜드·디자인·심사 기준. 요구사항·구현 계획 원본은 루트의 `spec.md`·`plan.md`에 둔다.
- 루트의 `package.json`·잠금 파일로 의존성과 실행 명령을 공유한다. 별도 서버·패키지는 추가하지 않는다.

구조 변경 후 import·문서 링크·마이그레이션 경로·npm 명령을 갱신하고 타입 검사·테스트·프로덕션 빌드를 검증한다.

### AWS 연결·운영

`브라우저 → HTTPS/Caddy → Next.js(127.0.0.1:3000) → 비공개 PostgreSQL(TLS)`; 인증 메일은 서버에서 SES로 전송한다. DB public mode는 끄고 외부에는 80/443만 공개한다. SSH는 지정 운영자 IP만 허용한다. 관리형 DB 비공개 접근은 [AWS 설명](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-configuring-database-public-mode.html)을 따른다.

- Node.js 22 LTS·systemd로 실행·재시작한다. CI에서 타입/테스트/빌드 후 버전별 산출물을 배포하고 헬스 확인 실패 시 직전 산출물로 되돌린다. DB 변경은 버전 SQL과 별도 마이그레이션 계정으로 실행하며 이전 앱과 호환되는 추가 변경부터 적용한다.
- DB 접근은 서버 전용 `pg` 연결 풀·매개변수 SQL로 구현한다. 런타임 계정에는 필요한 테이블 권한만 부여한다. 학교·모임 권한은 서버에서 검사하며 브라우저에 DB 자격 증명을 노출하지 않는다.
- OTP는 암호학적 난수와 서버 비밀키 HMAC으로 저장, 5회 오입력 시 폐기, 재발송 60초 간격·주소당 시간당 5회로 제한한다. IP는 원문 로그 없이 HMAC 키로 1시간만 보관하여 IP당 시간당 20회 제한한다. 존재 여부를 드러내지 않는 응답을 쓴다.
- 세션은 32바이트 난수 토큰의 해시를 DB에 저장한다. 쿠키는 `HttpOnly/Secure/SameSite=Lax/Path=/`, 상태 변경은 동일 출처·CSRF 검사. 정확한 보관 기간은 [정책](spec.md#개인정보운영-정책)을 따른다.
- SES 발신 도메인 소유 확인·DKIM/SPF/DMARC와 production access를 준비한다. [SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)는 인증된 수신자만 허용하므로 해제·실제 학교 수신 테스트 전 공개 가입을 열지 않는다.
- 개발은 로컬 PostgreSQL·테스트 메일함, 배포 검증은 별도 staging Lightsail 앱·DB와 합성 데이터, 실사용은 production 앱·DB로 분리한다. DB·메일 자격 증명·세션 키·도메인을 공유하지 않는다. staging은 검증 기간에만 생성하고 종료 시 삭제한다.
- 비밀값은 Git·빌드·클라이언트 환경 변수에서 제외한다. 서버의 서비스 계정 전용 `0600` 환경 파일에 주입하고 팀 승인된 비밀 저장소로만 전달한다. SES SMTP 자격 증명은 발송 전용, 환경별 분리·노출 시 즉시 교체한다. AWS 운영자는 개인별 IAM·MFA, 공유 루트 계정 사용 금지. 배포 담당만 SSH 접근한다.
- [자동 DB 백업](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database-from-point-in-time-backup.html)의 7일 복구를 사용한다. 삭제 목록은 production DB와 별개인 비공개 S3(서울·암호화·8일 수명)에도 보존한다. 감사 기록은 별도 비공개 S3에 1년 보관하고 일반 앱 계정의 수정/삭제를 금지한다. 버전·사본이 보관 기한을 늘리지 않도록 설정한다.
- 매일 만료 삭제 작업·실패 알림, 외부 헬스 검사, CPU/메모리/디스크·DB 저장 공간·메일 실패 경보를 설정한다. 단일 앱·Standard DB는 자동 이중화가 없으므로 중단 가능성을 수용한다. 복구 목표는 RPO 24시간·RTO 4시간이며 출시 전 실제 복구로 검증한다. 상시 서비스가 필요해지면 다중 인스턴스·HA DB를 다시 결정한다.

## MVP 구현 설계

브라우저 View → REST Controller → Model → PostgreSQL. 운영값은 DB 설정만 사용하고 미설정 가입은 차단한다. 제품 규칙은 [요구사항](spec.md)을 따르고, 구현·검증 증거는 작업 결과 보고에 기록한다.

### MVC 설계


| 책임                        | 구현 원본                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- |
| 화면·입력 상태             | [app](frontend/app), [공통 폼·시간표](frontend/app/components/client.tsx) |
| HTTP·입력·세션·권한 경계 | [REST Controller](backend/lib/controllers/api.ts)                          |
| 데이터·업무 규칙           | [Model](backend/lib/models)                                                |
| 연결·트랜잭션·잠금        | [db.ts](backend/lib/db.ts)                                                 |
| 관계·제약                  | [마이그레이션](backend/db/migrations)                                      |
| 브라우저 요청·CSRF·ETag   | [API 호출](frontend/app/components/api.ts)                                 |

화면은 기존 REST 계약을 호출한다. SQL·인증·권한·업무 규칙을 View에 복제하지 않고, Model은 React·Next.js 화면 API에 의존하지 않는다. 파일럿의 쓰기 직렬화·잠금·재시도는 DB 구현을 원본으로 둔다. 처리 후 화면 재조회, 충돌 시 입력 보존·최신 버전 재조회는 공통 폼과 화면 구현을 따른다.

### 개정 화면 설계

[디자인 기준](docs/design.md)에 따라 공통 토큰·내비게이션·폼·목록·상태 화면을 통일한다. 브랜드 색상과 API·안전 규칙은 유지한다. 목록은 검색·유형 선택·모임 정보 순으로, 상세는 확정 상태·참여자·조율·코멘트 순으로 정리한다. 모바일 360px와 데스크톱 1280px에서 넘침·키보드 포커스·선택/비활성/오류 상태를 확인하고 타입 검사·테스트·빌드를 실행한다. 이 검증 폭은 실제 대상 기기 확정을 대체하지 않는다.


| 화면·FR                                 | 구현 원본                                        |
| ------------------------------------------ | -------------------------------------------------- |
| 인증·01                                 | [로그인](frontend/app/login/page.tsx)            |
| 학기 시간·프로필·탈퇴·02/08           | [프로필](frontend/app/profile/page.tsx)          |
| 탐색·04/08                              | [모임 목록](frontend/app/page.tsx)               |
| 개설·03/08                              | [모임 개설](frontend/app/meetings/new/page.tsx)  |
| 참여·예외·조율·코멘트·안전·02/04~08 | [모임 상세](frontend/app/components/meeting.tsx) |
| 개인정보·N-2                            | [개인정보 안내](frontend/app/privacy/page.tsx)   |

정상·빈 상태·로딩·실패·재시도·저장 전 이탈 확인은 화면 코드를 원본으로 둔다. [브랜드 기준](docs/brand.md), [토큰](frontend/tokens.css), [공통 스타일](frontend/app/globals.css), [앱 아이콘](frontend/app/icon.svg)을 재사용한다. 실제 대상 기기·반응형 기준 확정은 남은 작업이다.

디자인 참고: [Figma 와이어프레임](https://www.figma.com/design/KPnJ23SFWGezCpSYqqIk9f/gd-moit?node-id=8-186) · [프로토타입](https://www.figma.com/proto/KPnJ23SFWGezCpSYqqIk9f/gd-moit?node-id=5-73). 예시 운영값을 실제 설정으로 사용하지 않는다.

### 검증 전략

리팩토링은 공통 브라우저 요청·서버 입력 검증·모임 예외 시간 변경부터 정리한다. 새 의존성 없이 기존 책임 경계를 유지하고 정상·실패 응답과 예외 저장/해제의 회귀를 확인한다.

[API·실제 DB 통합 검증](backend/tests/api.test.ts), [업무 규칙 검증](backend/tests/rules.test.ts), [화면 요청·날짜 검증](frontend/tests/ui.test.ts)을 실행하고 타입 검사·프로덕션 빌드를 통과한다. 브라우저에서 인증→시간 등록→개설/참여→교집합 확정 및 대안 전원 수락→코멘트와 실패 후 재시도를 확인한다. 실제 대상 사용자 흐름·접근성·기기 검증과 AWS 운영 검증은 출시 전 수행한다. 실행 결과·한계는 작업 결과 보고에 기록한다.

[시간 변경 정책](spec.md#대안-확정-후-시간-변경-정책) 반영 시 학기 시간 수정·예외 저장/해제 후 대안 확정 유지, 교집합 확정의 미정 복귀, 수락 중 제안 취소, 인원 감소·신규 참여 조건을 회귀 검증한다.

## 단계별 계획

전체 작업 기간: **2026-09-28~2026-12-28**. 스프린트별 기간·담당자·작업량은 가용 인력 확인 후 SB-05에서 배정한다.

실행 단위·우선순위·완료 조건은 [GitHub Project](https://github.com/orgs/capstone-30/projects/1)에서 관리한다.

전체 기간 확정에 따라 이전 목표일(T3 9/16, T4 10/7, T5 10/28, T6 11/11)은 재배정 대상으로 전환했다.

## 리스크 및 미결정

결정할 작업과 선행 조건은 [GitHub Project의 SB-01~05](https://github.com/orgs/capstone-30/projects/1)에서 관리한다. 기술 선택 시 외부 API·유료 인프라의 비용·조건·부담 주체와 환경 분리·비밀값 관리·팀 협업 조건을 확인한다.

## 남은 운영 연결

[삭제 전달·만료 처리](backend/lib/models/retention.ts), [신고 검토 CLI](backend/scripts/review-report.ts), [복구 전 삭제 재적용](backend/scripts/restore-deletions.ts)은 구현되어 있다. 별도 비공개 저장소의 수신부·AWS 수명/복구 검증·스케줄러·실패 경보는 배포 작업이다. 감사 저장 실패 시 검토 변경을 중단한다.

[시간 변경 정책](spec.md#대안-확정-후-시간-변경-정책)은 확정했으며 코드 반영은 남은 작업이다. 모임 재검증에서 대안 확정의 `POLICY_UNRESOLVED`(503) 차단을 제거하고 확정 방식별 시간 변경 규칙을 적용한다. 기존 차단·롤백을 기대하는 API 테스트도 새 정책으로 갱신한다.
