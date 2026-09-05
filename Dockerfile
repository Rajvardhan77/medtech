# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy monorepo manifests and source code
COPY package*.json tsconfig.base.json ./
COPY apps/api/package*.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma/
COPY packages/shared-types/package*.json packages/shared-types/tsconfig.json ./packages/shared-types/

# Copy all source files
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types

# Install all workspace dependencies
RUN npm ci

# Generate Prisma Client for PostgreSQL
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Build all workspaces in dependency order
RUN npm run build --workspaces

# Stage 2: Runtime
FROM node:20-slim AS runner

WORKDIR /app

# Install OpenSSL for Prisma runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080

# Copy root dependencies and workspace symlinks
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy apps/api artifacts
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Copy packages/shared-types artifacts
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
