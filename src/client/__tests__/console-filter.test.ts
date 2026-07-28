import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T-62 #67: regression test cho filter framework gate upstream console spam.
// Pattern: match first-arg string qua RegExp[] (hoặc structured log có field
// `message`), đếm per-pattern + total, restore console method trong try/finally.

import {
  DEFAULT_UPSTREAM_NOISE_PATTERNS,
  getUpstreamNoiseCounters,
  resetUpstreamNoiseCounters,
  runWithConsoleFilter,
  UpstreamConsoleFilter,
} from "../console-filter.js";

// Spy stderr thật — console.warn/error/log gốc của Node delegate ra process.stderr.
// Test KHÔNG override toàn局 process — chỉ verify filter override được install/
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
  // Safety net:KHÔNG bao giờ leak override ra test khác.
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
    expect(filter.getCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("match first-arg case-insensitive", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^NO DOCUMENT FOUND/i]);
    filter.install();
    console.warn("No Document Found, failed to apply model transaction");
    filter.restore();
    expect(spy).not.toHaveBeenCalled();
    expect(filter.getCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("structured log (object có field message) → match qua message", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    console.warn({ message: "no document found, skipping", _class: "core:class:Issue" });
    filter.restore();
    expect(spy).not.toHaveBeenCalled();
    expect(filter.getCounters().total).toBe(1);
    spy.mockRestore();
  });

  it("structured log KHÔNG có message field → KHÔNG filter (KHÔNG break object log)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filter = new UpstreamConsoleFilter([/^no document found/i]);
    filter.install();
    console.warn({ _class: "core:class:Issue", unrelated: true });
    filter.restore();
    expect(spy).toHaveBeenCalled();
    expect(filter.getCounters().total).toBe(0);
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
    expect(filter.getCounters().total).toBe(0);
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
    const c = filter.getCounters();
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
