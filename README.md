# Kaleidara

<p align="center">
  <img src="assets/kaleidara-logo.png" alt="Kaleidara — Create, Colour, Publish" width="800" />
</p>

<p align="center"><strong>Create. Colour. Publish.</strong><br />The creative publishing studio for ChatGPT.</p>

<p align="center">
  <img src="https://img.shields.io/badge/build-local%20verified-18c7a1?style=flat-square" alt="Local build verified" />
  <img src="https://img.shields.io/badge/ChatGPT-Apps%20SDK-111827?style=flat-square" alt="ChatGPT Apps SDK" />
  <img src="https://img.shields.io/badge/license-MIT-8b7cff?style=flat-square" alt="MIT licence" />
</p>

> *Kaleidara turns an idea into a finished creative product — from the first visual concept to a print-ready colouring book, pattern collection or publishing pack.*

Kaleidara is an original ChatGPT Apps SDK/MCP application developed by OpsPocket. It combines conversational creative direction with real media providers, deterministic artwork processing and production-focused export workflows.

It is designed for creators, illustrators, publishers and small businesses who want more than a single generated image. Kaleidara is built around the complete journey:

**Imagine → Generate → Refine → Validate → Publish**

## What Kaleidara is for

- Mandala and geometric artwork.
- Printable colouring pages.
- Colour-by-numbers books.
- Seamless pattern collections.
- Activity books and adult colouring books.
- Product and cover artwork.
- KDP-ready interior and cover packages.
- Repeatable collections rather than one-off images.

## ChatGPT tools

The current Apps SDK server exposes:

- `list_capabilities` — show configured real providers and models.
- `estimate_generation` — price a request before any paid submission.
- `generate_media` — submit a real image or video job.
- `get_generation_status` — poll the provider and retrieve real assets.
- `cancel_generation` — cancel an active provider job where supported.

The specialist publishing layer is the next development track:

- `create_mandala`
- `create_coloring_page`
- `create_color_by_numbers`
- `create_seamless_pattern`
- `build_coloring_book`
- `build_kdp_interior`
- `build_kdp_cover`
- `validate_kdp_files`
- `export_book_package`

## Product principles

### Beautiful by default

Kaleidara uses a dark, premium teal interface designed for focused creative work rather than a noisy prompt box.

### Production, not pretend demos

The application never invents generated media. If a real provider is not configured, Kaleidara reports that state clearly.

### Print-aware output

The publishing pipeline is designed around trim size, bleed, gutter, safe margins, resolution, page count and final PDF inspection.

### Human approval remains essential

Kaleidara can accelerate production, but every book must still be visually reviewed and checked in Amazon KDP Print Previewer before publication.

## Architecture

```text
ChatGPT
   │ Apps SDK / MCP over HTTPS
   ▼
Kaleidara server
   ├── Creative Studio widget
   ├── request validation and credit guardrails
   ├── real provider adapters
   ├── job status and cancellation
   └── publishing and QA pipeline (next track)
          ├── line-art processing
          ├── colour-region segmentation
          ├── SVG / PNG / PDF export
          └── KDP trim, bleed and margin validation
```

## Current implementation status

The ChatGPT app foundation is complete and verified. The first publishing-specific modules are planned but are not represented as finished until they are built and tested against real output.

Verified commands:

```bash
npm run typecheck
npm test
npm run build
```

Current test result: 5 tests passing. The build produces the embedded widget at `assets/creative-studio.html`.

## Install as an OpenAI/Codex plugin marketplace

In the OpenAI desktop app or Codex Plugins screen, choose **Add plugin marketplace** and enter:

- **Source:** `findgriff/kaleidara`
- **Git ref:** `main`
- **Sparse paths:** leave blank

The blank Sparse paths are intentional: Kaleidara uses the repository root plugin manifest (`plugin.json`) and the compatibility manifest at `.codex-plugin/plugin.json`.

This installs the Kaleidara workflow package and branding. It does not deploy the live media-generation server. To use the ChatGPT Apps SDK widget and real providers, connect the separately deployed HTTPS MCP endpoint after installation and configure provider credentials on the server only.

## Local setup

Requirements:

- Node.js 20.11 or newer.
- A real provider account for live generation.
- HTTPS hosting for ChatGPT connector use.

```bash
git clone https://github.com/findgriff/kaleidara.git
cd kaleidara
npm install
cp .env.example .env
npm run typecheck
npm test
npm run build
npm start
```

The server listens on port `8000` by default. The health endpoint is:

```bash
curl http://127.0.0.1:8000/health
```

## Real-provider security

- Provider credentials remain server-side.
- Secrets are never sent to the widget or returned in MCP metadata.
- `.env` is excluded from Git.
- Reference media must use public HTTPS URLs; private URLs containing access tokens should never be submitted.
- Credit ceilings are applied before billable submission.
- Live generation must run behind an authenticated HTTPS boundary.

## KDP publishing direction

Kaleidara will create production files for manual upload to Amazon KDP rather than attempting unsafe account automation. The planned publishing package includes:

- Interior PDF.
- Cover PDF with spine calculation.
- Trim and bleed settings.
- Safe-margin validation.
- Page-count validation.
- Contact sheet preview.
- Colour key pages.
- Metadata and collection manifest.
- ZIP export.
- Machine-readable QA report.

The default reverse-page template is stored at `templates/reverse-page-template.json`. It places the artwork on the front and, on the reverse, a large styled sourced quotation plus eight large blank colour cubes with pen/colour fields. Colour-by-numbers mode requires cube labels to match every number in the facing artwork.

Amazon KDP Print Previewer remains the final publishing authority. Generated files must be inspected before upload.

## Licence and attribution

Kaleidara is released under the MIT licence. The project was built using the MIT-licensed OpenAI Apps SDK example foundation and remains clearly identified as an independent OpsPocket project. It does not copy Higgsfield branding, assets or proprietary interface code.

The name **Kaleidara** is a working brand name and has not yet been formally trademark-cleared. Domain, company-name and trademark checks are required before commercial launch.

## Brand

**Name:** Kaleidara

**Meaning:** A coined, globally pronounceable name inspired by kaleidoscopic transformation and crafted artwork.

**Tagline:** Create · Colour · Publish

**Brand character:** Precise, imaginative, premium, calm and production-minded.

**Core colours:**

- Deep studio teal: `#07171B`
- Kaleidara teal: `#46D7C0`
- Violet accent: `#8578FF`
- Warm gold: `#FFD166`
- Soft white: `#F4FFFC`

Logo source files are available in `assets/kaleidara-logo.svg` and `assets/kaleidara-logo.png`.
