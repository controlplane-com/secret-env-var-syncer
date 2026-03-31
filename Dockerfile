FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json eslint.config.js vitest.config.ts ./
COPY src ./src
RUN npm run build

FROM deps AS production-deps
RUN npm prune --omit=dev

FROM base AS production
ENV NODE_ENV=production
USER node
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=deps --chown=node:node /app/package.json ./package.json
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
