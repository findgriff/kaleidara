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
  const server = new Server({ name: "kaleidara", version: "0.2.0" }, { capabilities: { resources: {}, tools: {} } });
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
async function sse(res: ServerResponse) { cors(res); const server = createAppServer(); const transport = new SSEServerTransport("/mcp/messages", res); const id = transport.sessionId; sessions.set(id, { server, transport }); transport.onclose = async () => { sessions.delete(id); await server.close(); }; await server.connect(transport); }
async function message(req: IncomingMessage, res: ServerResponse, sessionId: string | null) { cors(res); const session = sessionId && sessions.get(sessionId); if (!session) { res.writeHead(404).end("Unknown session"); return; } await session.transport.handlePostMessage(req, res); }
const httpServer = createServer(async (req, res) => { try { const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`); if (req.method === "OPTIONS") { cors(res); res.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }).end(); return; } if (req.method === "GET" && url.pathname === "/mcp") { await sse(res); return; } if (req.method === "POST" && url.pathname === "/mcp/messages") { await message(req, res, url.searchParams.get("sessionId")); return; } if (req.method === "GET" && url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, service: "agent-os-creative-studio" })); return; } res.writeHead(404).end("Not Found"); } catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500).end("Internal server error"); } });
httpServer.listen(config.PORT, config.HOST, () => console.log(`AGENT OS Creative Studio listening on ${config.HOST}:${config.PORT}`));
