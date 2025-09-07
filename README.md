# ComEd Hourly Pricing

A tiny, static web app that visualizes ComEd hourly pricing data with ECharts. It’s served
by Caddy and uses Caddy as a simple CORS proxy to the ComEd API.

## Overview

- Frontend only (no backend app server)
- Caddy serves static assets from `public/`
- Caddy proxies API requests to ComEd and adds CORS headers:
  - `/5minutefeed` → `https://hourlypricing.comed.com/api?type=5minutefeed`
  - `/currenthouraverage` → `https://hourlypricing.comed.com/api?type=currenthouraverage`
- Security headers and sensible caching are configured in `Caddyfile`.

## Prerequisites

- Docker (Desktop or Engine)

## Quick start

Run locally with Docker:

```bash
# Build the image
docker build -t comed-hourly-pricing .

# Run the container on port 8123
docker run -d -p 8123:8123 --name comed-hourly-pricing comed-hourly-pricing
```

Open http://localhost:8123/

### Convenience scripts

- Windows:
  - `build.cmd`
  - `run.cmd`
- Linux/macOS:
  - `./build.sh`
  - `./run.sh`

## Deployment

Pack and ship the image to a remote server using the provided scripts.

1) Copy `.env-sample` to `.env` and set:

```
remoteServer=user@servername
remoteDir=/home/user/foldername
```

2) Use one of:

- Windows: `deploy.cmd`
- Linux/macOS: `./deploy.sh`

The deploy scripts:
- Save the local Docker image to a tarball
- Copy it to the remote via `scp`
- Stop/remove any running container
- Load and run the new image (`-p 8123:8123`, `--restart unless-stopped`)

## Caddy

`Caddyfile` configures:
- Global compression (`zstd`/`gzip`)
- Baseline security headers (CSP, Referrer-Policy, etc.)
- Short cache for `index.html` (5 minutes)
- Long-lived immutable cache for static assets (`*.js`, `*.css`, `*.png`, `*.ico`,
  `*.webmanifest`)
- CORS and proxy rules for the API paths

## Frontend

- `public/index.html` — page shell and web components template
- `public/styles.css` — main stylesheet
- `public/app.js` — app logic
- `public/echarts.min.js` — bundled ECharts

Notes:
- The `price-card` web component uses an inline `<style>` inside its template. If you
  later tighten the CSP to remove `'unsafe-inline'` for styles, consider adopting
  `adoptedStyleSheets` or external styles for the component.

## Useful endpoints

- App: `http://localhost:8123/`
- API (proxied by Caddy):
  - `http://localhost:8123/5minutefeed`
  - `http://localhost:8123/currenthouraverage`

For examples, see `comed.http`.

## Project structure (short)

```
.
├─ Caddyfile              # Static hosting + proxy + headers + caching
├─ Dockerfile             # Caddy base image
├─ public/                # Static assets
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  └─ echarts.min.js
├─ build.* / run.*        # Local build/run scripts
├─ deploy.*               # Deployment scripts (uses .env)
└─ .env-sample            # Template for deployment config
```

## License

CC-BY-SA 4.0 International Public License

The license ensure that any modifications or derivative works of the code remain open and
are shared under the same terms.