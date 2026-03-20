# PostgREST with wget for HTTP healthchecks
#
# The official postgrest/postgrest image supports amd64 + arm64 but is
# scratch-based (no shell, no utilities). We use a multi-stage build
# to copy a statically-linked wget from alpine into the final image.
FROM alpine:3.20 AS tools
RUN apk add --no-cache wget ca-certificates

FROM postgrest/postgrest:v12.2.3
COPY --from=tools /usr/bin/wget /usr/local/bin/wget
COPY --from=tools /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 3000
CMD ["postgrest"]
