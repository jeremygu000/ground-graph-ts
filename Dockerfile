FROM node:22-slim

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/ src/
COPY apps/ apps/
COPY tests/ tests/
COPY ontology/ ontology/
COPY evals/ evals/
COPY docs/ docs/
COPY drizzle/ drizzle/
COPY deploy/ deploy/
COPY tsconfig.json drizzle.config.ts vitest.config.ts ./
COPY .env.example ./

RUN pnpm install --frozen-lockfile

EXPOSE 8080

CMD ["pnpm", "start:api"]
