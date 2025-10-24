# Multi-stage build for mock pharmacy client
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/webhook-services/mock-client-pharmacy/package.json ./apps/webhook-services/mock-client-pharmacy/

# Install pnpm
RUN npm install -g pnpm@8.6.12

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/webhook-services/mock-client-pharmacy ./apps/webhook-services/mock-client-pharmacy

# Build
RUN cd apps/webhook-services/mock-client-pharmacy && pnpm build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY --from=builder /app/apps/webhook-services/mock-client-pharmacy/package.json ./
COPY --from=builder /app/apps/webhook-services/mock-client-pharmacy/dist ./dist

# Install production dependencies only
RUN npm install --only=production

# Expose port
EXPOSE 4201

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4201/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Run
CMD ["node", "dist/index.js"]
