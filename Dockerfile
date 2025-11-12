FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy envs so Next.js + Better Auth don’t complain
ENV BETTER_AUTH_SECRET="build_secret"
ENV GOOGLE_CLIENT_ID="placeholder"
ENV GOOGLE_CLIENT_SECRET="placeholder"
ENV DATABASE_URL="file:./prisma/dev.db"

# Ensure the directory and file actually exist
RUN mkdir -p prisma && touch prisma/dev.db

# Skip interactive prompts safely
RUN npx @better-auth/cli migrate --yes || echo "Skipping migration"

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["npm", "start"]
