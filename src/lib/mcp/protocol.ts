/**
 * Model Context Protocol over Streamable HTTP: stateless, and both protocol eras.
 *
 * Legacy clients (2025-03-26 … 2025-11-25) open with `initialize`. We answer it,
 * mint no Mcp-Session-Id (sessions are optional there), and serve every later
 * request on its own. Modern clients (2026-07-28) send no handshake: each request
 * carries its protocol version and capabilities in params._meta, mirrored in the
 * MCP-Protocol-Version / Mcp-Method / Mcp-Name headers, which must match the body.
 *
 * Every reply is one JSON object; nothing is streamed and nothing is stored.
 * Imported by src/pages/mcp/index.ts and by scripts/mcp.test.mjs, so keep this
 * file free of runtime imports other than ../apiSecurity.ts.
 */
import { readLimitedText, RequestBodyError } from "../apiSecurity.ts";

export type JsonObject = Record<string, unknown>;

export type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface ToolResult {
  content: Content[];
  structuredContent?: JsonObject;
  isError?: boolean;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  run: (args: JsonObject) => ToolResult | Promise<ToolResult>;
}

export interface McpServer {
  name: string;
  title: string;
  version: string;
  websiteUrl: string;
  iconUrl: string;
  instructions: string;
  tools: McpTool[];
}

export interface McpHttpOptions {
  /** Browser origins that may call the endpoint. Requests without an Origin header (server-side clients such as Claude) are always served. */
  allowedOrigins: readonly string[];
  maxBodyBytes?: number;
  /** Runs before a tool; returning a message refuses the call with that message (rate limits). */
  beforeToolCall?: (tool: string) => Promise<string | null>;
}

export const MODERN_VERSIONS: readonly string[] = ["2026-07-28"];
export const LEGACY_VERSIONS: readonly string[] = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SUPPORTED_VERSIONS: readonly string[] = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_VERSION = -32022;

/** Tool definitions change only with a deploy. */
const LIST_TTL_MS = 60 * 60 * 1000;
const ALLOW_HEADERS = "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID";
/** Modern requests whose target is mirrored in the Mcp-Name header, and the body field it mirrors. */
const NAMED_METHODS: Record<string, "name" | "uri"> = { "tools/call": "name", "prompts/get": "name", "resources/read": "uri" };

type Id = string | number;
interface Outcome {
  status: number;
  body: JsonObject;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function rpcError(id: Id | null, code: number, message: string, data?: unknown): JsonObject {
  return { jsonrpc: "2.0", ...(id === null ? {} : { id }), error: { code, message, ...(data === undefined ? {} : { data }) } };
}

const ok = (id: Id, result: JsonObject): Outcome => ({ status: 200, body: { jsonrpc: "2.0", id, result } });
const fail = (status: number, id: Id | null, code: number, message: string, data?: unknown): Outcome =>
  ({ status, body: rpcError(id, code, message, data) });

function reply(outcome: Outcome, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** Mcp-Name / Mcp-Param values may arrive as =?base64?…?= when they aren't plain ASCII. */
export function decodeHeaderValue(value: string | null): string | null {
  if (value === null) return null;
  const match = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/.exec(value);
  if (!match) return value;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function serverInfo(server: McpServer): JsonObject {
  return {
    name: server.name,
    title: server.title,
    version: server.version,
    websiteUrl: server.websiteUrl,
    icons: [{ src: server.iconUrl, mimeType: "image/png", sizes: ["192x192"] }],
  };
}

export function listTools(server: McpServer): JsonObject[] {
  return server.tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    // Every tool computes an answer from its arguments: no side effects, no outside calls.
    annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }));
}

async function callTool(id: Id, params: JsonObject, server: McpServer, options: McpHttpOptions): Promise<Outcome | ToolResult> {
  const name = params.name;
  if (typeof name !== "string") return fail(200, id, INVALID_PARAMS, "params.name must be a tool name.");
  const tool = server.tools.find((candidate) => candidate.name === name);
  if (!tool) return fail(200, id, INVALID_PARAMS, `Unknown tool: ${name}`);
  const args = params.arguments ?? {};
  if (!isObject(args)) return fail(200, id, INVALID_PARAMS, "params.arguments must be an object.");
  const refusal = options.beforeToolCall ? await options.beforeToolCall(name) : null;
  if (refusal) return { content: [{ type: "text", text: refusal }], isError: true };
  try {
    return await tool.run(args);
  } catch {
    return { content: [{ type: "text", text: `${tool.title} failed unexpectedly. Try again, or use ${server.websiteUrl} directly.` }], isError: true };
  }
}

const isOutcome = (value: Outcome | ToolResult): value is Outcome => "status" in value;

function initialize(id: Id, params: JsonObject, server: McpServer): Outcome {
  const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
  return ok(id, {
    // Echo a legacy version we speak, else offer our newest legacy one.
    protocolVersion: LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0],
    capabilities: { tools: { listChanged: false } },
    serverInfo: serverInfo(server),
    instructions: server.instructions,
  });
}

async function legacyRequest(request: Request, id: Id, method: string, params: JsonObject, server: McpServer, options: McpHttpOptions): Promise<Outcome> {
  // No header means a 2025-03-26 client, which predates it.
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !LEGACY_VERSIONS.includes(version)) {
    return fail(400, id, UNSUPPORTED_VERSION, "Unsupported protocol version", { supported: SUPPORTED_VERSIONS, requested: version });
  }
  switch (method) {
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: listTools(server) });
    case "tools/call": {
      const result = await callTool(id, params, server, options);
      return isOutcome(result) ? result : ok(id, { ...result });
    }
    // Some legacy hosts list these whatever the capabilities say; an empty list is the honest answer.
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return fail(200, id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

async function modernRequest(request: Request, id: Id, method: string, params: JsonObject, server: McpServer, options: McpHttpOptions): Promise<Outcome> {
  const meta = isObject(params._meta) ? params._meta : {};
  const version = meta[META_VERSION];
  if (typeof version !== "string") return fail(400, id, INVALID_PARAMS, `Missing _meta["${META_VERSION}"].`);

  const header = request.headers.get("mcp-protocol-version");
  if (header !== version) {
    return fail(400, id, HEADER_MISMATCH, header === null
      ? "Header mismatch: MCP-Protocol-Version header is missing."
      : `Header mismatch: MCP-Protocol-Version header '${header}' does not match body version '${version}'.`);
  }
  if (!MODERN_VERSIONS.includes(version)) {
    return fail(400, id, UNSUPPORTED_VERSION, "Unsupported protocol version", { supported: SUPPORTED_VERSIONS, requested: version });
  }
  const methodHeader = request.headers.get("mcp-method");
  if (methodHeader !== method) {
    return fail(400, id, HEADER_MISMATCH, `Header mismatch: Mcp-Method header ${methodHeader === null ? "is missing" : `'${methodHeader}' does not match body method '${method}'`}.`);
  }
  const nameField = NAMED_METHODS[method];
  if (nameField) {
    const nameHeader = decodeHeaderValue(request.headers.get("mcp-name"));
    if (nameHeader === null || nameHeader !== params[nameField]) {
      return fail(400, id, HEADER_MISMATCH, `Header mismatch: Mcp-Name header ${nameHeader === null ? "is missing or malformed" : `'${nameHeader}' does not match body ${nameField}`}.`);
    }
  }
  if (!isObject(meta[META_CAPABILITIES])) return fail(400, id, INVALID_PARAMS, `Missing _meta["${META_CAPABILITIES}"].`);

  const stamp = { [META_SERVER_INFO]: serverInfo(server) };
  switch (method) {
    case "server/discover":
      return ok(id, {
        resultType: "complete",
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: { tools: {} },
        instructions: server.instructions,
        ttlMs: LIST_TTL_MS,
        cacheScope: "public",
        _meta: stamp,
      });
    case "tools/list":
      return ok(id, { resultType: "complete", tools: listTools(server), ttlMs: LIST_TTL_MS, cacheScope: "public", _meta: stamp });
    case "tools/call": {
      const result = await callTool(id, params, server, options);
      return isOutcome(result) ? result : ok(id, { resultType: "complete", ...result, _meta: stamp });
    }
    default:
      return fail(404, id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

export async function handleMcpHttp(request: Request, server: McpServer, options: McpHttpOptions): Promise<Response> {
  const origin = request.headers.get("origin");
  // Spec: validate Origin (DNS rebinding). Server-side clients send none.
  if (origin !== null && !options.allowedOrigins.includes(origin)) {
    return reply(fail(403, null, INVALID_REQUEST, "Origin not allowed."), {});
  }
  const cors: Record<string, string> = origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": ALLOW_HEADERS, "Access-Control-Max-Age": "86400" },
    });
  }
  if (request.method !== "POST") {
    // No standalone SSE stream (legacy GET) and no sessions to end (legacy DELETE).
    return reply(fail(405, null, INVALID_REQUEST, "Method not allowed: send each JSON-RPC message as a POST."), { ...cors, Allow: "POST, OPTIONS" });
  }
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return reply(fail(415, null, INVALID_REQUEST, "Content-Type must be application/json."), cors);
  }

  let text: string;
  try {
    text = await readLimitedText(request, options.maxBodyBytes ?? 64 * 1024);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return reply(fail(status, null, INVALID_REQUEST, status === 413 ? "Request body is too large." : "Could not read the request body."), cors);
  }
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return reply(fail(400, null, PARSE_ERROR, "Parse error: the body is not JSON."), cors);
  }
  if (Array.isArray(message)) return reply(fail(400, null, INVALID_REQUEST, "Batches are not supported: send one JSON-RPC message per POST."), cors);
  if (!isObject(message) || message.jsonrpc !== "2.0") return reply(fail(400, null, INVALID_REQUEST, "Not a JSON-RPC 2.0 message."), cors);

  const method = message.method;
  if (typeof method !== "string") {
    // A reply to a server request; we never send any, so accept and ignore it.
    if ("id" in message && ("result" in message || "error" in message)) return new Response(null, { status: 202, headers: cors });
    return reply(fail(400, null, INVALID_REQUEST, "Missing method."), cors);
  }
  // Notifications (notifications/initialized, notifications/cancelled, …) need no reply.
  if (!("id" in message)) return new Response(null, { status: 202, headers: cors });

  const id = message.id;
  if (!(typeof id === "string" || (typeof id === "number" && Number.isFinite(id)))) {
    return reply(fail(400, null, INVALID_REQUEST, "Request id must be a string or a number."), cors);
  }
  const params = message.params ?? {};
  if (!isObject(params)) return reply(fail(400, id, INVALID_PARAMS, "params must be an object."), cors);

  const header = request.headers.get("mcp-protocol-version");
  const modern = (isObject(params._meta) && META_VERSION in params._meta) || (header !== null && MODERN_VERSIONS.includes(header));
  const outcome = method === "initialize"
    ? initialize(id, params, server)
    : modern
      ? await modernRequest(request, id, method, params, server, options)
      : await legacyRequest(request, id, method, params, server, options);
  return reply(outcome, cors);
}
