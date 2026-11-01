#!/usr/bin/env bash
# Verifies the local infrastructure matches 01-foundation.md 1.3 and CLAUDE.md rule 2.
# Run with: pnpm infra:check   (after pnpm infra:up)
set -uo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f infra/docker-compose.yml --env-file .env)
failures=0

pass() { printf '  \033[32mok\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; failures=$((failures + 1)); }
check() { # check "<label>" <command...>
  local label=$1; shift
  if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi
}
refused() { # refused "<label>" <command...>  (passes when the command FAILS)
  local label=$1; shift
  if "$@" >/dev/null 2>&1; then fail "$label"; else pass "$label"; fi
}

# shellcheck disable=SC1091
set -a; source .env; set +a

as_role() { # as_role <role> <password> <db> <sql>
  "${COMPOSE[@]}" exec -T -e PGPASSWORD="$2" postgres \
    psql -h 127.0.0.1 -U "$1" -d "$3" -v ON_ERROR_STOP=1 -tAc "$4"
}
redis_cfg() { # redis_cfg <service> <key>
  "${COMPOSE[@]}" exec -T "$1" redis-cli config get "$2" | sed -n 2p | tr -d '\r'
}
equals() { [ "$1" = "$2" ]; }

echo "Containers"
for svc in postgres redis-queue redis-cache; do
  status=$("${COMPOSE[@]}" ps --format '{{.Health}}' "$svc" 2>/dev/null)
  check "$svc healthy" equals "$status" healthy
done

echo "Postgres: two databases, separate roles"
check "cheapa_catalog reachable as cheapa_catalog" as_role cheapa_catalog "$CATALOG_DB_PASSWORD" cheapa_catalog 'select 1'
check "cheapa_users reachable as cheapa_app" as_role cheapa_app "$USERS_DB_PASSWORD" cheapa_users 'select 1'
refused "cheapa_catalog role CANNOT connect to cheapa_users" as_role cheapa_catalog "$CATALOG_DB_PASSWORD" cheapa_users 'select 1'
refused "cheapa_app role CANNOT connect to cheapa_catalog" as_role cheapa_app "$USERS_DB_PASSWORD" cheapa_catalog 'select 1'
check "pgvector >= 0.8 in cheapa_catalog" equals \
  "$(as_role cheapa_catalog "$CATALOG_DB_PASSWORD" cheapa_catalog "select (string_to_array(extversion,'.')::int[] >= '{0,8}') from pg_extension where extname='vector'")" t
check "pg_trgm in cheapa_catalog" equals \
  "$(as_role cheapa_catalog "$CATALOG_DB_PASSWORD" cheapa_catalog "select count(*) from pg_extension where extname='pg_trgm'")" 1
check "cosine distance query works" equals \
  "$(as_role cheapa_catalog "$CATALOG_DB_PASSWORD" cheapa_catalog "select round(('[1,0]'::vector <=> '[0,1]'::vector)::numeric, 3)")" 1.000

echo "Redis: queue never evicts, cache does"
check "redis-queue maxmemory-policy = noeviction" equals "$(redis_cfg redis-queue maxmemory-policy)" noeviction
check "redis-queue appendonly = yes" equals "$(redis_cfg redis-queue appendonly)" yes
check "redis-cache maxmemory-policy = allkeys-lru" equals "$(redis_cfg redis-cache maxmemory-policy)" allkeys-lru
check "redis-cache appendonly = no" equals "$(redis_cfg redis-cache appendonly)" no
check "redis-cache has no RDB snapshots" equals "$(redis_cfg redis-cache save)" ""

echo "Network: ports bound to localhost only"
for svc in postgres redis-queue redis-cache; do
  check "$svc published on 127.0.0.1" bash -c "${COMPOSE[*]} port $svc 6379 2>/dev/null | grep -q '^127.0.0.1:' || ${COMPOSE[*]} port $svc 5432 2>/dev/null | grep -q '^127.0.0.1:'"
done

echo
if [ "$failures" -eq 0 ]; then echo "All infrastructure checks passed."; else echo "$failures check(s) failed."; exit 1; fi
