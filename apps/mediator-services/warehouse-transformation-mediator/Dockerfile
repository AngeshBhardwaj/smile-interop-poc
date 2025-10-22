# Multi-stage Dockerfile for Warehouse Transformation Mediator
# Stage 1: Build dependencies and compile TypeScript
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy mediator-common package
COPY packages/mediator-common ./packages/mediator-common

# Copy mediator package.json
COPY apps/mediator-services/warehouse-transformation-mediator/package.json ./apps/mediator-services/warehouse-transformation-mediator/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy mediator source files and configuration
COPY apps/mediator-services/warehouse-transformation-mediator ./apps/mediator-services/warehouse-transformation-mediator

# Build mediator-common package first
RUN pnpm --filter @smile/mediator-common build

# Build warehouse-transformation-mediator
RUN pnpm --filter @smile/warehouse-transformation-mediator build

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy mediator-common package files
COPY packages/mediator-common/package.json ./packages/mediator-common/package.json

# Copy mediator package.json
COPY apps/mediator-services/warehouse-transformation-mediator/package.json ./apps/mediator-services/warehouse-transformation-mediator/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/mediator-common/dist ./packages/mediator-common/dist
COPY --from=builder /app/apps/mediator-services/warehouse-transformation-mediator/dist ./apps/mediator-services/warehouse-transformation-mediator/dist

# Copy mediatorConfig.json (required at runtime)
COPY --from=builder /app/apps/mediator-services/warehouse-transformation-mediator/mediatorConfig.json ./apps/mediator-services/warehouse-transformation-mediator/mediatorConfig.json

# Copy transformation rules (required at runtime)
COPY --from=builder /app/apps/mediator-services/warehouse-transformation-mediator/src/transformation-rules ./apps/mediator-services/warehouse-transformation-mediator/src/transformation-rules

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set working directory to service
WORKDIR /app/apps/mediator-services/warehouse-transformation-mediator

# Expose service port
EXPOSE 3301

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3301/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "dist/index.js"]
