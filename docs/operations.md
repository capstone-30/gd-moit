# 운영 안내

## 배포 구성

계획 구성: 서울 `ap-northeast-2`의 Lightsail Linux IPv4 2GB·암호화 지원 관리형 PostgreSQL 2GB Standard·SES SMTP. DB 엔진 버전은 생성 시 고정한다. 단일 인스턴스 구성으로 자동 이중화는 없다.

`브라우저 → HTTPS/Caddy → Next.js(127.0.0.1:3000) → 비공개 PostgreSQL(TLS)`

- 고정 IP·DNS·Caddy TLS, 외부 80/443만 공개하고 SSH는 운영자 IP로 제한한다. Caddy는 외부 `X-Real-IP`를 덮어쓴다. DB public mode를 끄고 `DATABASE_CA`로 인증서를 검증한다.
- Node.js 22 LTS·systemd로 실행·재시작한다. CI 통과 산출물을 배포하고 헬스 검사 실패 시 직전 버전으로 되돌린다. DB는 별도 마이그레이션 계정으로 이전 앱과 호환되는 추가 변경부터 적용한다.
- 런타임 DB 계정은 최소 권한, SQL은 매개변수화한다. OTP는 난수·HMAC, 세션은 32바이트 난수 토큰 해시로 저장한다. 쿠키는 `HttpOnly/Secure/SameSite=Lax/Path=/`; 개인정보 응답은 캐시하지 않는다.
- 개발·staging·production의 DB·키·메일·도메인을 분리한다. staging은 합성 데이터만 사용하고 검증 후 삭제한다.
- 비밀값은 Git·빌드·클라이언트에 넣지 않고 서비스 계정 전용 `0600` 환경 파일로 주입한다. 승인된 비밀 저장소로 공유하고 노출 시 교체한다. AWS 개인 IAM·MFA, 배포 담당자만 SSH, SES 발송 전용 자격 증명을 사용한다.
- SES 도메인·DKIM/SPF/DMARC·production access와 실제 학교 수신을 확인한다. 공개 가입 조건은 [요구사항](../spec.md#출시-조건)을 따른다.

## 서버 설치

[배포 템플릿](../deploy)은 Linux systemd·Caddy용이다. 대상 서버가 확정되면 `/usr/bin/node`에 Node.js를 설치하고 로그인 불가 서비스 계정 `moit`, 릴리스 디렉터리 `/opt/moit/releases`, 현재 릴리스 심볼릭 링크 `/opt/moit/current`를 준비한다. 릴리스는 코드·`node_modules`·빌드 결과를 포함하고 서비스 계정은 읽기만 허용한다. `frontend/.next/cache`는 미리 만들고 해당 계정에만 쓰기를 허용한다. 로컬 `.env.local`은 배포하지 않는다.

`/etc/moit`는 root 소유·그룹 `moit`·`0750`, 다음 비밀 파일은 root 소유·그룹 `moit`·`0640`으로 둔다. 키 원본은 [환경 변수](../frontend/.env.example)를 따른다.

- `app.env`: 런타임 DB·인증·메일·삭제 전달 설정. 운영자·감사 자격 증명 제외.
- `retention.env`: DB·삭제 전달 설정만. 런타임과 같은 DB를 사용한다.
- `alert.curl`: JSON POST 경보 수신부의 `url = "…"`, 필요시 `header = "Authorization: Bearer …"`. 요청 본문은 서비스 이름·고정 오류 코드만 포함한다. 실제 수신부 계약에 맞춰 연결하고 알림 도착을 확인한다.

Caddy 서비스 환경에 확정 도메인 `APP_HOST`를 넣고 [Caddyfile](../deploy/Caddyfile)을 `/etc/caddy/Caddyfile`로 설치한다. 앱 환경의 `APP_ORIGIN`은 같은 도메인의 HTTPS 주소로 설정한다. Caddy 요청 접근 로그는 켜지 않는다.

마이그레이션 계정으로 DB 이전 후 [systemd 파일](../deploy/systemd)을 `/etc/systemd/system`에 설치하고 Linux 서버에서 실행한다.

```sh
sudo systemd-analyze verify /etc/systemd/system/moit*.service /etc/systemd/system/moit-retention.timer
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now moit.service moit-retention.timer
sudo systemctl reload caddy
sudo systemctl start moit-retention.service
sudo systemctl start moit-alert@deployment-check.service
sudo systemctl list-timers moit-retention.timer
```

앱 반복 실패로 재시작 제한에 도달하거나 삭제 작업이 실패·시간 초과되면 경보를 보낸다. 경보 수신부 장애와 서버 중단은 외부 감시에서 확인해야 한다. 서비스·삭제 작업 로그는 `journalctl -u moit -u moit-retention`으로 확인하며 서버 journald에도 오류 로그 보관 기한을 적용한다. `/api/v1/configuration`의 HTTPS 성공 응답과 가입 차단 상태를 확인하고, 실패 시 `/opt/moit/current`를 직전 릴리스로 바꿔 앱을 재시작한다. 캐시 쓰기 경로와 Linux 단위 파일 검증·재부팅 후 스케줄 복원은 대상 서버에서 확인해야 한다.

## 계정 유형 관리

마이그레이션 후 [로그인·계정 유형 정책](../spec.md#로그인계정-유형)을 적용한다. 담당자가 학교 이메일로 최초 인증해 계정을 만든 뒤, 지정 운영자가 담당자 여부와 대상 내부 계정 ID를 확인하고 별도 운영자·감사 환경에서 실행한다. 웹 서비스에는 운영자 자격 증명을 넣지 않는다.

```sh
npm run accounts:role -- <userId> <student|institution> '<reason>'
```

감사 전달 실패 시 변경하지 않는다. 성공하면 대상의 모든 세션이 폐기되므로 다시 이메일 인증해야 한다. 학교 도메인·가입 검증·메일 설정이 준비되기 전 실제 인증은 기존 출시 조건에 따라 차단된다.

## 삭제·감사·복구

보관 기간·삭제 대상은 [개인정보 정책](../spec.md#개인정보-정책)이 원본이다. 아래 명령은 저장소 루트에서 실행한다.

- 삭제 실행: `npm run retention`. 미전달 목록을 500건씩 모두 전달하고, 실패한 묶음은 다음 실행에서 재시도한다. [서버 설치](#서버-설치)의 타이머를 연결한 뒤 헬스·CPU/메모리/디스크·DB 용량·메일 실패도 감시한다.
- 삭제 수신부: 내부 ID·삭제 시각을 별도 비공개 저장소에 멱등 저장한다. 감사 수신부: 운영자·시각·대상 내부 ID·작업·사유만 저장하며 일반 앱의 수정/삭제를 금지한다. 서울 S3 암호화·수명 설정으로 버전·사본도 기한 내 파기한다.
- 지정 운영자는 별도 감사 저장소 환경에서 `npm run reports:review -- <reportId> <upheld|dismissed> '<reason>'`를 실행한다. 감사 저장 실패 시 검토 변경을 중단한다.
- 복구 전 별도 삭제 목록과 미전달 outbox를 합친 JSON 배열(`entityId`, `deletedAt`)에 `npm run db:restore-deletions -- <file>`을 적용한다. 만료 삭제·운영 검증을 재수행하고 미전달 기록이 없을 때만 서비스를 연다.
- 자동 DB 백업으로 복구한다. 목표 RPO 24시간·RTO 4시간은 출시 전 실제 복구로 검증한다.

원본: [만료·전달](../backend/lib/models/retention.ts) · [신고 검토](../backend/scripts/review-report.ts) · [삭제 재적용](../backend/scripts/restore-deletions.ts).
