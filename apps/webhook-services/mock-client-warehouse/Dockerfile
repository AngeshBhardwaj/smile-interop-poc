# Multi-stage build for mock warehouse client
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/webhook-services/mock-client-warehouse/package.json ./apps/webhook-services/mock-client-warehouse/

# Install pnpm
RUN npm install -g pnpm@8.6.12

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/webhook-services/mock-client-warehouse ./apps/webhook-services/mock-client-warehouse

# Build
RUN cd apps/webhook-services/mock-client-warehouse && pnpm build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY --from=builder /app/apps/webhook-services/mock-client-warehouse/package.json ./
COPY --from=builder /app/apps/webhook-services/mock-client-warehouse/dist ./dist

# Install production dependencies only
RUN npm install --only=production

# Expose port
EXPOSE 3203

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3203/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Run
CMD ["node", "dist/index.js"]
