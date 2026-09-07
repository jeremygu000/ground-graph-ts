FROM node:22-slim AS base

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS deps
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS production
RUN pnpm install --frozen-lockfile --prod=true

COPY --from=deps /app/node_modules /app/node_modules

COPY tsconfig.json drizzle.config.ts vitest.config.ts ./
COPY .env.example ./
COPY src/ src/
COPY apps/ apps/
COPY tests/ tests/
COPY ontology/ ontology/
COPY evals/ evals/
COPY docs/ docs/
COPY drizzle/ drizzle/
COPY deploy/ deploy/

FROM base AS api
COPY --from=production /app/node_modules /app/node_modules
COPY --from=production /app/tsconfig.json /app/drizzle.config.ts /app/vitest.config.ts /app/.env.example /app/
COPY --from=production /app/src /app/src
COPY --from=production /app/apps /app/apps
COPY --from=production /app/tests /app/tests
COPY --from=production /app/ontology /app/ontology
COPY --from=production /app/evals /app/evals
COPY --from=production /app/docs /app/docs
COPY --from=production /app/drizzle /app/drizzle
COPY --from=production /app/deploy /app/deploy
EXPOSE 8080
CMD ["pnpm", "start:api"]

FROM base AS ingestion-worker
COPY --from=production /app/node_modules /app/node_modules
COPY --from=production /app/tsconfig.json /app/drizzle.config.ts /app/vitest.config.ts /app/.env.example /app/
COPY --from=production /app/src /app/src
COPY --from=production /app/apps /app/apps
COPY --from=production /app/tests /app/tests
COPY --from=production /app/ontology /app/ontology
COPY --from=production /app/evals /app/evals
COPY --from=production /app/docs /app/docs
COPY --from=production /app/drizzle /app/drizzle
COPY --from=production /app/deploy /app/deploy
EXPOSE 8081
CMD ["pnpm", "start:worker"]

FROM base AS evaluation-runner
COPY --from=production /app/node_modules /app/node_modules
COPY --from=production /app/tsconfig.json /app/drizzle.config.ts /app/vitest.config.ts /app/.env.example /app/
COPY --from=production /app/src /app/src
COPY --from=production /app/apps /app/apps
COPY --from=production /app/tests /app/tests
COPY --from=production /app/ontology /app/ontology
COPY --from=production /app/evals /app/evals
COPY --from=production /app/docs /app/docs
COPY --from=production /app/drizzle /app/drizzle
COPY --from=production /app/deploy /app/deploy
CMD ["pnpm", "start:eval"]
