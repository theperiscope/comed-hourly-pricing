# https://hub.docker.com/_/caddy
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY public /srv
EXPOSE 8123
# Caddy runs as PID 1 by default due to the base image's ENTRYPOINT
# No CMD is needed