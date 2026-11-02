# Cheapa worker image: BullMQ consumers + scheduler (02-crawler-core.md 2.3). No HTTP.
# Build from the repo root:  docker build -f apps/worker/Dockerfile -t cheapa-worker .
# Debian slim (glibc), not Alpine: onnxruntime-node (CPU embeddings, phase 05) needs glibc.

ARG NODE_IMAGE=node:26.12.1-bookworm-slim
ARG PNPM_VERSION=12.16.1

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /repo

# 1. Prune the monorepo to the worker and its workspace dependencies.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @cheapa/worker --docker

# 2. Install from the pruned lockfile (cached unless dependencies change), then build.
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@cheapa/worker...
RUN pnpm --filter=@cheapa/worker deploy --prod --legacy /prod/worker

# 3. Runtime: production dependencies and compiled output only.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/worker ./
USER node
# --import loads Sentry before any other module.
CMD ["node", "--import", "./dist/instrument.js", "dist/main.js"]
