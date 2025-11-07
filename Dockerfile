# syntax=docker/dockerfile:1
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENTRYPOINT ["node", "/app/dist/cli.js", "crawl"]
CMD ["--help"]
