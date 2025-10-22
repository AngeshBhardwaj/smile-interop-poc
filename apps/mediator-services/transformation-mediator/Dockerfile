# Multi-stage Dockerfile for Transformation Mediator
# Stage 1: Build dependencies and compile TypeScript
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy mediator package.json
COPY apps/mediator-services/transformation-mediator/package.json ./apps/mediator-services/transformation-mediator/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy mediator source files and configuration
COPY apps/mediator-services/transformation-mediator ./apps/mediator-services/transformation-mediator

# Build transformation-mediator
RUN pnpm --filter @smile/transformation-mediator build

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package.json
COPY apps/mediator-services/transformation-mediator/package.json ./apps/mediator-services/transformation-mediator/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder /app/apps/mediator-services/transformation-mediator/dist ./apps/mediator-services/transformation-mediator/dist

# Copy mediatorConfig.json (required at runtime)
COPY --from=builder /app/apps/mediator-services/transformation-mediator/mediatorConfig.json ./apps/mediator-services/transformation-mediator/mediatorConfig.json

# Copy clients configuration (required for multi-client fan-out)
COPY --from=builder /app/apps/mediator-services/transformation-mediator/clients.config.json ./apps/mediator-services/transformation-mediator/clients.config.json

# Copy transformation rules (required at runtime)
COPY --from=builder /app/apps/mediator-services/transformation-mediator/transformation-rules ./apps/mediator-services/transformation-mediator/transformation-rules

# Copy JSON schemas (required at runtime)
COPY --from=builder /app/apps/mediator-services/transformation-mediator/schemas ./apps/mediator-services/transformation-mediator/schemas

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set working directory to service
WORKDIR /app/apps/mediator-services/transformation-mediator

# Expose service port
EXPOSE 3101

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3101/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "dist/index.js"]
