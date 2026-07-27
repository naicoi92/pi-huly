import { describe, expect, it } from "vitest";

import {
  AuthError,
  ConflictError,
  ConnectionError,
  ExternalError,
  HulyError,
  InternalError,
  NotFoundError,
  ValidationError,
  mapError,
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

  it("7 subclasses each set correct class", () => {
    expect(new AuthError("x").class).toBe("Auth");
    expect(new ConnectionError("x").class).toBe("Connection");
    expect(new NotFoundError("x").class).toBe("NotFound");
    expect(new ConflictError("x").class).toBe("Conflict");
    expect(new ValidationError("x").class).toBe("Validation");
    expect(new InternalError("x").class).toBe("Internal");
    expect(new ExternalError("x").class).toBe("External");
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

  it("generic plain Error → InternalError", () => {
    const err = mapError(new Error("something unexpected"));
    expect(err).toBeInstanceOf(InternalError);
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

  it("strips stack frames from message", () => {
    const err = new InternalError("fail at /path/file.js:123:45");
    const result = toToolResult(err);
    // Stack frame pattern replaced (file path + line:line)
    expect(result.content[0].text).not.toMatch(/at\s+.+:\d+:\d+/);
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
