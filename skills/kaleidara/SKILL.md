---
name: kaleidara
description: "Create, refine and package mandalas, colouring books, colour-by-numbers artwork and patterns for print publishing."
---

# Kaleidara

Use this workflow for creative publishing projects. Kaleidara is not a licence to invent finished files: show the user the production decisions, preserve provenance, and require visual QA before a book is approved.

## Core workflow

1. Define the book or collection: subject, audience, difficulty, page count, trim size, paper/ink choice and whether the interior needs bleed.
2. Lock the KDP metadata first with `create_book_title`. The title and subtitle are the highest-weight search surface and they fix the exact words the cover is allowed to print, so they must be settled before any artwork exists. Confirm the returned package validates and note any subtitle segment the tool had to drop.
3. Create the visual concept with a real configured image provider or an approved local renderer. Never invent generated assets when the provider is unavailable.
4. Convert the selected artwork into clean line-art, vector regions or a repeatable pattern tile as appropriate.
5. For colour-by-numbers, choose the palette, remove unusably small regions, place numbers inside their regions and generate a matching colour key.
6. Generate the cover from the locked metadata and print the returned cover copy verbatim. Run the front-cover artwork through visual QA, because image models routinely misspell lettering and no automated check replaces looking at it.
7. Assemble the interior and cover using the selected trim size, bleed, gutter and safe-area rules.
8. Run print QA: page size, page count, resolution, clipping, blank pages, number placement, colour-key completeness, pattern seams, margins, font embedding and PDF readability.
9. Export the final package and identify every file clearly. Do not claim KDP readiness until the PDF has been visually inspected and checked in Amazon KDP Print Previewer.

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

- **KDP title package (do this first):** `create_book_title` builds the Amazon KDP title, subtitle, series, cover-copy block and seven backend keyword strings, and validates them against the rules that cause rejection. Always generate the title *before* generating a cover. Choose a `positioning` of `brand-hook`, `audience-led`, `spec-led`, `gift-led` or `difficulty-led`. Prefer `brand-hook`: it leads with the brand so every impression trains recall and survives search-result truncation, then names the book with an atmospheric hook from the curated library.
- **KDP metadata check:** `validate_kdp_metadata` tests any title and subtitle pair, plus keyword strings, and reports every problem: the 200-character combined limit, a word used more than twice, prohibited sales-rank or promotional wording, placeholder titles, and keyword slots that waste characters on words the title already indexes.
- **Front cover:** `create_book_cover` builds a 2:3, high-resolution KDP front-cover brief with the book title, optional subtitle/author line, Kaleidara branding, subject relevance, thumbnail legibility, print-safe composition and a selected natural, psychedelic or DMT-inspired palette direction. It refuses metadata that breaches the KDP rules, and it returns the exact cover text that must be printed. It submits a real provider job; it does not fabricate a finished cover when no provider is configured.
- **Colour-by-numbers set:** `create_color_by_numbers_set` creates 2–4 separately prompted pages. Each variation receives a different composition, viewpoint, pose or environment, a controlled palette mode and an explicit numbered-region/key requirement. Natural mode asks for biologically/ecologically plausible colours; psychedelic and DMT-inspired modes deliberately loosen that rule while preserving recognisable subjects.
- **Mandala:** radial symmetry, segment count, line weight, complexity and circular page composition.
- **Colouring page:** black-and-white line-art, clean enclosed regions, printable line weight and no grey background.
- **Colour-by-numbers:** deterministic region IDs, palette key, readable labels and a reject gate for tiny or unnumbered regions.
- **Pattern:** repeat tile, half-drop or mirror mode, edge matching and seam preview at multiple scales.
- **KDP book:** interior PDF, cover/spine package, contact sheet, metadata manifest and QA report.

## The cover must match the metadata, exactly

Amazon KDP cross-checks the words printed on a cover against the Title and Subtitle fields entered in the dashboard. A mismatch is the single most common silent rejection and can suppress the listing. Two consequences, both non-negotiable:

1. **Lock the title before generating the cover.** The title is the highest-weight search surface a book has, and it is the only thing the cover may print. Generating a cover first and naming the book afterwards locks the title to whatever the artwork happens to say.
2. **Print the returned cover copy verbatim.** `create_book_cover` returns `kdpMetadata.coverCopyMustMatchExactly`. That block is the only text permitted on the cover. A subtitle present in the dashboard but absent from the cover is itself a mismatch, so never add a metadata subtitle that the artwork does not carry.

Prefer an ownable, atmospheric hook over a bare descriptor. A descriptive phrase such as "Advanced Mandalas" is used by many competing listings, cannot be differentiated or trademarked, and forces the book to compete on price. Put a difficulty qualifier inside the subtitle instead, where it still filters the audience without wasting the hook position. Words are also capped: no word other than articles, conjunctions and prepositions may appear more than twice in a title.

## ChatGPT Apps SDK connection

The Kaleidara repository contains the MCP server and embedded widget. A live provider connection must be configured separately through the deployed HTTPS MCP endpoint. Never put provider credentials in the plugin, GitHub, widget state or chat messages.

## Output discipline

Separate these states clearly: concept, generated, processed, assembled, QA failed, QA passed and ready for manual KDP upload. Human review and Amazon's Print Previewer remain mandatory.
