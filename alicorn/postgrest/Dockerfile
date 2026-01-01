# PostgREST with wget for proper HTTP healthchecks
# The official postgrest image is scratch-based with no utilities
FROM alpine:3.20

# Install wget for healthchecks and ca-certificates for HTTPS
RUN apk add --no-cache wget ca-certificates libpq

# Download and install PostgREST binary
ARG POSTGREST_VERSION=12.2.3
RUN wget -q https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-linux-static-x64.tar.xz \
    && tar xJf postgrest-v${POSTGREST_VERSION}-linux-static-x64.tar.xz \
    && mv postgrest /usr/local/bin/ \
    && rm postgrest-v${POSTGREST_VERSION}-linux-static-x64.tar.xz \
    && chmod +x /usr/local/bin/postgrest

# Verify installation
RUN postgrest --version && wget --version | head -1

EXPOSE 3000

CMD ["postgrest"]
