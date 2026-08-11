// Network research tool suite. External content is DATA, never instructions.
// Write-capable requests are explicit and permission-gated by AgentWorkspace/AgentRuntime.
import { createHash } from "node:crypto";

export type NetworkToolId = "web_search" | "web_fetch" | "document_fetch" | "github_search" | "http_request";
export type NetworkScope = "PUBLIC_WEB" | "SPECIFIC_DOMAIN" | "SPECIFIC_REPOSITORY";
export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface NetworkRequest {
  tool: NetworkToolId;
  query?: string;
  url?: string;
  domain?: string;
  repository?: string;
  maxResults?: number;
  timeoutMs?: number;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  allowWrite?: boolean;
}

export interface RetrievedSource {
  url: string;
  title?: string;
  content: string;
  contentType: string;
  status: number;
  retrievedAt: number;
  contentHash: string;
  publisher?: string;
  publicationDate?: string;
  tool: NetworkToolId;
  externalContent: true;
}

export interface NetworkResult { ok: boolean; tool: NetworkToolId; query?: string; sources: RetrievedSource[]; error?: string; durationMs: number; status?: number; }
export interface SearchResult { title: string; url: string; snippet: string; source: "WEB_SEARCH"; }

const hash = (content: string) => createHash("sha256").update(content).digest("hex");

function assertPublicUrl(raw: string): URL {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are allowed");
  const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"]);
  if (blockedHosts.has(url.hostname) || url.hostname.endsWith(".local")) throw new Error("Local or metadata-service targets are not allowed");
  return url;
}

async function fetchWithTimeout(url: string, timeoutMs = 15000, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(timeoutMs, 30000)));
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow", headers: { "User-Agent": "RuthlessInvestigator/0.4 research-bot", ...(init.headers ?? {}) } });
  } finally { clearTimeout(timer); }
}

function stripHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

export async function webFetch(url: string, timeoutMs = 15000): Promise<RetrievedSource> {
  const safe = assertPublicUrl(url);
  const response = await fetchWithTimeout(safe.toString(), timeoutMs);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "text/plain";
  const content = contentType.includes("text/html") ? stripHtml(raw) : raw;
  return { url: response.url || safe.toString(), title: response.url || safe.toString(), content, contentType, status: response.status, retrievedAt: Date.now(), contentHash: hash(content), publisher: safe.hostname, tool: "web_fetch", externalContent: true };
}

export async function webSearch(query: string, maxResults = 8): Promise<SearchResult[]> {
  if (!query.trim()) throw new Error("Search query is required");
  const response = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
  const html = await response.text();
  const results: SearchResult[] = [];
  const pattern = /<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && results.length < Math.min(maxResults, 20)) {
    const title = stripHtml(match[2]); let url = match[1];
    try { const parsed = new URL(url.startsWith("//") ? `https:${url}` : url); url = decodeURIComponent(parsed.searchParams.get("uddg") ?? parsed.toString()); assertPublicUrl(url); } catch { continue; }
    results.push({ title, url, snippet: "", source: "WEB_SEARCH" });
  }
  return results;
}

export async function githubSearch(query: string, maxResults = 8): Promise<SearchResult[]> {
  const response = await fetchWithTimeout(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${Math.min(maxResults, 30)}`);
  if (!response.ok) throw new Error(`GitHub search returned HTTP ${response.status}`);
  const data = await response.json() as { items?: Array<{ full_name: string; html_url: string; description?: string }> };
  return (data.items ?? []).map(item => ({ title: item.full_name, url: item.html_url, snippet: item.description ?? "", source: "WEB_SEARCH" }));
}

async function httpRequest(request: NetworkRequest): Promise<NetworkResult> {
  if (!request.url) throw new Error("url is required");
  const method = request.method ?? "GET";
  if (!["GET", "HEAD"].includes(method) && !request.allowWrite) throw new Error("Write HTTP methods require explicit allowWrite=true and a matching permission");
  const safe = assertPublicUrl(request.url);
  const headers = { ...(request.headers ?? {}) };
  delete headers.authorization; delete headers.Authorization; delete headers.cookie; delete headers.Cookie;
  const response = await fetchWithTimeout(safe.toString(), request.timeoutMs, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : request.body });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "text/plain";
  const content = contentType.includes("text/html") ? stripHtml(raw) : raw;
  const source: RetrievedSource = { url: response.url || safe.toString(), title: response.url || safe.toString(), content, contentType, status: response.status, retrievedAt: Date.now(), contentHash: hash(content), publisher: safe.hostname, tool: "http_request", externalContent: true };
  return { ok: response.status >= 200 && response.status < 400, tool: "http_request", sources: [source], durationMs: 0, status: response.status };
}

export async function executeNetworkTool(request: NetworkRequest): Promise<NetworkResult> {
  const started = Date.now();
  try {
    if (request.tool === "web_search" || request.tool === "github_search") {
      const results = request.tool === "github_search" ? await githubSearch(request.query ?? "", request.maxResults ?? 8) : await webSearch(request.query ?? "", request.maxResults ?? 8);
      return { ok: true, tool: request.tool, query: request.query, sources: results.map(r => ({ url: r.url, title: r.title, content: r.snippet, contentType: "search-result", status: 200, retrievedAt: Date.now(), contentHash: hash(r.url + r.title), tool: request.tool, externalContent: true })), durationMs: Date.now() - started };
    }
    if (request.tool === "http_request") return { ...(await httpRequest(request)), durationMs: Date.now() - started };
    if (!request.url) throw new Error("url is required");
    const source = await webFetch(request.url, request.timeoutMs);
    return { ok: source.status >= 200 && source.status < 400, tool: request.tool, sources: [source], durationMs: Date.now() - started, status: source.status };
  } catch (error) {
    return { ok: false, tool: request.tool, sources: [], error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
  }
}
