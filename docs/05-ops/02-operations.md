# 운영 안내 — 모잇

[운영 명세](README.md) · [배포 가이드](01-deploy.md) · [문서 안내](../../README.md#관련-문서)

## 계정 유형 관리

담당자 최초 이메일 인증 후 지정 운영자가 별도 감사 환경(웹 서비스와 자격 증명 분리)에서 실행한다([로그인·계정 유형](../01-func/01-common.md#로그인계정-유형) · [출시 조건](../01-func/01-common.md#출시-조건)). 감사 전달 실패 시 변경을 중단하며 성공 후 대상 계정은 재로그인한다.

```sh
npm run accounts:role -- <userId> <student|institution> '<reason>'
```

## 삭제·감사·복구

보관 기간·대상은 [개인정보 정책](../01-func/01-common.md#개인정보-정책)이 원본이다.

### 일일 삭제·저장소

- `npm run retention`([서버 설치](01-deploy.md#서버-설치) 타이머)이 만료 원본 삭제와 미전달 목록 전달(500건 단위, 실패 시 다음 실행 재시도)을 수행한다.
- 삭제 목록과 감사 기록은 서울 S3 암호화·수명 정책이 적용된 별도 비공개 저장소에 보관하며 일반 앱의 수정·삭제를 금지한다.

### 신고 검토

지정 운영자가 별도 감사 환경에서 실행하며 감사 저장 실패 시 변경을 중단한다.

```sh
npm run reports:review -- <reportId> <upheld|dismissed> '<reason>'
```

### 백업 복구

- 자동 DB 백업(목표 RPO 24시간·RTO 4시간) 복원 후 삭제 목록·미전달 outbox 병합 JSON(`entityId`, `deletedAt`)에 `npm run db:restore-deletions -- <file>`과 만료 삭제를 실행하고 미전달 건이 없을 때만 서비스를 연다.

원본: [만료](../../backend/application/retention.ts) · [삭제 전달](../../backend/application/delivery.ts) · [신고 검토](../../backend/scripts/review-report.ts) · [삭제 재적용](../../backend/scripts/restore-deletions.ts).
