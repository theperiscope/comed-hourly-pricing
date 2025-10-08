# https://hub.docker.com/_/caddy

# Stage 1: Build static assets with content hashes and rewrite HTML references
FROM alpine:3.20 AS builder
WORKDIR /work

# Copy static files
COPY public/ /work/public/

# Fingerprint CSS/JS assets by content hash and update index.html references
# Produces files like styles.<hash>.css, app.<hash>.js, echarts.min.<hash>.js
RUN set -eux; \
		cd /work/public; \
		for f in styles.css app.js echarts.min.js; do \
			if [ -f "$f" ]; then \
				h="$(sha256sum "$f" | awk '{print $1}' | cut -c1-10)"; \
				base="${f%.*}"; \
				ext="${f##*.}"; \
				new="${base}.${h}.${ext}"; \
				cp "$f" "$new"; \
				# Update double-quoted references in index.html (href/src)
				sed -i "s#\"$f\"#\"$new\"#g" index.html; \
				# Remove the original un-hashed asset to keep image lean
				rm "$f"; \
			fi; \
		done

# Stage 2: Runtime image with Caddy
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /work/public /srv
EXPOSE 8123
# Caddy runs as PID 1 by default due to the base image's ENTRYPOINT
# No CMD is needed