FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app
# pnpm-workspace.yaml: cấu hình pnpm (vd minimumReleaseAgeExclude) phải giống khi cài trên máy
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM base
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
CMD ["node", "dist/worker.js"]
