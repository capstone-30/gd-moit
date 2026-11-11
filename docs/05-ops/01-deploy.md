# 배포 가이드 — 모잇

[운영 명세](README.md) · [운영 안내](02-operations.md) · [문서 안내](../../README.md#관련-문서)

로컬 실행은 [README](../../README.md#시작하기), 운영 재개 조건은 [남은 작업](../03-tech/01-architecture.md#남은-작업과-리스크), 전체 연결은 [기술 스택](../../README.md#기술-스택)을 따른다.

## 배포 구성

- 서울 `ap-northeast-2` Lightsail Linux IPv4 2GB(단일 인스턴스, Node.js 22 LTS·systemd) · 암호화 관리형 PostgreSQL 2GB Standard(public mode 해제, `DATABASE_CA` 검증) · SES SMTP를 사용한다.
- 고정 IP·DNS·Caddy TLS(외부 80/443만 개방, `X-Real-IP` 덮어쓰기, 요청 접근 로그 비활성, SSH는 운영자 IP 제한)를 적용하고, DB 마이그레이션은 별도 계정으로 하위 호환 변경부터 적용한다.

### 보안·환경 분리

- 최소 권한 DB 계정·매개변수화 SQL·OTP HMAC·32바이트 세션 토큰 해시·`HttpOnly/Secure/SameSite=Lax/Path=/` 쿠키·개인정보 `no-store`를 적용한다.
- 개발·staging(합성 데이터만 사용 후 삭제)·production 환경을 분리하고, 개인 IAM MFA·SES 발송 전용 자격 증명·DKIM/SPF/DMARC 및 [출시 조건](../01-func/01-common.md#출시-조건)을 확인한다.

## 서버 설치

- [배포 템플릿](../../deploy) 기준으로 `/usr/bin/node`, 로그인 불가 계정 `moit`, `/opt/moit/releases`(읽기 전용)·`/opt/moit/current`, 쓰기 허용 `frontend/.next/cache`를 준비한다(`.env.local` 배포 금지).
- `/etc/moit`(`root:moit`, `0750`) 아래 비밀 파일(`0640`, [환경 변수 예시](../../frontend/.env.example))을 분리 배치한다:
  - `app.env`: 런타임 DB·인증·메일·삭제 전달(운영자·감사 자격 증명 제외).
  - `retention.env`: 런타임 DB·삭제 전달 설정.
  - `alert.curl`: 경보 수신부 `url`·`header`(서비스명·오류 코드만 전송).
- Caddy에 `APP_HOST`와 [Caddyfile](../../deploy/Caddyfile)(`/etc/caddy/Caddyfile`)을 설정한다(`APP_ORIGIN=https://<APP_HOST>`).
- [회고 저장소 이전](../../backend/db/migrations/011_reflections_to_comments.sql)은 앱 정지 상태에서 적용하며 이전 버전으로 롤백할 수 없다.
- DB 마이그레이션 후 [systemd 파일](../../deploy/systemd)을 `/etc/systemd/system`에 설치·실행한다.

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

### 배포 확인·장애 대응

- 재시작 한도 도달·삭제 작업 실패 시 경보를 전송하며, 로그는 `journalctl -u moit -u moit-retention`(보관 기한 적용)으로 확인한다.
- `/api/v1/configuration` HTTPS 응답과 가입 차단 상태를 확인하고, 실패 시 `/opt/moit/current`를 직전 호환 릴리스로 되돌려 재시작한다([서버 설치](#서버-설치) 롤백 제한 준수).
