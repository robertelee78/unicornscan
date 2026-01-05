# GeoIP API Service
# Lightweight Node.js container for MMDB lookups

FROM node:22-alpine

# Add wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy application
COPY server.js ./

# Default port
ENV GEOIP_PORT=3001
ENV GEOIP_DIR=/usr/share/GeoIP

EXPOSE 3001

CMD ["node", "server.js"]
