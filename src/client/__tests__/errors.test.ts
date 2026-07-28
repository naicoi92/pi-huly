import { describe, expect, it } from "vitest";

import {
  AuthError,
  ConflictError,
  ConnectionError,
  ExternalError,
  HulyError,
  InternalError,
  NotFoundError,
  UnavailableError,
  ValidationError,
  mapError,
  matchDomainNotFound,
  toToolResult,
} from "../errors.js";

/** Mock PlatformError shape (matches @hcengineering/platform PlatformError). */
class MockPlatformError extends Error {
  readonly status: {
    severity: string;
    code: string;
    params: Record<string, unknown>;
  };
  constructor(code: string, params: Record<string, unknown> = {}, severity = "ERROR") {
    super(`${severity}: ${code} ${JSON.stringify(params)}`);
    this.name = "PlatformError";
    this.status = { severity, code, params };
  }
}

describe("HulyError class hierarchy", () => {
  it("HulyError has class + message + name", () => {
    const err = new HulyError("Internal", "something broke");
    expect(err.class).toBe("Internal");
    expect(err.message).toBe("something broke");
    expect(err.name).toBe("InternalError");
    expect(err).toBeInstanceOf(Error);
  });

  it("8 subclasses each set correct class", () => {
    expect(new AuthError("x").class).toBe("Auth");
    expect(new ConnectionError("x").class).toBe("Connection");
    expect(new NotFoundError("x").class).toBe("NotFound");
    expect(new ConflictError("x").class).toBe("Conflict");
    expect(new ValidationError("x").class).toBe("Validation");
    expect(new InternalError("x").class).toBe("Internal");
    expect(new ExternalError("x").class).toBe("External");
    // T-57: Unavailable = class ref sai runtime (domain not found).
    expect(new UnavailableError("x").class).toBe("Unavailable");
    expect(new UnavailableError("x").name).toBe("UnavailableError");
  });

  it("UnavailableError preserves hulyClass for context", () => {
    const err = new UnavailableError("msg", undefined, "tracker:class:Document");
    expect(err.hulyClass).toBe("tracker:class:Document");
  });

  it("UnavailableError hulyClass optional (undefined)", () => {
    const err = new UnavailableError("msg");
    expect(err.hulyClass).toBeUndefined();
  });

  it("preserves cause when provided", () => {
    const cause = new Error("root cause");
    const err = new InternalError("wrapper", cause);
    expect(err.cause).toBe(cause);
  });

  it("cause undefined when not provided", () => {
    const err = new InternalError("no cause");
    expect(err.cause).toBeUndefined();
  });
});

describe("mapError — PlatformError classification", () => {
  it("Unauthorized → AuthError", () => {
    const err = mapError(new MockPlatformError("platform:status:Unauthorized"));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain("Unauthorized");
  });

  it("TokenExpired → AuthError", () => {
    const err = mapError(new MockPlatformError("platform:status:TokenExpired"));
    expect(err).toBeInstanceOf(AuthError);
  });

  it("WorkspaceNotFound → AuthError with /huly init hint", () => {
    const err = mapError(new MockPlatformError("platform:status:WorkspaceNotFound"));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain("/huly init");
  });

  it("PasswordLoginLocked → AuthError with lock hint", () => {
    const err = mapError(new MockPlatformError("platform:status:PasswordLoginLocked"));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain("locked");
  });

  it("ConnectionClosed → ConnectionError", () => {
    const err = mapError(new MockPlatformError("platform:status:ConnectionClosed"));
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it("Conflict → ConflictError", () => {
    const err = mapError(new MockPlatformError("platform:status:Conflict"));
    expect(err).toBeInstanceOf(ConflictError);
  });

  it("BadRequest → ValidationError", () => {
    const err = mapError(new MockPlatformError("platform:status:BadRequest"));
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("PersonNotFound → NotFoundError", () => {
    const err = mapError(
      new MockPlatformError("platform:status:PersonNotFound", { person: "abc" }),
    );
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("UnknownError → InternalError", () => {
    const err = mapError(new MockPlatformError("platform:status:UnknownError"));
    expect(err).toBeInstanceOf(InternalError);
  });

  it("unknown status.code → InternalError fallback", () => {
    const err = mapError(new MockPlatformError("platform:status:SomeNewCode"));
    expect(err).toBeInstanceOf(InternalError);
    expect(err.message).toContain("SomeNewCode");
  });
});

describe("mapError — network errors (plain Error)", () => {
  it("ECONNREFUSED in message → ConnectionError", () => {
    const err = mapError(new Error("connect ECONNREFUSED 127.0.0.1:8080"));
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toContain("ECONNREFUSED");
  });

  it("'fetch failed' → ConnectionError", () => {
    const err = mapError(new TypeError("fetch failed"));
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it("WebSocket abnormal closure → ConnectionError", () => {
    const err = mapError(new Error("WebSocket abnormal closure (code 1006)"));
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it("ETIMEDOUT in name → ConnectionError", () => {
    const netErr = new Error("timeout");
    netErr.name = "ETIMEDOUT";
    const err = mapError(netErr);
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it("'Workspace foo not found' → AuthError (/huly init)", () => {
    const err = mapError(new Error("Workspace foo not found"));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain("/huly init");
  });

  it("generic plain Error → InternalError (includes e.message for ops debug)", () => {
    const err = mapError(new Error("something unexpected"));
    expect(err).toBeInstanceOf(InternalError);
    expect(err.message).toContain("something unexpected");
  });
});

// T-57 #61: "domain not found: <class>" → UnavailableError (class ref sai runtime).
// Pattern xuất hiện cả trong PlatformError UnknownError (server-side) lẫn plain
// Error (api-client raw). Phải map honest, KHÔNG generic InternalError.
describe("mapError — domain not found → UnavailableError (T-57)", () => {
  it("matchDomainNotFound extracts class ref", () => {
    expect(matchDomainNotFound("domain not found: tracker:class:Document")).toBe(
      "tracker:class:Document",
    );
    expect(matchDomainNotFound("Error: domain not found: core:class:TsRelation")).toBe(
      "core:class:TsRelation",
    );
  });

  it("matchDomainNotFound returns null khi không match", () => {
    expect(matchDomainNotFound("some other error")).toBeNull();
    expect(matchDomainNotFound("")).toBeNull();
  });

  it("plain Error 'domain not found: tracker:class:Document' → UnavailableError", () => {
    const err = mapError(new Error("domain not found: tracker:class:Document"));
    expect(err).toBeInstanceOf(UnavailableError);
    expect(err.class).toBe("Unavailable");
    expect(err.message).toContain("tracker:class:Document");
    // Honest message: list possible causes để user/LLM debug
    expect(err.message).toContain("package");
    expect(err.message).toContain("report bug");
  });

  it("plain Error 'domain not found: core:class:TsRelation' → UnavailableError", () => {
    const err = mapError(new Error("domain not found: core:class:TsRelation"));
    expect(err).toBeInstanceOf(UnavailableError);
    expect((err as UnavailableError).hulyClass).toBe("core:class:TsRelation");
  });

  it("PlatformError UnknownError wrapping 'domain not found' → UnavailableError (upgrade)", () => {
    // Huly server throw UnknownError khi class sai (vd createDoc) — message
    // thường chứa "domain not found: <class>". Phải upgrade sang Unavailable.
    const platformErr = Object.assign(new Error("domain not found: tracker:class:Document"), {
      status: { severity: "ERROR", code: "platform:status:UnknownError", params: {} },
    });
    const err = mapError(platformErr);
    expect(err).toBeInstanceOf(UnavailableError);
    expect(err.class).toBe("Unavailable");
    expect((err as UnavailableError).hulyClass).toBe("tracker:class:Document");
  });

  it("PlatformError UnknownError KHÔNG chứa 'domain not found' → vẫn InternalError (no upgrade)", () => {
    // Regression guard: chỉ upgrade khi message có pattern, tránh over-eager.
    const err = mapError(new MockPlatformError("platform:status:UnknownError"));
    expect(err).toBeInstanceOf(InternalError);
    expect(err).not.toBeInstanceOf(UnavailableError);
  });

  it("HulyError passthrough khi đã là UnavailableError", () => {
    const original = new UnavailableError("already unavailable");
    const err = mapError(original);
    expect(err).toBe(original);
  });

  it("ExternalError unwrap → UnavailableError nếu cause match domain not found", () => {
    const root = new Error("domain not found: view:class:Label");
    const wrapped = new ExternalError("api-client threw", root);
    const err = mapError(wrapped);
    expect(err).toBeInstanceOf(UnavailableError);
    expect((err as UnavailableError).hulyClass).toBe("view:class:Label");
  });

  it("case-insensitive 'Domain Not Found' match", () => {
    const err = mapError(new Error("Domain Not Found: tracker:class:Document"));
    expect(err).toBeInstanceOf(UnavailableError);
  });
});

describe("mapError — edge cases", () => {
  it("HulyError passthrough (already classified)", () => {
    const original = new AuthError("already auth error");
    const err = mapError(original);
    expect(err).toBe(original);
  });

  it("ExternalError unwraps cause recursively", () => {
    const root = new MockPlatformError("platform:status:Unauthorized");
    const wrapped = new ExternalError("api-client threw", root);
    const err = mapError(wrapped);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain("Unauthorized");
  });

  it("ExternalError with plain Error cause", () => {
    const root = new Error("connect ECONNREFUSED");
    const wrapped = new ExternalError("wrapped", root);
    const err = mapError(wrapped);
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it("string thrown → InternalError", () => {
    const err = mapError("just a string");
    expect(err).toBeInstanceOf(InternalError);
    expect(err.message).toContain("just a string");
  });

  it("null → InternalError", () => {
    const err = mapError(null);
    expect(err).toBeInstanceOf(InternalError);
  });

  it("object → InternalError", () => {
    const err = mapError({ foo: "bar" });
    expect(err).toBeInstanceOf(InternalError);
    expect(err.message).toContain("foo");
  });
});

describe("toToolResult — no-leak (NFR-04)", () => {
  it("returns { content, isError: true } shape", () => {
    const err = new AuthError("auth failed");
    const result = toToolResult(err);
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });

  it("includes error class + sanitized message", () => {
    const err = new AuthError("token expired");
    const result = toToolResult(err);
    expect(result.content[0].text).toContain("[AuthError]");
    expect(result.content[0].text).toContain("token expired");
  });

  it("strips token from message", () => {
    const err = new AuthError("Auth failed with token=abc123def456ghi789jkl012mno345pqr789");
    const result = toToolResult(err);
    expect(result.content[0].text).not.toContain("abc123def456ghi789jkl012mno345pqr789");
    expect(result.content[0].text).toContain("[REDACTED]");
  });

  it("strips password from message", () => {
    const err = new AuthError('password="supersecret123" rejected');
    const result = toToolResult(err);
    expect(result.content[0].text).not.toContain("supersecret123");
  });

  it("strips GitHub PAT", () => {
    const pat = "ghp_" + "A".repeat(36);
    const err = new InternalError(`auth using ${pat} failed`);
    const result = toToolResult(err);
    expect(result.content[0].text).not.toContain(pat);
  });

  it("strips stack frames from message (bare path form)", () => {
    const err = new InternalError("fail at /path/file.js:123:45");
    const result = toToolResult(err);
    // Stack frame pattern replaced (file path + line:line)
    expect(result.content[0].text).not.toMatch(/at\s+.+:\d+:\d+/);
  });

  it("strips V8-format stack frames (at fn (file.js:line:col))", () => {
    const err = new InternalError(
      "TypeError: x\n    at foo (/path/file.js:10:5)\n    at bar (/app/index.js:42:13)",
    );
    const result = toToolResult(err);
    expect(result.content[0].text).not.toMatch(/at\s+.*?:\d+:\d+/);
  });

  it("handles all 7 error classes", () => {
    const errors = [
      new AuthError("auth"),
      new ConnectionError("conn"),
      new NotFoundError("nf"),
      new ConflictError("conflict"),
      new ValidationError("valid"),
      new InternalError("internal"),
      new ExternalError("external"),
    ];
    for (const e of errors) {
      const result = toToolResult(e);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(`[${e.class}Error]`);
    }
  });
});

describe("integration: full mapError → toToolResult flow", () => {
  it("PlatformError Unauthorized → safe tool result", () => {
    const err = mapError(new MockPlatformError("platform:status:Unauthorized"));
    const result = toToolResult(err);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("[AuthError]");
    expect(result.content[0].text).toContain("Unauthorized");
  });

  it("ExternalError wrap network → safe ConnectionError result", () => {
    const root = new Error("connect ECONNREFUSED 1.2.3.4:80");
    const wrapped = new ExternalError("client threw", root);
    const result = toToolResult(mapError(wrapped));
    expect(result.content[0].text).toContain("[ConnectionError]");
  });

  it("full flow produces no token leak (grep = 0)", () => {
    const err = mapError(
      new MockPlatformError("platform:status:Unauthorized", { token: "ghp_secret123" }),
    );
    const result = toToolResult(err);
    const output = JSON.stringify(result);
    expect(output).not.toMatch(/ghp_[A-Za-z0-9]{20,}/);
  });
});
