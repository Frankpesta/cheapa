#!/usr/bin/env bash
# Runs once, on the first start of an empty data volume (docker-entrypoint-initdb.d).
# Two databases with separate roles (CLAUDE.md rule 2):
#   cheapa_catalog  owned by cheapa_catalog  (api, api-jobs, worker)
#   cheapa_users    owned by cheapa_app      (api, api-jobs only)
# Neither role can connect to the other's database.
set -euo pipefail

: "${CATALOG_DB_PASSWORD:?}"
: "${USERS_DB_PASSWORD:?}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v catalog_pw="$CATALOG_DB_PASSWORD" -v users_pw="$USERS_DB_PASSWORD" <<'SQL'
CREATE ROLE cheapa_catalog LOGIN PASSWORD :'catalog_pw';
CREATE ROLE cheapa_app LOGIN PASSWORD :'users_pw';

CREATE DATABASE cheapa_catalog OWNER cheapa_catalog;
CREATE DATABASE cheapa_users OWNER cheapa_app;

-- By default every role may connect to every database. Remove that.
REVOKE CONNECT, TEMPORARY ON DATABASE cheapa_catalog FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE cheapa_users FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE cheapa_catalog TO cheapa_catalog;
GRANT CONNECT, TEMPORARY ON DATABASE cheapa_users TO cheapa_app;
SQL

# Extensions need superuser; create them here so migrations can rely on them.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname cheapa_catalog <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO cheapa_catalog;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname cheapa_users <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO cheapa_app;
SQL

echo "cheapa: created cheapa_catalog and cheapa_users with separate roles"
