# Local SearXNG

A loopback-only Docker Compose setup for the `web-search` Pi extension. It is
for personal/local use, not a public search service.

## Setup

Prerequisites: Docker Engine with Compose v2, `curl`, and either `openssl` or
`python3`.

```bash
cd <skills-repo>/searxng
./scripts/init.sh
# Review .env and core-config/settings.yml; both are untracked.
docker compose up -d
./scripts/verify.sh
```

The default endpoint is `http://127.0.0.1:8888`. Configure Pi in its launch
environment:

```bash
export SEARXNG_BASE_URL="http://127.0.0.1:8888"
```

`settings.yml` enables only HTML and JSON output. JSON is necessary for the Pi
extension and remains local because Compose binds the service to loopback.

## Operations

```bash
# Status and compact logs
docker compose ps
docker compose logs --tail=80 core

# Stop local containers
docker compose down

# Pull the configured image and recreate containers
docker compose pull
docker compose up -d
```

Review an upstream release and pin `SEARXNG_VERSION` in `.env` before updating.
Do not expose port 8888 publicly without TLS, authentication, rate limits, and
an access policy.
