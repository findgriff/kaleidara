# AGENT OS Creative Studio

A self-contained ChatGPT Apps SDK / MCP application for real image and video generation through provider APIs. It is an original AGENT OS project built on the MIT-licensed OpenAI Apps SDK example foundation; it is not Higgsfield software and does not use Higgsfield branding or assets.

## Current status

- Real MCP SSE server and embedded dark teal Creative Studio widget.
- Tools: `list_capabilities`, `estimate_generation`, `generate_media`, `get_generation_status`, `cancel_generation`.
- Higgsfield provider adapter with server-side credentials and asynchronous job lifecycle.
- No fake media, seed data or silent fallback: without credentials the app reports `provider not configured`.
- In-memory job tracking by design in this first version; use a durable store before multi-instance production deployment.

## Requirements

- Node.js 20.11 or newer
- A Higgsfield API account and credentials for live generation
- HTTPS public hosting for ChatGPT connector use

## Local setup

```bash
npm install
cp .env.example .env
# Edit .env and add both HF_API_KEY_ID and HF_API_KEY_SECRET for live calls.
npm run typecheck
npm test
npm run build
npm start
```

The server listens on `http://127.0.0.1:8000` by default. Health check:

```bash
curl http://127.0.0.1:8000/health
```

The MCP SSE endpoint is `/mcp`; it intentionally remains open while streaming. The widget is built into `assets/creative-studio.html` during `npm run build` and is not committed because it is a generated artifact.

## ChatGPT Developer Mode

1. Deploy this service behind HTTPS.
2. Set `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`, and the provider credentials on the server only.
3. In ChatGPT Developer Mode, add an MCP connector using the server's `/mcp` SSE endpoint.
4. Call `list_capabilities` first. Generation is paid provider activity and must not be treated as a demo.

## Configuration

See `.env.example`. `HF_API_BASE_URL`, job status/cancel paths and model path overrides are configurable because provider API routes can change. Validate these values against the current Higgsfield API documentation before production deployment.

## Security and billing

- API credentials never enter widget state, tool output, `_meta`, source control or client-side JavaScript.
- Reference media must be supplied as public HTTPS URLs; do not send private URLs containing access tokens.
- Generation is billable. The server applies a per-request credit ceiling before submission, but provider billing remains the source of truth.
- Never expose the MCP endpoint unauthenticated on the public internet. Put it behind an authenticated reverse proxy or trusted connector boundary.
- Do not commit `.env`, provider keys or generated output.

## Development

```bash
npm run start:dev
npm run test:watch
npm run build
```

The project is MIT licensed. See `LICENSE` and retain upstream attribution for the OpenAI example foundation.
