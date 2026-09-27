import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { WIDGET_CSS } from "../src/widget/styles.js";

/**
 * Bundles the React widget into a single self-contained HTML file.
 *
 * The Apps SDK serves widget markup as one MCP resource, so everything — JS,
 * CSS, the root element — has to be inlined. esbuild is used directly rather
 * than a bundler-with-a-plugin because the output is a single entry point with
 * no code splitting, assets, or dev server involved.
 *
 * No network access and no credentials are required or read here: the output is
 * static markup, and the widget obtains all data at runtime via MCP tool calls.
 */

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT_DIR, "assets");
const OUT_FILE = path.join(OUT_DIR, "creative-studio.html");

function escapeForScriptTag(code: string): string {
  // A literal `</script>` inside the bundle would terminate the tag early.
  return code.replaceAll("</script>", "<\\/script>");
}

function renderHtml(script: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>AGENT OS Creative Studio</title>
<style>
html, body { margin: 0; padding: 0; background: #051417; }
#agent-os-studio-root { display: block; }
${WIDGET_CSS}
</style>
</head>
<body>
<div id="agent-os-studio-root"></div>
<script type="module">
${escapeForScriptTag(script)}
</script>
</body>
</html>
`;
}

async function main(): Promise<void> {
  const result = await build({
    entryPoints: [path.join(ROOT_DIR, "src", "widget", "main.tsx")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    jsx: "automatic",
    minify: true,
    write: false,
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });

  const output = result.outputFiles?.[0];
  if (!output) throw new Error("esbuild produced no widget bundle.");

  await mkdir(OUT_DIR, { recursive: true });
  const html = renderHtml(output.text);
  await writeFile(OUT_FILE, html, "utf8");

  const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
  console.log(`Built widget → ${path.relative(ROOT_DIR, OUT_FILE)} (${kb} kB)`);
}

main().catch((error: unknown) => {
  console.error("Widget build failed:", error);
  process.exit(1);
});
