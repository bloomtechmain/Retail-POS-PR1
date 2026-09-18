FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# backup.service.ts shells out to pg_dump/pg_restore for on-demand and
# scheduled tenant backups — node:22-alpine has neither by default. Pinned
# to the 16.x package (matching RDS's Postgres 16 server) rather than the
# plain "postgresql-client" alias, which resolves to the newest available
# (18.x) — a newer pg_dump can still export from a Postgres 16 server, but
# its custom-format dumps preamble sets session GUCs only PG17+ recognizes
# (e.g. transaction_timeout), so pg_restore against 16 fails immediately
# with "unrecognized configuration parameter" on the very first statement.
RUN apk add --no-cache postgresql16-client
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/app.js"]
