# ---------- Stage 1: dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# postinstall runs prisma generate (schema copied first)
COPY prisma ./prisma
RUN npm ci

# ---------- Stage 2: build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# AUTH_SECRET stub only for build-time evaluation safety; real value injected at runtime
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 lms

# Full node_modules: the custom server hosts Next.js AND Socket.io in one process,
# and prisma CLI stays available for `prisma migrate deploy` at container start.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json

USER lms
EXPOSE 3000

# Railway health check hits /api/health (verifies DB connectivity)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Graceful shutdown: node handles SIGTERM in server.js (Socket.io disconnect + prisma $disconnect)
STOPSIGNAL SIGTERM
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
