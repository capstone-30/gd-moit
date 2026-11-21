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

## 지속 배포(CD)

- CI 통과 후 [CD 워크플로](../../.github/workflows/cd.yml)가 빌드 산출물을 묶고, [배포 단계](../../.github/workflows/deploy.yml)가 OIDC 역할로 S3에 올린 뒤 SSM 문서로 서버의 [배포 스크립트](../../deploy/scripts/deploy.sh)를 실행한다(SSH 미사용).
- `main` 푸시는 저장소 변수 `STAGING_ENABLED=true`일 때만 staging에 자동 배포하고, production은 `workflow_dispatch`와 GitHub Environment 승인으로만 배포한다.
- 서버 스크립트는 체크섬 검증 → `releases/<sha>` 해제 → 마이그레이션(`/etc/moit/migrate.env`) → `current` 전환·재시작 → 헬스 체크 순서로 실행하고, 실패 시 직전 릴리스로 되돌린다(DB는 되돌리지 않으므로 하위 호환 마이그레이션만 자동 배포한다).

### CD 최초 설정

1. 환경마다 [CD 스택](../../deploy/aws/cd-stack.yml)을 만든다(두 번째 스택은 `CreateOidcProvider=false`).

   ```sh
   aws cloudformation deploy --stack-name moit-production-cd --template-file deploy/aws/cd-stack.yml \
     --capabilities CAPABILITY_NAMED_IAM --parameter-overrides EnvironmentName=production
   ```

2. 서버에 SSM Agent를 설치하고 스택 출력 `NodeRoleName`으로 하이브리드 활성화(`aws ssm create-activation --registration-limit 1`)를 만들어 등록한 뒤, 노드(`mi-…`)에 태그 `moit-environment=<환경>`을 붙인다(`aws ssm add-tags-to-resource --resource-type ManagedInstance`).
3. 서버에 `deploy.sh`를 `/opt/moit/bin/deploy.sh`(`root:root`, `0750`)로 설치하고, 마이그레이션 계정 자격 증명을 `/etc/moit/migrate.env`(`root:root`, `0600`)에 둔다. 스크립트가 바뀌면 다시 설치한다.
4. GitHub Environment(`staging`·`production`)에 변수 `AWS_REGION`·`AWS_DEPLOY_ROLE_ARN`·`ARTIFACT_BUCKET`·`SSM_DOCUMENT`·`SSM_INSTANCE_ID`·`APP_URL`을 등록하고, `production`에는 필수 승인자를 지정한다.
5. 앱 정지가 필요한 마이그레이션([회고 저장소 이전](../../backend/db/migrations/011_reflections_to_comments.sql) 등)이 포함된 릴리스는 자동 배포하지 않는다. [서버 설치](#서버-설치) 절차대로 앱을 멈추고 수동 적용한 뒤 `migrate=false`로 배포한다.

### 배포 확인·장애 대응

- 재시작 한도 도달·삭제 작업 실패 시 경보를 전송하며, 로그는 `journalctl -u moit -u moit-retention`(보관 기한 적용)으로 확인한다.
- `/api/v1/configuration` HTTPS 응답과 가입 차단 상태를 확인하고, 실패 시 `/opt/moit/current`를 직전 호환 릴리스로 되돌려 재시작한다([서버 설치](#서버-설치) 롤백 제한 준수).
