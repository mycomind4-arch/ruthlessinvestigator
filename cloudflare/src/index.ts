import { getSandbox, proxyToSandbox, type Sandbox } from "@cloudflare/sandbox";

export { Sandbox };

type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  COMPUTER_API_TOKEN: string;
};

function workspaceId(investigationId: string, agentId: string): string {
  return `${investigationId}-${agentId}`.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function authorized(request: Request, env: Env): boolean {
  const expected = env.COMPUTER_API_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get("authorization");
  return provided === `Bearer ${expected}`;
}

function validPath(path: string): boolean {
  return path.startsWith("/workspace/") || path === "/workspace";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The SDK proxy is intentionally left available for Cloudflare's own
    // sandbox tooling. Ruthless Investigator's control endpoints below are
    // separately authenticated.
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "ruthless-investigator-computer", backend: "CLOUDFLARE_SANDBOX" });
    }

    const proxied = await proxyToSandbox(request, env);
    if (proxied) return proxied;

    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "computer" || parts.length < 3) {
      return json({ error: "Expected /computer/:investigationId/:agentId/..." }, 404);
    }

    const investigationId = parts[1];
    const agentId = parts[2];
    const sandbox = getSandbox(env.Sandbox, workspaceId(investigationId, agentId));

    if (request.method === "POST" && parts[3] === "exec") {
      const body = await request.json() as { command?: string; cwd?: string; timeoutMs?: number };
      if (!body.command) return json({ error: "command is required" }, 400);
      if (body.cwd && !validPath(body.cwd)) return json({ error: "cwd must remain inside /workspace" }, 400);
      const timeout = Math.min(Math.max(body.timeoutMs ?? 30000, 1000), 120000);
      const result = await sandbox.exec(body.command, { cwd: body.cwd ?? "/workspace", timeout });
      return json({ ok: result.success, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
    }

    if (request.method === "GET" && parts[3] === "file") {
      const path = url.searchParams.get("path") ?? "/workspace";
      if (!validPath(path)) return json({ error: "path must remain inside /workspace" }, 400);
      const result = await sandbox.readFile(path);
      return json({ ok: true, path, content: result.content });
    }

    if (request.method === "POST" && parts[3] === "file") {
      const body = await request.json() as { path?: string; content?: string };
      if (!body.path) return json({ error: "path is required" }, 400);
      if (!validPath(body.path)) return json({ error: "path must remain inside /workspace" }, 400);
      if ((body.content ?? "").length > 2_000_000) return json({ error: "file too large" }, 413);
      await sandbox.writeFile(body.path, body.content ?? "");
      return json({ ok: true, path: body.path });
    }

    if (request.method === "GET" && parts[3] === "list") {
      const path = url.searchParams.get("path") ?? "/workspace";
      if (!validPath(path)) return json({ error: "path must remain inside /workspace" }, 400);
      const result = await sandbox.listFiles(path);
      return json({ ok: true, path, entries: result });
    }

    return json({ error: "Unknown computer operation" }, 404);
  },
};
