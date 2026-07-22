FROM node:20-alpine AS builder

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Skip husky (없음) 관련 postinstall 시도 방지
ENV HUSKY=0

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml ./
COPY tsconfig.json ./

COPY apps/bot/package.json ./apps/bot/
COPY libs/shared/package.json ./libs/shared/
COPY libs/bot-api-client/package.json ./libs/bot-api-client/

# Public 미러에는 lockfile을 포함하지 않으므로 --frozen-lockfile 없이 설치한다
RUN pnpm install

COPY libs/shared ./libs/shared
RUN pnpm --filter @onyu/shared build

COPY libs/bot-api-client ./libs/bot-api-client
RUN pnpm --filter @onyu/bot-api-client build

COPY libs/i18n ./libs/i18n

COPY apps/bot ./apps/bot
WORKDIR /workspace/apps/bot
RUN pnpm run build

# ─── Production stage ───
FROM node:20-alpine

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
ENV HUSKY=0

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/
COPY libs/shared/package.json ./libs/shared/
COPY libs/bot-api-client/package.json ./libs/bot-api-client/

RUN pnpm install --prod

COPY --from=builder /workspace/libs/shared/dist ./libs/shared/dist
COPY --from=builder /workspace/libs/shared/package.json ./libs/shared/

COPY --from=builder /workspace/libs/bot-api-client/dist ./libs/bot-api-client/dist
COPY --from=builder /workspace/libs/bot-api-client/package.json ./libs/bot-api-client/

COPY --from=builder /workspace/libs/i18n ./libs/i18n

COPY --from=builder /workspace/apps/bot/dist ./apps/bot/dist
COPY --from=builder /workspace/apps/bot/package.json ./apps/bot/

WORKDIR /workspace/apps/bot

CMD ["node", "dist/apps/bot/src/main.js"]
