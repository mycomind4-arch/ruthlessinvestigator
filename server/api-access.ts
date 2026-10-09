import { timingSafeEqual } from "node:crypto";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function assertSafeInvestigationBind(host: string, token?: string): void {
  if (!LOOPBACK_HOSTS.has(host.toLowerCase()) && (!token || token.length < 32)) {
    throw new Error("Non-loopback investigation API binding requires a RUTHLESS_API_TOKEN of at least 32 characters.");
  }
}

export function isInvestigationRequestAuthorized(header: string | undefined, token?: string): boolean {
  if (!token) return true; // Only safe with loopback binding; startup validates this.
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(token, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
