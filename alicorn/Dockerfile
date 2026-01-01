# Alicorn Web UI - Multi-stage Docker Build
# Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
#
# Build: docker build -t alicorn .
# Run:   docker run -p 8080:80 alicorn

# =============================================================================
# Stage 1: Build the application
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
# Note: Environment variables must be set at build time for Vite
ARG VITE_DB_BACKEND=demo
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_POSTGREST_URL=
ARG VITE_APP_TITLE=Alicorn
ARG VITE_DEBUG=false

RUN npm run build

# =============================================================================
# Stage 2: Serve with nginx
# =============================================================================
FROM nginx:alpine AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
