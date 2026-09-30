import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { parseEnv, getConfig, parseAllowedOrigins } from "./config/env.js";
import { StudioService } from "./studio/service.js";
import { EstimateGenerationInputSchema, GenerateMediaInputSchema, ListCapabilitiesInputSchema, GetGenerationStatusInputSchema, CancelGenerationInputSchema } from "./schemas/generation.js";
import { CreateBookCoverInputSchema, CreateColorByNumbersSetInputSchema, buildColorByNumbersPrompts, coverGenerationRequest } from "./publishing/briefs.js";
import { buildTitlePackage, coverCopyBlock, validateKdpMetadata, validateKeywords } from "./publishing/kdp.js";
import { SubjectFactReversePagesInputSchema, buildSubjectFactReversePages } from "./publishing/subject-facts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET = path.join(ROOT, "assets", "creative-studio.html");
const WIDGET_URI = "ui://widget/creative-studio.html";
const config = parseEnv();
const service = new StudioService(config);
const widgetHtml = () => fs.readFileSync(ASSET, "utf8");
const meta = {
  "openai/outputTemplate": WIDGET_URI,
  "openai/widgetAccessible": true,
  "openai/toolInvocation/invoking": "Opening Kaleidara",
  "openai/toolInvocation/invoked": "Kaleidara ready",
};

const tools: any[] = [
  { name: "list_capabilities", title: "List Creative Studio capabilities", description: "List configured real media providers and available image/video models.", inputSchema: { type: "object", properties: { mediaType: { type: "string", enum: ["image", "video"] }, providerId: { type: "string" } }, additionalProperties: false }, _meta: meta },
  { name: "estimate_generation", title: "Estimate generation", description: "Estimate credits and time before a paid generation request.", inputSchema: { type: "object", properties: { prompt: { type: "string" }, negativePrompt: { type: "string" }, mediaType: { type: "string", enum: ["image", "video"] }, providerId: { type: "string" }, modelId: { type: "string" }, aspectRatio: { type: "string" }, resolution: { type: "string" }, durationSeconds: { type: "number" }, referenceUrls: { type: "array", items: { type: "string" } }, seed: { type: "number" }, quantity: { type: "number" } }, required: ["prompt"], additionalProperties: false }, _meta: meta },
  { name: "generate_media", title: "Generate media", description: "Submit a real image or video generation job. This may incur provider charges.", inputSchema: { type: "object", properties: { prompt: { type: "string" }, negativePrompt: { type: "string" }, mediaType: { type: "string", enum: ["image", "video"] }, providerId: { type: "string" }, modelId: { type: "string" }, aspectRatio: { type: "string" }, resolution: { type: "string" }, durationSeconds: { type: "number" }, referenceUrls: { type: "array", items: { type: "string" } }, seed: { type: "number" }, quantity: { type: "number" }, maxCredits: { type: "number" } }, required: ["prompt"], additionalProperties: false }, _meta: meta },
  { name: "create_book_cover", title: "Create a KDP book cover", description: "Build and submit a print-aware 2:3 front-cover generation brief with Kaleidara branding, title hierarchy, subject relevance and high-resolution requirements. The title and subtitle are validated against the Amazon KDP metadata rules first, and the response returns the exact cover text that must be printed so the artwork and the dashboard fields cannot drift apart.", inputSchema: { type: "object", properties: { title: { type: "string" }, subject: { type: "string" }, subtitle: { type: "string" }, series: { type: "string" }, authorLine: { type: "string" }, brandName: { type: "string" }, paletteMode: { type: "string", enum: ["natural", "psychedelic", "dmt-inspired"] }, providerId: { type: "string" }, modelId: { type: "string" }, resolution: { type: "string" }, referenceUrls: { type: "array", items: { type: "string" } }, seed: { type: "number" }, maxCredits: { type: "number" } }, required: ["title", "subject"], additionalProperties: false }, _meta: meta },
  { name: "create_color_by_numbers_set", title: "Create distinct colour-by-numbers pages", description: "Generate a set of intentionally different colour-by-numbers compositions with a natural, psychedelic or DMT-inspired palette mode and matching numbered colour-key requirements.", inputSchema: { type: "object", properties: { bookTitle: { type: "string" }, subject: { type: "string" }, quantity: { type: "number" }, paletteMode: { type: "string", enum: ["natural", "psychedelic", "dmt-inspired"] }, paletteSize: { type: "number" }, resolution: { type: "string" }, providerId: { type: "string" }, modelId: { type: "string" }, referenceUrls: { type: "array", items: { type: "string" } }, seed: { type: "number" }, maxCredits: { type: "number" } }, required: ["subject"], additionalProperties: false }, _meta: meta },
  { name: "create_book_title", title: "Create a validated KDP title package", description: "Build the Amazon KDP title, subtitle, series, cover-copy block and 7 backend keyword strings for a colouring book. Enforces the 200-character title-plus-subtitle limit, the no-word-more-than-twice rule and KDP's prohibited-term list, and reports any subtitle segment it had to drop.", inputSchema: { type: "object", properties: { theme: { type: "string", enum: ["mandala", "floral", "geometric", "nature", "animal", "celtic", "seasonal", "abstract"] }, format: { type: "string", enum: ["coloring-book", "color-by-numbers", "activity-book", "pattern-collection"] }, audience: { type: "string", enum: ["women", "women-teens", "teens", "everyone"] }, designCount: { type: "number" }, difficulty: { type: "string", enum: ["simple", "simple-to-intricate", "advanced"] }, brandName: { type: "string" }, seriesName: { type: "string" }, authorLine: { type: "string" }, hook: { type: "string" }, mood: { type: "string", enum: ["calm-water", "luminous", "botanical", "dusk-night", "cosmic", "any"] }, positioning: { type: "string", enum: ["brand-hook", "audience-led", "spec-led", "gift-led", "difficulty-led"] }, singleSided: { type: "boolean" }, trimSize: { type: "string" }, giftAngle: { type: "boolean" }, maxHeadroom: { type: "number" } }, additionalProperties: false }, _meta: meta },
  { name: "validate_kdp_metadata", title: "Validate KDP metadata", description: "Check a title and subtitle pair, and any backend keyword strings, against the Amazon KDP metadata rules that cause rejection or listing suppression. Use this before uploading, because KDP cross-checks the words printed on a cover against the Title and Subtitle fields.", inputSchema: { type: "object", properties: { title: { type: "string" }, subtitle: { type: "string" }, keywords: { type: "array", items: { type: "string" } } }, required: ["title"], additionalProperties: false }, _meta: meta },
  { name: "build_subject_fact_reverse_pages", title: "Build verified subject-fact reverse pages", description: "Build reverse pages for a subject-specific colouring book using a different, source-backed fact matched to each page's species or subject. Keeps the eight numbered colour swatches and Pen / colour fields, and prohibits quotations in subject-fact mode.", inputSchema: { type: "object", properties: { bookTitle: { type: "string" }, subjectFamily: { type: "string" }, pages: { type: "array", items: { type: "object", properties: { pageNumber: { type: "number" }, subject: { type: "string" }, fact: { type: "string" }, sourceTitle: { type: "string" }, sourceUrl: { type: "string" }, sourceAccessed: { type: "string" } }, required: ["pageNumber", "subject", "fact", "sourceTitle", "sourceUrl"], additionalProperties: false } }, paletteCubes: { type: "number" }, noQuotations: { type: "boolean" } }, required: ["bookTitle", "subjectFamily", "pages"], additionalProperties: false }, _meta: meta },
  { name: "get_generation_status", title: "Get generation status", description: "Poll a submitted generation job and return real provider status and assets.", inputSchema: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"], additionalProperties: false }, _meta: meta },
  { name: "cancel_generation", title: "Cancel generation", description: "Cancel an active generation job upstream where supported.", inputSchema: { type: "object", properties: { jobId: { type: "string" }, reason: { type: "string" } }, required: ["jobId"], additionalProperties: false }, _meta: meta },
];

function result(data: unknown, text = "Creative Studio response") {
  return { content: [{ type: "text", text }], structuredContent: data, _meta: meta };
}
function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  return { isError: true, content: [{ type: "text", text: message }], structuredContent: { error: message }, _meta: meta };
}
function createAppServer() {
  const server = new Server({ name: "kaleidara", version: "0.5.0" }, { capabilities: { resources: {}, tools: {} } });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: WIDGET_URI, name: "Kaleidara", description: "Create, colour and publish print-ready artwork", mimeType: "text/html+skybridge", _meta: meta }] }));
  server.setRequestHandler(ReadResourceRequestSchema, async () => ({ contents: [{ uri: WIDGET_URI, mimeType: "text/html+skybridge", text: widgetHtml(), _meta: meta }] }));
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const name = request.params.name;
      const args = request.params.arguments ?? {};
      if (name === "list_capabilities") return result(service.listCapabilities(ListCapabilitiesInputSchema.parse(args)), "Capabilities loaded");
      if (name === "estimate_generation") return result(service.estimate(EstimateGenerationInputSchema.parse(args)), "Estimate ready");
      if (name === "generate_media") return result(await service.generate(GenerateMediaInputSchema.parse(args)), "Generation job submitted");
      if (name === "create_book_cover") {
        const input = CreateBookCoverInputSchema.parse(args);
        const validation = validateKdpMetadata({ title: input.title, subtitle: input.subtitle });
        const copyBlock = coverCopyBlock({ title: input.title, subtitle: input.subtitle, brandName: input.brandName, authorLine: input.authorLine });
        return result({
          kind: "book_cover",
          brief: input,
          kdpMetadata: {
            title: input.title,
            subtitle: input.subtitle ?? null,
            series: input.series ?? null,
            coverCopyMustMatchExactly: copyBlock,
            characters: { title: validation.titleChars, subtitle: validation.subtitleChars, combined: validation.combinedChars, limit: validation.combinedLimit, headroom: validation.headroom },
            warnings: validation.issues.filter((issue) => issue.severity === "warning"),
          },
          job: await service.generate(coverGenerationRequest(input)),
        }, "Book-cover generation job submitted");
      }
      if (name === "create_book_title") {
        const pkg = buildTitlePackage(args as any);
        return result({ kind: "title_package", ...pkg }, pkg.validation.valid ? "KDP title package ready" : "KDP title package has validation errors");
      }
      if (name === "validate_kdp_metadata") {
        const title = typeof args.title === "string" ? args.title : "";
        const subtitle = typeof args.subtitle === "string" ? args.subtitle : undefined;
        const keywords = Array.isArray(args.keywords) ? args.keywords.filter((entry): entry is string => typeof entry === "string") : [];
        const validation = validateKdpMetadata({ title, subtitle });
        return result({ kind: "kdp_validation", validation, keywordIssues: validateKeywords(keywords, { title, subtitle }) }, validation.valid ? "KDP metadata valid" : "KDP metadata has errors");
      }
      if (name === "create_color_by_numbers_set") {
        const input = CreateColorByNumbersSetInputSchema.parse(args);
        const prompts = buildColorByNumbersPrompts(input);
        const jobs = await Promise.all(prompts.map((prompt, index) => service.generate(GenerateMediaInputSchema.parse({
          prompt,
          negativePrompt: "duplicate composition, repeated pose, blurry, grey wash, gradient shading, tiny regions, unreadable numbers, cropped subject, watermark",
          mediaType: "image",
          providerId: input.providerId,
          modelId: input.modelId,
          aspectRatio: "3:4",
          resolution: input.resolution,
          referenceUrls: input.referenceUrls,
          seed: input.seed === undefined ? undefined : input.seed + index,
          quantity: 1,
          maxCredits: input.maxCredits === undefined ? undefined : input.maxCredits / input.quantity,
        }))));
        return result({ kind: "color_by_numbers_set", brief: input, prompts, jobs }, "Colour-by-numbers generation jobs submitted");
      }
      if (name === "build_subject_fact_reverse_pages") {
        const input = SubjectFactReversePagesInputSchema.parse(args);
        return result({
          kind: "subject_fact_reverse_pages",
          bookTitle: input.bookTitle,
          subjectFamily: input.subjectFamily,
          mode: "subject-fact",
          pages: buildSubjectFactReversePages(input),
          template: "kaleidara-reverse-page-v1@1.1.0",
          quotationsIncluded: false,
          paletteCubes: input.paletteCubes,
        }, "Verified subject-fact reverse pages ready");
      }
      if (name === "get_generation_status") return result(await service.getStatus(GetGenerationStatusInputSchema.parse(args)), "Generation status loaded");
      if (name === "cancel_generation") return result(await service.cancel(CancelGenerationInputSchema.parse(args)), "Generation cancellation requested");
      throw new Error(`Unknown tool: ${name}`);
    } catch (error) { return errorResult(error); }
  });
  return server;
}

type Session = { server: Server; transport: SSEServerTransport };
const sessions = new Map<string, Session>();
const originConfig = parseAllowedOrigins(config.ALLOWED_ORIGINS);
function cors(res: ServerResponse) { res.setHeader("Access-Control-Allow-Origin", originConfig === "*" ? "*" : originConfig[0] ?? "*"); res.setHeader("Access-Control-Allow-Headers", "content-type"); }
async function sse(res: ServerResponse) { cors(res); const server = createAppServer(); const transport = new SSEServerTransport("/mcp/messages", res); const id = transport.sessionId; sessions.set(id, { server, transport }); let closing = false; transport.onclose = async () => { if (closing) return; closing = true; sessions.delete(id); transport.onclose = undefined; await server.close(); }; await server.connect(transport); }
async function message(req: IncomingMessage, res: ServerResponse, sessionId: string | null) { cors(res); const session = sessionId && sessions.get(sessionId); if (!session) { res.writeHead(404).end("Unknown session"); return; } await session.transport.handlePostMessage(req, res); }
const httpServer = createServer(async (req, res) => { try { const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`); if (req.method === "OPTIONS") { cors(res); res.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }).end(); return; } if (req.method === "GET" && url.pathname === "/mcp") { await sse(res); return; } if (req.method === "POST" && url.pathname === "/mcp/messages") { await message(req, res, url.searchParams.get("sessionId")); return; } if (req.method === "GET" && url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, service: "agent-os-creative-studio" })); return; } res.writeHead(404).end("Not Found"); } catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500).end("Internal server error"); } });
httpServer.listen(config.PORT, config.HOST, () => console.log(`OpsPocket Creative Studio listening on ${config.HOST}:${config.PORT}`));
