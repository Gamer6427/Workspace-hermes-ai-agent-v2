# Deployment Verification Guide

This guide covers the supported Hermes Workspace deployment modes and the checks used to verify them.

## Local development

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

Required local services for enhanced features:

```bash
hermes gateway run
hermes dashboard --port 9119 --host 127.0.0.1 --no-open
```

Configure `.env` with:

```bash
HERMES_API_URL=http://127.0.0.1:8642
HERMES_DASHBOARD_URL=http://127.0.0.1:9119
HERMES_API_TOKEN=<same value as API_SERVER_KEY when gateway auth is enabled>
MODEL_API_TOKEN=<required for claude-gpt models such as claude-opus-4.7 and claude-opus-4.8>
```

Verify:

```bash
curl -fsS http://127.0.0.1:8642/health
curl -fsS http://127.0.0.1:9119/api/status
curl -fsS http://127.0.0.1:3000/api/models
curl -fsS http://127.0.0.1:3000/api/sessions
```

## Docker image

Build and run the workspace image against a reachable Hermes Agent gateway:

```bash
docker build -t hermes-workspace .
docker run --rm -p 3000:3000 \
  -e HERMES_API_URL=http://host.docker.internal:8642 \
  -e HERMES_DASHBOARD_URL=http://host.docker.internal:9119 \
  -e HERMES_API_TOKEN="$API_SERVER_KEY" \
  -e MODEL_API_TOKEN="$MODEL_API_TOKEN" \
  -e HERMES_PASSWORD="$HERMES_PASSWORD" \
  hermes-workspace
```

Verify:

```bash
curl -fsS http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:3000/api/models
```

## Docker Compose

```bash
cp .env.example .env
# Fill at least one model provider key and optionally API_SERVER_KEY/HERMES_PASSWORD.
docker compose config
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:8642/health
```

The Compose stack starts `hermes-agent` for gateway/dashboard APIs and `hermes-workspace` for the web UI.

## Render

This repository includes `render.yaml` for Docker-based Render deployment of the workspace web service.

1. Create or connect a Render Blueprint from this repository.
2. Set these environment variables in Render:
   - `HERMES_API_URL` — externally reachable Hermes Agent gateway URL.
   - `HERMES_DASHBOARD_URL` — externally reachable Hermes dashboard URL.
   - `HERMES_API_TOKEN` — token matching `API_SERVER_KEY` when gateway auth is enabled.
   - `MODEL_API_TOKEN` — required for Claude-GPT proxy models.
3. Let Render generate `HERMES_PASSWORD`, or set your own strong value.
4. Deploy and verify the service health check path `/`.

Render does not run the Hermes Agent gateway/dashboard from this workspace blueprint; point it at an existing reachable Hermes Agent deployment.

## Chat smoke test matrix

For each target model:

- `claude-opus-4.7`
- `claude-opus-4.8`

Send:

- `Hello`
- `What is 2+2?`
- `Write Python code.`
- `Write React code.`
- `Explain quantum mechanics.`

Verify:

- Response text appears.
- Streaming chunks render without duplication or flicker.
- Model switcher changes the model in the outbound request.
- Session history persists after refresh.
- Memory features remain available when gateway/dashboard capabilities report memory support.
- Browser console has no uncaught errors.
