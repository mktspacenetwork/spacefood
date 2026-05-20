#!/usr/bin/env bash
# Script de deploy do SpaceFood.
# Executado pelo self-hosted GitHub Actions runner em `push` para main.
# Idempotente: build em diretório versionado, publica via symlink atômico,
# mantém os últimos N releases para rollback rápido.

set -euo pipefail

readonly SITE_ROOT="/var/www/spacefood"
readonly RELEASES_DIR="${SITE_ROOT}/releases"
readonly CURRENT_LINK="${SITE_ROOT}/current"
readonly KEEP_RELEASES=5

log() {
  printf '[deploy] %s\n' "$*"
}

require_dir() {
  if [[ ! -d "$1" ]]; then
    log "ERRO: diretório obrigatório não encontrado: $1"
    exit 1
  fi
}

main() {
  if [[ ! -d "dist" ]]; then
    log "ERRO: ./dist não encontrado — rode 'npm run build' antes do deploy."
    exit 1
  fi

  require_dir "$SITE_ROOT"
  mkdir -p "$RELEASES_DIR"

  local ts release_dir
  ts="$(date +%Y%m%d-%H%M%S)"
  release_dir="${RELEASES_DIR}/${ts}"

  log "publicando release ${ts}"
  mkdir -p "$release_dir"
  cp -a dist/. "$release_dir/"

  log "trocando symlink current -> ${release_dir}"
  ln -sfn "$release_dir" "${CURRENT_LINK}.new"
  mv -Tf "${CURRENT_LINK}.new" "$CURRENT_LINK"

  log "recarregando nginx"
  if command -v sudo >/dev/null 2>&1; then
    sudo -n /bin/systemctl reload nginx
  else
    /bin/systemctl reload nginx
  fi

  log "limpando releases antigos (mantendo os últimos ${KEEP_RELEASES})"
  # Lista por mtime decrescente, pula os primeiros N, remove o resto.
  ( cd "$RELEASES_DIR" && ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf )

  log "smoke test: GET http://localhost/healthz"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://localhost/healthz || true)"
  if [[ "$code" != "200" ]]; then
    log "ERRO: smoke test falhou (HTTP ${code})"
    exit 1
  fi

  log "deploy ok — release atual: $(readlink -f "$CURRENT_LINK")"
}

main "$@"
