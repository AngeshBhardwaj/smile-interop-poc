# Base image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Install pnpm
RUN npm install -g pnpm

# Copy project files
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the project
RUN pnpm build

# Expose port
EXPOSE 3002

# Start the service
CMD ["pnpm", "--filter=@smile/interop-layer", "start"]
