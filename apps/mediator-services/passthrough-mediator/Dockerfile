# Multi-stage Dockerfile for Pass-through Mediator
# Stage 1: Build dependencies and compile TypeScript
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy mediator package.json
COPY apps/mediator-services/passthrough-mediator/package.json ./apps/mediator-services/passthrough-mediator/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy mediator source files and configuration
COPY apps/mediator-services/passthrough-mediator ./apps/mediator-services/passthrough-mediator

# Build passthrough-mediator
RUN pnpm --filter @smile/passthrough-mediator build

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package.json
COPY apps/mediator-services/passthrough-mediator/package.json ./apps/mediator-services/passthrough-mediator/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder /app/apps/mediator-services/passthrough-mediator/dist ./apps/mediator-services/passthrough-mediator/dist

# Copy mediatorConfig.json (required at runtime)
COPY --from=builder /app/apps/mediator-services/passthrough-mediator/mediatorConfig.json ./apps/mediator-services/passthrough-mediator/mediatorConfig.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set working directory to service
WORKDIR /app/apps/mediator-services/passthrough-mediator

# Expose service port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "dist/index.js"]
