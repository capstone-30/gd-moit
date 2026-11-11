# Bruno API 요청

[프로젝트 README](../../README.md#시작하기) · [로컬 로그인 데모](../../README.md#로컬-로그인-데모) · [HTTP 어댑터](../adapters/http/api.ts) · [Bruno 공식 문서](https://docs.usebruno.com/testing/script/javascript-reference)

Bruno에서 이 폴더를 열고 `Local` 환경을 선택한다(개인 설정은 Git에서 제외되는 `*.local.bru`로 복사).

## 로그인

1. `origin`을 서버 `APP_ORIGIN`과 맞추고(`baseUrl`은 `/api/v1`), `01-auth`를 번호순(`Configuration` → `Request OTP` → `Login`)으로 실행한다(일반 메일 인증은 `code` 직접 입력).
2. 로그인 직후 `Session CSRF`를 실행한다(쿠키 자동 전송 활성, CSRF 토큰은 런타임 보관).
3. 계정 전환은 `07-account/Logout` → `email` 변경 → `01-auth` 순서로 실행한다.

## 요청 실행

데이터를 변경하므로 합성 데이터에서 개별 요청만 실행한다(전체 일괄 실행 금지).

- 학생: `02-profile`(가능 시간 먼저 저장) · `03-meetings` · `04-safety` · 배정 학생용 `06-hosted-meetings`(상세·조율·서류 제출·철회).
- 담당자: `05-projects`(프로젝트·배정·공지) · `06-hosted-meetings`(공지·CSV·삭제).
- 생성한 ID·ETag는 런타임 변수로 이어지며(기존 ID 사용 시 상세 먼저 조회), 일정·수락·서류·공지 수정/삭제 전 최신 상세·목록을 조회해 `If-Match`(최초 서류 제출은 생략)와 `previousTitle`·`noticeVersion`을 갱신한다. 다음 페이지는 `nextCursor`를 `cursor` 쿼리로 전달한다.
