# Multi-stage build for adapter mediator
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/mediator-services/adapter-mediator/package.json ./apps/mediator-services/adapter-mediator/

# Copy mediator-common package
COPY packages/mediator-common ./packages/mediator-common

# Install pnpm
RUN npm install -g pnpm@8.6.12

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/mediator-services/adapter-mediator ./apps/mediator-services/adapter-mediator

# Build
RUN cd apps/mediator-services/adapter-mediator && pnpm build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY --from=builder /app/apps/mediator-services/adapter-mediator/package.json ./
COPY --from=builder /app/apps/mediator-services/adapter-mediator/dist ./dist

# Install production dependencies only
RUN npm install --only=production

# Expose port
EXPOSE 3204

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3204/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Run
CMD ["node", "dist/index.js"]
