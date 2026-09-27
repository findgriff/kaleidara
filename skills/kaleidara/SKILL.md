---
name: kaleidara
description: "Create, refine and package mandalas, colouring books, colour-by-numbers artwork and patterns for print publishing."
---

# Kaleidara

Use this workflow for creative publishing projects. Kaleidara is not a licence to invent finished files: show the user the production decisions, preserve provenance, and require visual QA before a book is approved.

## Core workflow

1. Define the book or collection: subject, audience, difficulty, page count, trim size, paper/ink choice and whether the interior needs bleed.
2. Create the visual concept with a real configured image provider or an approved local renderer. Never invent generated assets when the provider is unavailable.
3. Convert the selected artwork into clean line-art, vector regions or a repeatable pattern tile as appropriate.
4. For colour-by-numbers, choose the palette, remove unusably small regions, place numbers inside their regions and generate a matching colour key.
5. Assemble the interior and cover using the selected trim size, bleed, gutter and safe-area rules.
6. Run print QA: page size, page count, resolution, clipping, blank pages, number placement, colour-key completeness, pattern seams, margins, font embedding and PDF readability.
7. Export the final package and identify every file clearly. Do not claim KDP readiness until the PDF has been visually inspected and checked in Amazon KDP Print Previewer.

## Default reverse page

Every colouring-book artwork page uses the versioned layout in `templates/reverse-page-template.json` unless the user selects another template. The artwork front remains clean; the reverse side contains:

- A large, centred, editorial-style inspirational quotation.
- The historical figure's name and birth/death years.
- A source and rights note for the quotation.
- Eight large, blank colour cubes in a two-column grid.
- A `Pen / colour:` field below each cube.
- Colour-by-numbers mode where cube labels must match every number in the artwork.
- Black-and-white, non-full-bleed printing to reduce marker bleed-through.

Use large square swatches, not narrow lines. Keep the quotation visually dominant and use an editorial serif italic style with generous spacing. Never publish a quotation without a source and rights status.

The default example is Emily Dickinson's public-domain poem excerpt, but the production library should rotate through verified historical figures and artists rather than repeating one author.
## Specialist modes

- **Mandala:** radial symmetry, segment count, line weight, complexity and circular page composition.
- **Colouring page:** black-and-white line-art, clean enclosed regions, printable line weight and no grey background.
- **Colour-by-numbers:** deterministic region IDs, palette key, readable labels and a reject gate for tiny or unnumbered regions.
- **Pattern:** repeat tile, half-drop or mirror mode, edge matching and seam preview at multiple scales.
- **KDP book:** interior PDF, cover/spine package, contact sheet, metadata manifest and QA report.

## ChatGPT Apps SDK connection

The Kaleidara repository contains the MCP server and embedded widget. A live provider connection must be configured separately through the deployed HTTPS MCP endpoint. Never put provider credentials in the plugin, GitHub, widget state or chat messages.

## Output discipline

Separate these states clearly: concept, generated, processed, assembled, QA failed, QA passed and ready for manual KDP upload. Human review and Amazon's Print Previewer remain mandatory.
