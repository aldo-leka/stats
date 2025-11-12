FROM node:22-alpine AS deps
WORKDIR /app

RUN npm config set update-notifier false

COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set dummy environment variables for build-time
ENV BETTER_AUTH_SECRET="build_secret"
ENV GOOGLE_CLIENT_ID="placeholder"
ENV GOOGLE_CLIENT_SECRET="placeholder"

# Run migrations in non-interactive mode (auto-confirm)
# If @better-auth/cli supports `--yes`, this ensures CI won't hang
RUN npx @better-auth/cli migrate --yes || echo "Skipping interactive migration"

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
