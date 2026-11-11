# 테스트 명세 — 모잇

[요구사항](../01-func/README.md) · [기술 구조](../03-tech/01-architecture.md) · [루트 README](../../README.md#테스트)

## 검증 전략

- 인증·권한·입력 경계·조율·동시성·삭제와 화면 제출·상태·접근성을 검증한다(단순 문구·CSS·호출 횟수 고정 지양).
- 실행 명령·DB 분리는 [README 테스트](../../README.md#테스트), 최종 판정은 [완료 기준](../01-func/01-common.md#완료-기준)을 따른다.

## 아키텍처 경계 검증

[architecture.test.ts](../../backend/tests/architecture.test.ts)로 domain/application의 외부 의존·직접 I/O·SQL·환경 접근 금지([아키텍처와 경계](../03-tech/01-architecture.md#아키텍처와-경계))와 메일 실패 시 OTP 폐기, 삭제 전달 실패 시 재시도, 감사 실패 시 역할 변경 차단을 검증한다.

## 화면 검증

데스크톱 `1920×1080`, 모바일 `360×784` CSS px 뷰포트에서 가로 넘침·메뉴 겹침·긴 라벨·폼·조작 영역을 확인한다.

## API 계약 검증

API 변경 시 [REST API 명세](../03-tech/api.md)의 정상·거부·오류·헤더 계약을 검사하고 OpenAPI·라우터·DTO를 대조한다.
