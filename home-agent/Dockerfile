FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM base
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
CMD ["node", "dist/worker.js"]
