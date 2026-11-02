#!/usr/bin/env bash
# Create a Sentry release and upload source maps for api and worker (01-foundation.md 1.8).
# Usage: scripts/ci/sentry-release.sh <release>   (CI passes the commit SHA)
# Needs: SENTRY_AUTH_TOKEN, SENTRY_ORG; optional SENTRY_PROJECT_API / SENTRY_PROJECT_WORKER,
# SENTRY_URL (EU org tokens already carry their region). Run after `turbo run build`.
#
# `sourcemaps inject` writes debug ids into dist/*.js, so the deployed build must be this
# exact dist (or rebuilt with the same inject step) and run with APP_VERSION=<release>.
set -euo pipefail

release="${1:?usage: sentry-release.sh <release>}"
: "${SENTRY_AUTH_TOKEN:?SENTRY_AUTH_TOKEN is required}"
: "${SENTRY_ORG:?SENTRY_ORG is required}"
api_project="${SENTRY_PROJECT_API:-api}"
worker_project="${SENTRY_PROJECT_WORKER:-worker}"

cli() { pnpm dlx @sentry/cli@3.8.2 "$@"; }

cli releases new "$release" --project "$api_project" --project "$worker_project"
# Commit association needs the GitHub integration in Sentry; never fail the release over it.
cli releases set-commits "$release" --auto --ignore-missing ||
  echo "::warning::set-commits failed (is the GitHub integration installed in Sentry?)"

for pair in "apps/api:$api_project" "apps/worker:$worker_project"; do
  dir="${pair%%:*}/dist"
  project="${pair##*:}"
  if [[ ! -d "$dir" ]]; then
    echo "::error::$dir missing; run the build first" >&2
    exit 1
  fi
  cli sourcemaps inject "$dir"
  cli sourcemaps upload --project "$project" --release "$release" "$dir"
done

cli releases finalize "$release"
