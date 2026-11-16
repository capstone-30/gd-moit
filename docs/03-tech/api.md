# REST API 명세 — 모잇

[기능 명세](../01-func/README.md) · [테스트 명세](../04-test/01-verification.md)

## RESTful API

- `/api/v1`은 자원 중심 URL과 HTTP 메서드(GET·HEAD 조회, POST 생성·처리, PUT 전체 교체, PATCH 부분 수정, DELETE 본문 없는 삭제, PUT·DELETE 멱등성)를 사용한다.
- 상태 코드(생성 `201`+`Location`, 비동기 `202`, 무본문 `204`, 문법 오류 `400`, 미디어 타입 오류 `415`, `If-Match` 누락 `428`·불일치 `412`), `Link` 헤더(자신·다음 페이지), `OPTIONS`/`Allow`, `HEAD`, 개인정보 `Cache-Control: no-store`를 제공한다.
- 인증은 [세션 정책](../01-func/01-common.md#인증접근-권한)을 사용하되 업무 요청은 자원 ID·입력·ETag 조건만으로 처리한다.

## 진입점과 원본

- 기본 경로는 `/api/v1`, 문서는 `/docs`, OpenAPI JSON은 `/openapi.json`([OpenAPI 생성기](../../frontend/app/openapi.json/route.ts))이다.
- 상세 경로·권한·필드 계약의 원본은 [HTTP 어댑터](../../backend/adapters/http/api.ts)와 [입력 검증](../../backend/adapters/http/input.ts)이며 수동 호출은 [Bruno 요청](../../backend/bruno/README.md)을 따른다.

## 인증과 응답

- `moit_session` 쿠키와 변경 요청 `X-CSRF-Token`(`GET /api/v1/auth/csrf`)으로 인증하며 역할별 권한은 [인증·접근 권한](../01-func/01-common.md#인증접근-권한)을 따른다.
- 성공은 `{data, nextCursor?}`(CSRF는 `{csrfToken}`, CSV·204·405 제외), 오류는 `{error: {code, message, requestId, row?}}` 형식이며 허용되지 않은 쿼리는 거부한다. 일괄 등록 입력 오류의 `row`는 요청 모임의 1부터 시작하는 순서이며 이메일·계정 정보는 포함하지 않는다.
- OTP 검증은 단순 오입력 `OTP_INVALID`, 만료 `OTP_EXPIRED`, 5회 오입력 폐기 또는 이미 사용할 수 없는 챌린지 `OTP_DISCARDED`를 구분한다(모두 401).
