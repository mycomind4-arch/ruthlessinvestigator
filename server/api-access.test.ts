import { describe, expect, it } from "vitest";
import { assertSafeInvestigationBind, isInvestigationRequestAuthorized } from "./api-access.js";

describe("Ruthless Investigator API security", () => {
  it("defaults to loopback without a token", () => {
    expect(() => assertSafeInvestigationBind("127.0.0.1")).not.toThrow();
    expect(() => assertSafeInvestigationBind("::1")).not.toThrow();
  });
  it("rejects public binds without a long secret", () => {
    expect(() => assertSafeInvestigationBind("0.0.0.0")).toThrow(/requires/);
    expect(() => assertSafeInvestigationBind("0.0.0.0", "short")).toThrow(/requires/);
    expect(() => assertSafeInvestigationBind("0.0.0.0", "x".repeat(40))).not.toThrow();
  });
  it("requires exact bearer token when configured", () => {
    const token = "secure-token-".repeat(4);
    expect(isInvestigationRequestAuthorized(undefined, token)).toBe(false);
    expect(isInvestigationRequestAuthorized("Bearer wrong", token)).toBe(false);
    expect(isInvestigationRequestAuthorized("Bearer " + token, token)).toBe(true);
  });
});
