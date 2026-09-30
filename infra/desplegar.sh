#!/bin/sh
# Ejecutar con sh infra/desplegar.sh desde Linux/VPS. No elimina volúmenes.
set -eu
cd "$(dirname "$0")/.."
umask 077
test -f .env || { echo 'Falta .env: copia .env.example y configura secretos propios.' >&2; exit 1; }
if [ "${1:-}" = '--actualizar' ]; then
  test -z "$(git status --porcelain)" || { echo 'Hay cambios locales: revisarlos antes de actualizar.' >&2; exit 1; }
  git pull --ff-only
elif [ -n "${1:-}" ]; then
  echo 'Uso: sh infra/desplegar.sh [--actualizar]' >&2; exit 1
fi
docker compose config --quiet
docker compose --profile voz build api frontend voz
# Respaldar antes de aplicar cualquier migración. Fallar si falla el respaldo.
if [ -n "$(docker compose ps --status running -q postgres)" ]; then
  mkdir -p .local/backups
  backup=".local/backups/antes-despliegue-$(date -u +%Y%m%dT%H%M%SZ).dump"
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
  test -s "$backup"
  echo "Respaldo creado: $backup"
fi
docker compose --profile voz up -d --wait --wait-timeout 180
docker compose ps
echo 'Abre http://localhost:8080 (o el FRONTEND_PORT configurado).'
