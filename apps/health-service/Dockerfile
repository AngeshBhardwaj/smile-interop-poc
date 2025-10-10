# Multi-stage Dockerfile for Health Service
# Stage 1: Build dependencies and compile TypeScript
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy all package.json files for workspace dependencies
COPY packages/common/package.json ./packages/common/package.json
COPY packages/cloud-events/package.json ./packages/cloud-events/package.json
COPY apps/health-service/package.json ./apps/health-service/package.json

# Install dependencies (including workspace packages)
RUN pnpm install --frozen-lockfile

# Copy workspace source files and TypeScript configs
COPY packages/common ./packages/common
COPY packages/cloud-events ./packages/cloud-events
COPY apps/health-service ./apps/health-service

# Build workspace packages first
RUN pnpm --filter @smile/common build
RUN pnpm --filter @smile/cloud-events build

# Build health-service
RUN pnpm --filter @smile/health-service build

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package.json files
COPY packages/common/package.json ./packages/common/package.json
COPY packages/cloud-events/package.json ./packages/cloud-events/package.json
COPY apps/health-service/package.json ./apps/health-service/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/packages/cloud-events/dist ./packages/cloud-events/dist
COPY --from=builder /app/apps/health-service/dist ./apps/health-service/dist

# Copy source files for Swagger documentation scanning
COPY --from=builder /app/apps/health-service/src ./apps/health-service/src

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set working directory to service
WORKDIR /app/apps/health-service

# Expose service port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "dist/index.js"]
