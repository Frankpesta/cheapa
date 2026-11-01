# Cheapa API image: runs `api` (main.js) or `api-jobs` (main.jobs.js).
# Build from the repo root:  docker build -f apps/api/Dockerfile -t cheapa-api .
# Debian slim (glibc), not Alpine: onnxruntime-node (CLIP at query time, phase 05) needs glibc.

ARG NODE_IMAGE=node:26.12.1-bookworm-slim
ARG PNPM_VERSION=12.16.1

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /repo

# 1. Prune the monorepo to the API and its workspace dependencies.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @cheapa/api --docker

# 2. Install from the pruned lockfile (cached unless dependencies change), then build.
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@cheapa/api...
RUN pnpm --filter=@cheapa/api deploy --prod --legacy /prod/api

# 3. Runtime: production dependencies and compiled output only.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/api ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# --import loads Sentry before any other module so http/fastify/pg are instrumented.
CMD ["node", "--import", "./dist/instrument.js", "dist/main.js"]
