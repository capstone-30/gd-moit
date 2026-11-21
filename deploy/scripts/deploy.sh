#!/usr/bin/env bash
# 서버 측 릴리스 전환 스크립트. SSM 문서(moit-deploy-<env>)가 root로 실행한다.
# 설치: sudo install -o root -g root -m 0750 deploy/scripts/deploy.sh /opt/moit/bin/deploy.sh
#
#   deploy.sh <release-sha(40)> <sha256(64)> <migrate:true|false>
#
# 흐름: 체크섬 검증 → releases/<sha> 압축 해제 → (선택) 마이그레이션 → current 원자적 전환
#       → moit.service 재시작 → 로컬 헬스 체크 → 실패 시 직전 릴리스로 롤백(DB는 되돌리지 않음)
set -euo pipefail
umask 027

RELEASE=${1:?release}
SHA256=${2:?sha256}
MIGRATE=${3:-true}

[[ ${RELEASE} =~ ^[0-9a-f]{40}$ ]] || { echo "invalid release: ${RELEASE}" >&2; exit 2; }
[[ ${SHA256} =~ ^[0-9a-f]{64}$ ]] || { echo "invalid sha256" >&2; exit 2; }
[[ ${MIGRATE} =~ ^(true|false)$ ]] || { echo "invalid migrate flag" >&2; exit 2; }

BASE=/opt/moit
RELEASES=${BASE}/releases
INCOMING=/var/lib/moit-deploy/incoming/${RELEASE}
ARCHIVE=${INCOMING}/${RELEASE}.tar.gz
TARGET=${RELEASES}/${RELEASE}
KEEP=${MOIT_KEEP_RELEASES:-5}
HEALTH_URL=${MOIT_HEALTH_URL:-http://127.0.0.1:3000/api/v1/configuration}
NODE=/usr/bin/node

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

exec 9>/run/moit-deploy.lock
flock --nonblock 9 || { echo "another deploy is running" >&2; exit 3; }
trap 'rm -rf "${INCOMING}" "${TARGET}.partial"' EXIT

log "release ${RELEASE}"
echo "${SHA256}  ${ARCHIVE}" | sha256sum --check --strict --quiet

# 1. 압축 해제(읽기 전용 릴리스, 캐시만 쓰기 허용)
rm -rf "${TARGET}.partial"
mkdir -p "${TARGET}.partial"
tar --extract --gzip --file "${ARCHIVE}" --directory "${TARGET}.partial" --no-same-owner
[[ $(cat "${TARGET}.partial/RELEASE") == "${RELEASE}" ]] || { echo "RELEASE file mismatch" >&2; exit 4; }
chown -R root:moit "${TARGET}.partial"
chmod -R u=rwX,g=rX,o= "${TARGET}.partial"
install -d -o moit -g moit -m 0750 "${TARGET}.partial/frontend/.next/cache"

PREVIOUS=$(readlink -f "${BASE}/current" 2>/dev/null || true)
if [[ ${PREVIOUS} == "${TARGET}" ]]; then
  log "same release is current; replacing in place"
fi
rm -rf "${TARGET}"
mv "${TARGET}.partial" "${TARGET}"

# 2. 마이그레이션(별도 계정 자격 증명, 하위 호환 변경만 자동 적용)
if [[ ${MIGRATE} == true ]]; then
  [[ -f /etc/moit/migrate.env ]] || { echo "/etc/moit/migrate.env missing" >&2; exit 5; }
  log "applying migrations"
  systemd-run --quiet --wait --pipe --collect \
    --unit="moit-migrate-${RELEASE:0:12}" \
    -p User=moit -p Group=moit \
    -p EnvironmentFile=/etc/moit/migrate.env \
    -p Environment=NODE_ENV=production \
    -p WorkingDirectory="${TARGET}" \
    -p NoNewPrivileges=true -p PrivateTmp=true -p ProtectSystem=strict -p ProtectHome=true \
    "${NODE}" --conditions=react-server --import tsx backend/scripts/migrate.ts
fi

switch_to() {
  ln -sfn "$1" "${BASE}/current.next"
  mv -Tf "${BASE}/current.next" "${BASE}/current"
  systemctl restart moit.service
}

healthy() {
  for _ in $(seq 1 30); do
    curl --fail --silent --max-time 3 "${HEALTH_URL}" > /dev/null && return 0
    sleep 2
  done
  return 1
}

# 3. 전환·확인·롤백
log "switching current → ${TARGET}"
switch_to "${TARGET}"
if ! healthy; then
  log "health check failed"
  journalctl -u moit.service -n 50 --no-pager || true
  if [[ -n ${PREVIOUS} && -d ${PREVIOUS} && ${PREVIOUS} != "${TARGET}" ]]; then
    log "rolling back to ${PREVIOUS} (DB migrations are NOT reverted)"
    switch_to "${PREVIOUS}"
    healthy && log "rollback healthy" || log "rollback also unhealthy"
  fi
  exit 1
fi
log "healthy"

# 4. 오래된 릴리스 정리(current·직전 릴리스는 보존)
find "${RELEASES}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2- \
  | tail -n "+$((KEEP + 1))" | while read -r dir; do
      [[ ${dir} == "${TARGET}" || ${dir} == "${PREVIOUS}" ]] && continue
      log "pruning ${dir}"; rm -rf "${dir}"
    done

log "done"
