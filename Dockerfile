# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy envs to satisfy Better Auth + Next.js during build
ENV BETTER_AUTH_SECRET="build_secret"
ENV GOOGLE_CLIENT_ID="placeholder"
ENV GOOGLE_CLIENT_SECRET="placeholder"

# Run migration at build time to generate SQLite schema
RUN mkdir -p /app/data && npx @better-auth/cli migrate --yes --config=src/lib/auth.ts

RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/data ./data
COPY --from=builder /app/src ./src  # ✅ required so CLI can see auth.ts at runtime

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migration again on container start (just in case)
CMD npx @better-auth/cli migrate --yes --config=src/lib/auth.ts && npm start
