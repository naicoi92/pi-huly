import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T-62 #67: regression test cho filter framework gate upstream console spam.
// Pattern: match first-arg string qua RegExp[] (hoặc structured log có field
// `message`), đếm per-pattern + total, restore console method trong try/finally.

import {
  DEFAULT_UPSTREAM_NOISE_PATTERNS,
  getUpstreamNoiseCounters,
  installGlobalConsoleFilter,
  __resetGlobalFilterForTests,
  resetUpstreamNoiseCounters,
  runWithConsoleFilter,
  UpstreamConsoleFilter,
} from "../console-filter.js";

// Spy stderr thật — console.warn/error/log gốc của Node delegate ra process.stderr.
// Test KHÔNG override toàn bộ process — chỉ verify filter override được install/
// restore đúng (KHÔNG leak global). Capture gốc qua spy trước khi filter chạy.
const originalWarn = console.warn;
const originalError = console.error;
const originalLog = console.log;

beforeEach(() => {
  // Restore gốc mỗi test (test trước có thể quên restore qua throw).
  console.warn = originalWarn;
  console.error = originalError;
  console.log = originalLog;
  resetUpstreamNoiseCounters();
});

afterEach(() => {
  // Safety net: KHÔNG bao giờ leak override ra test khác.
  console.warn = originalWarn;
  console.error = originalError;
  console.log = originalLog;
});

describe("UpstreamConsoleFilter — install/restore", () => {
  it("install() override console.warn/error/log, restore() trả về gốc", () => {
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    expect(console.warn).not.toBe(originalWarn);
    expect(console.error).not.toBe(originalError);
    expect(console.log).not.toBe(originalLog);
    filter.restore();
    expect(console.warn).toBe(originalWarn);
    expect(console.error).toBe(originalError);
    expect(console.log).toBe(originalLog);
  });

  it("restore() idempotent — gọi 2 lần không throw", () => {
    const filter = new UpstreamConsoleFilter([/^x/i]);
    filter.install();
    filter.restore();
    expect(() => filter.restore()).not.toThrow();
  });

  it("install() KHÔNG lọc log không match pattern (guard first-arg miss)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    console.warn("real error from my code");
    filter.restore();
    expect(spy).toHaveBeenCalledWith("real error from my code");
    spy.mockRestore();
  });
});

describe("UpstreamConsoleFilter — pattern match", () => {
  it("match first-arg string → KHÔNG delegate ra console gốc, counter +1", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    console.warn("no document found, failed to apply model transaction, skipping", { extra: 1 });
    filter.restore();
    // Pattern match → KHÔNG gọi delegate (spy gốc KHÔNG được invoke với message).
    expect(spy).not.toHaveBeenCalled();
    expect(getUpstreamNoiseCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("match first-arg case-insensitive", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^NO DOCUMENT FOUND/i]);
    filter.install();
    console.warn("No Document Found, failed to apply model transaction");
    filter.restore();
    expect(spy).not.toHaveBeenCalled();
    expect(getUpstreamNoiseCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("structured log (object có field message) → match qua message", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    console.warn({ message: "no document found, skipping", _class: "core:class:Issue" });
    filter.restore();
    expect(spy).not.toHaveBeenCalled();
    expect(getUpstreamNoiseCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("structured log KHÔNG có message field → KHÔNG filter (KHÔNG break object log)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    console.warn({ _class: "core:class:Issue", unrelated: true });
    filter.restore();
    expect(spy).toHaveBeenCalled();
    expect(getUpstreamNoiseCounters().total).toBe(0);
    spy.mockRestore();
  });

  it("first-arg KHÔNG phải string HOẶC object có message → KHÔNG filter", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    console.error(42); // number — KHÔNG match
    console.error(null); // null — KHÔNG match
    filter.restore();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(getUpstreamNoiseCounters().total).toBe(0);
    spy.mockRestore();
  });

  it("Error instance KHÔNG filter — Error.message là real error (n1 guard)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    // Error có field message match pattern NHƯNG đây là real error throw —
    // KHÔNG filter (che = sai, user cần debug).
    console.error(new Error("no document found, failed to apply model transaction"));
    filter.restore();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getUpstreamNoiseCounters().total).toBe(0);
    spy.mockRestore();
  });

  it("per-pattern counter + total", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i, /^measure slow findAll/i]);
    filter.install();
    console.warn("no document found, skipping");
    console.warn("no document found, skipping again");
    console.warn("measure slow findAll took 5000ms");
    filter.restore();
    const c = getUpstreamNoiseCounters();
    expect(c.total).toBe(3);
    expect(c.byPattern["/^no document found/i"]).toBe(2);
    expect(c.byPattern["/^measure slow findAll/i"]).toBe(1);
    spy.mockRestore();
  });
});

describe("runWithConsoleFilter — try/finally restore", () => {
  it("wrap async block: install → run → restore", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Capture reference SAU spy (spy wrap original). Filter install/restore phải
    // tôn trọng trạng thái hiện tại — KHÔNG leak override ra ngoài scope.
    const preInstall = console.warn;
    await runWithConsoleFilter([/^no document found/i], async () => {
      // Trong scope: console.warn đã override
      expect(console.warn).not.toBe(preInstall);
      console.warn("no document found, skipping");
      return "ok";
    });
    // Sau scope: restore về trạng thái pre-install (= spy)
    expect(console.warn).toBe(preInstall);
    expect(spy).not.toHaveBeenCalled();
    expect(getUpstreamNoiseCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("block throw vẫn restore original console method (KHÔNG leak override)", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const preInstall = console.warn;
    await expect(
      runWithConsoleFilter([/^no document found/i], async () => {
        console.warn("no document found, skipping");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Quan trọng: override KHÔNG leak dù block throw — restore về pre-install (= spy)
    expect(console.warn).toBe(preInstall);
    expect(getUpstreamNoiseCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("trả về giá trị block trả về", async () => {
    const result = await runWithConsoleFilter([], async () => 42);
    expect(result).toBe(42);
  });

  it("KHÔNG filter log không match trong scope", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runWithConsoleFilter([/^no document found/i], async () => {
      console.warn("real error"); // KHÔNG match
    });
    expect(spy).toHaveBeenCalledWith("real error");
    spy.mockRestore();
  });
});

describe("DEFAULT_UPSTREAM_NOISE_PATTERNS", () => {
  it("chứa pattern #67 'no document found, failed to apply model transaction'", () => {
    const match = DEFAULT_UPSTREAM_NOISE_PATTERNS.some((p) =>
      p.test("no document found, failed to apply model transaction, skipping"),
    );
    expect(match).toBe(true);
  });

  it("KHÔNG match log thật của pi-huly (vd tool call log T-56)", () => {
    for (const p of DEFAULT_UPSTREAM_NOISE_PATTERNS) {
      expect(p.test("[huly_list_issues] args: {}")).toBe(false);
    }
  });

  // T-64 #69: WS error spam + token leak pattern.
  it("T-64: chứa pattern 'client websocket error' (URL + token leak)", () => {
    const match = DEFAULT_UPSTREAM_NOISE_PATTERNS.some((p) =>
      p.test("client websocket error: 1 wss://huly.io/_transactor/TOKEN-LEAK ws user"),
    );
    expect(match).toBe(true);
  });

  it("T-64: chứa 5 pattern spam khác trong connection.js (string-arg)", () => {
    // 6 pattern string-arg total: 1 WS error + 5 spam. KHÔNG filter Error
    // instance (unknown response id :329 + decompress err :488/496/510/518).
    const spamMessages = [
      "Generate new SessionId abc-123",
      "no ping response from server. Closing socket. id1 ws user",
      "Connected to server: 0.7.423",
      "Processing upgrade ws user",
      "measure slow findAll 1500 800 100",
    ];
    for (const msg of spamMessages) {
      const match = DEFAULT_UPSTREAM_NOISE_PATTERNS.some((p) => p.test(msg));
      expect(match).toBe(true);
    }
  });
});

// T-64 #69: security guard — token leak prevention.
// Filter KHÔNG chỉ đếm đúng mà còn assert stderr captured KHÔNG chứa token.
describe("T-64 token leak security guard", () => {
  it("WS error với URL _transactor/<token> → KHÔNG log ra, token KHÔNG leak stderr", async () => {
    const captured: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    const TEST_TOKEN = "super-secret-token-1234567890abcdef";
    await runWithConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS, async () => {
      // Giả lập upstream connection.js:554 — URL chứa token
      console.error(
        "client websocket error:",
        1,
        `wss://huly.io/_transactor/${TEST_TOKEN}`,
        "ws",
        "user",
      );
    });
    console.error = origError;
    // Filter swallow → captured rỗng (KHÔNG delegate ra origError)
    expect(captured).toHaveLength(0);
    // Security guard: stderr captured KHÔNG chứa token substring
    const allOutput = captured.join(" ");
    expect(allOutput).not.toContain(TEST_TOKEN);
    expect(allOutput).not.toContain("_transactor/");
    // Counter tăng → filter active
    expect(getUpstreamNoiseCounters().total).toBe(1);
  });

  it("WS error lặp lại (reconnect) → filter đếm đúng, KHÔNG spam", async () => {
    const captured: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      captured.push(String(args[0]));
    };
    await runWithConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS, async () => {
      // Giả lập WS error trigger 5 lần (reconnect backoff)
      for (let i = 0; i < 5; i++) {
        console.error("client websocket error:", i, "wss://h/_transactor/tok", "ws");
      }
    });
    console.error = origError;
    expect(captured).toHaveLength(0); // KHÔNG log ra
    expect(getUpstreamNoiseCounters().total).toBe(5); // counter +5
  });

  it("real error (KHÔNG match pattern) vẫn log ra — filter KHÔNG swallow tất cả", async () => {
    const captured: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      captured.push(String(args[0]));
    };
    await runWithConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS, async () => {
      console.error("AuthError: token expired"); // real error, KHÔNG match
    });
    console.error = origError;
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe("AuthError: token expired");
  });

  it("T-64: filter KHÔNG affect error throw pathway — throw trong scope vẫn propagate", async () => {
    // Filter chỉ override console.error METHOD. Error throw pathway (auth fail,
    // server down) vẫn reach LLM qua mapError() → toToolResult — KHÔNG qua
    // console.error. Verify: throw trong scope filter VẪN propagate ra ngoài.
    const origError = console.error;
    console.error = () => {}; // swallow để test chỉ check throw
    let threw = false;
    try {
      await runWithConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS, async () => {
        throw new Error("ConnectionError: Huly unreachable");
      });
    } catch (e) {
      threw = true;
      expect((e as Error).message).toBe("ConnectionError: Huly unreachable");
    }
    console.error = origError;
    expect(threw).toBe(true); // error throw VẪN propagate qua filter
  });
});

// T-64 #69 B1 fix: global filter active toàn session — WS error fires post-connect.
// runWithConsoleFilter chỉ cover connect-time (restore console.error trước khi
// wsocket.onerror async callback thật fire). Token leak chỉ gate được nếu filter
// active khi WS error fire bất kỳ lúc nào post-connect.
describe("T-64 B1 fix — installGlobalConsoleFilter (connection lifetime)", () => {
  beforeEach(() => {
    __resetGlobalFilterForTests();
    resetUpstreamNoiseCounters();
  });

  afterEach(() => {
    __resetGlobalFilterForTests();
  });

  it("installGlobalConsoleFilter active toàn session — WS error post-connect vẫn bị gate", async () => {
    // Spy install TRƯỚC global filter → filter delegate qua spy (capture downstream).
    // Match production: spy = real stderr writer, filter wrap ở giữa.
    const captured: string[] = [];
    const downstreamSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => captured.push(args.map(String).join(" ")));
    installGlobalConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS);
    // SAU install + async gap (giả lập post-connect timing) — filter vẫn active.
    await new Promise((r) => setTimeout(r, 10));
    const TEST_TOKEN = "post-connect-secret-token-9876543210";
    // Giả lập wsocket.onerror fires post-connect (KHÔNG trong scope runWithConsoleFilter).
    console.error("client websocket error:", 1, `wss://h/_transactor/${TEST_TOKEN}`, "ws");
    // Filter global active → swallow → downstream spy KHÔNG nhận.
    expect(captured).toHaveLength(0);
    expect(getUpstreamNoiseCounters().total).toBe(1);
    // Security guard: token KHÔNG leak downstream.
    expect(captured.join(" ")).not.toContain(TEST_TOKEN);
    expect(captured.join(" ")).not.toContain("_transactor/");
    downstreamSpy.mockRestore();
  });

  it("idempotent — install 2 lần no-op (return false lần 2)", () => {
    const first = installGlobalConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS);
    expect(first).toBe(true);
    const second = installGlobalConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS);
    expect(second).toBe(false);
  });

  it("WS error lặp nhiều lần post-connect (reconnect spam) → toàn bộ bị gate", async () => {
    const captured: string[] = [];
    const downstreamSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => captured.push(String(args[0])));
    installGlobalConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS);
    await new Promise((r) => setTimeout(r, 5));
    // Giả lập reconnect backoff — WS error fires 10 lần post-connect.
    for (let i = 0; i < 10; i++) {
      console.error("client websocket error:", i, "wss://h/_transactor/tok", "ws");
    }
    expect(captured).toHaveLength(0); // toàn bộ swallow
    expect(getUpstreamNoiseCounters().total).toBe(10);
    downstreamSpy.mockRestore();
  });

  it("real error post-connect (KHÔNG match pattern) vẫn log ra downstream", async () => {
    const captured: string[] = [];
    const downstreamSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => captured.push(String(args[0])));
    installGlobalConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS);
    await new Promise((r) => setTimeout(r, 5));
    console.error("AuthError: token expired"); // real error, KHÔNG match
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe("AuthError: token expired");
    downstreamSpy.mockRestore();
  });

  it("real Error instance post-connect vẫn log ra downstream (KHÔNG filter Error)", async () => {
    const captured: string[] = [];
    const downstreamSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => captured.push(String(args[0])));
    installGlobalConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS);
    await new Promise((r) => setTimeout(r, 5));
    // connection.js:329 unknown response id — Error instance, KHÔNG filter.
    console.error(new Error("unknown response id: 42 ws user"));
    expect(captured).toHaveLength(1);
    expect(getUpstreamNoiseCounters().total).toBe(0);
    downstreamSpy.mockRestore();
  });
});

describe("Module-level counter (pool health expose)", () => {
  it("getUpstreamNoiseCounters aggregate cross filter instance", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runWithConsoleFilter([/^no document found/i], async () => {
      console.warn("no document found, skipping");
    });
    await runWithConsoleFilter([/^no document found/i], async () => {
      console.warn("no document found, skipping again");
    });
    const c = getUpstreamNoiseCounters();
    expect(c.total).toBe(2);
    expect(c.byPattern["/^no document found/i"]).toBe(2);
    spy.mockRestore();
  });

  it("resetUpstreamNoiseCounters clear state", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runWithConsoleFilter([/^no document found/i], async () => {
      console.warn("no document found, skipping");
    });
    expect(getUpstreamNoiseCounters().total).toBe(1);
    resetUpstreamNoiseCounters();
    expect(getUpstreamNoiseCounters().total).toBe(0);
    expect(getUpstreamNoiseCounters().byPattern).toEqual({});
    spy.mockRestore();
  });
});
