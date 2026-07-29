// T-62 #67: Filter framework gate upstream console spam.
//
// Upstream `@hcengineering` (core/memdb + core/client buildModel + client-resources
// connection.js) in ra stderr hàng loạt `console.warn`/`console.error`/`console.log`
// không seam, break UI pi. Verified KHÔNG có seam inject logger trong upstream
// `connect()` (`api-client/lib/client.js:42-79` — chỉ nhận socketFactory +
// connectionTimeout). → Filter ở ranh giới pi-huly.
//
// Design:
// - `UpstreamConsoleFilter` class: install/restore `console.warn`/`.error`/`.log`.
//   Match argument đầu tiên (string) HOẶC structured log (object có field `message`)
//   qua danh sách pattern `RegExp[]`. Đếm per-pattern + total.
// - `runWithConsoleFilter(patterns, fn)`: wrap async block, install → run → restore
//   (try/finally LUÔN restore — KHÔNG leak override global dù block throw).
// - `DEFAULT_UPSTREAM_NOISE_PATTERNS`: pattern registry. T-62 ship pattern #67.
//   T-64 (blocked-by T-62) đăng ký thêm WS error + token leak pattern.
// - Module-level counter: expose qua pool `health()` → `/huly status` display.

/** Console method names được filter. */
type ConsoleMethod = "warn" | "error" | "log";

/** Console method override target — uniform fn signature (warn/error/log interchangeable). */
type ConsoleFn = (...args: unknown[]) => void;
const CONSOLE_METHODS: readonly ConsoleMethod[] = ["warn", "error", "log"];

/**
 * Đếm số dòng đã filter: total + per-pattern (key = pattern.source).
 * Module-level để pool `health()` aggregate cross filter instance.
 */
interface NoiseCounters {
  total: number;
  byPattern: Record<string, number>;
}

const moduleCounters: NoiseCounters = { total: 0, byPattern: {} };

/**
 * Reset module-level counters. Test-only — pool health KHÔNG reset runtime
 * (counter accumulate qua session lifetime để report cumulative).
 */
export function resetUpstreamNoiseCounters(): void {
  moduleCounters.total = 0;
  moduleCounters.byPattern = {};
}

/**
 * Read-only snapshot counters cho pool `health()` expose.
 * Return copy để caller KHÔNG mutate module state.
 */
export function getUpstreamNoiseCounters(): NoiseCounters {
  return {
    total: moduleCounters.total,
    byPattern: { ...moduleCounters.byPattern },
  };
}

/**
 * Trích first-arg string ra string match-able. Support 2 shape:
 * - first-arg là string → return trực tiếp
 * - first-arg là object có field `message` string → return message (structured log)
 * - KHÁC (number/null/array/...) → return undefined (KHÔNG match — guard)
 */
function extractMessage(firstArg: unknown): string | undefined {
  if (typeof firstArg === "string") return firstArg;
  // Structured log: object có field `message` string. KHÔNG match Error instance
  // (Error.message là real error — filter che là sai). Upstream warn dùng plain
  // object {message: "..."} không phải Error throw.
  if (
    typeof firstArg === "object" &&
    firstArg !== null &&
    !Array.isArray(firstArg) &&
    !(firstArg instanceof Error) &&
    "message" in firstArg &&
    typeof firstArg.message === "string"
  ) {
    return firstArg.message;
  }
  return undefined;
}

/**
 * UpstreamConsoleFilter — install/restore console.warn/error/log override.
 *
 * Match first-arg string qua `RegExp[]`. Match → swallow (KHÔNG delegate ra
 * original method) + counter +1 (per-pattern + total). Miss → delegate original
 * (log vẫn ra như cũ).
 */
export class UpstreamConsoleFilter {
  private readonly patterns: RegExp[];
  private installed = false;
  private readonly originals: Partial<Record<ConsoleMethod, ConsoleFn>> = {};

  constructor(patterns: RegExp[]) {
    this.patterns = patterns;
  }

  /** Install override cho console.warn/error/log. Idempotent (install 2 lần no-op). */
  install(): void {
    if (this.installed) return;
    this.installed = true;
    for (const method of CONSOLE_METHODS) {
      this.originals[method] = console[method];
      // Arrow function giữ `this` + closure pattern. Bind original qua closure
      // (KHÔNG dùng .bind — giữ call site debug stack chính xác).
      const original = this.originals[method]!;
      const patterns = this.patterns;
      console[method] = (...args: unknown[]) => {
        const msg = extractMessage(args[0]);
        if (msg !== undefined) {
          // First-match-wins: chỉ pattern đầu (theo order trong mảng) match được
          // count — tránh double-count khi nhiều pattern cùng match 1 message.
          const matched = patterns.find((p) => p.test(msg));
          if (matched !== undefined) {
            // Filter: swallow + counter +1
            moduleCounters.total += 1;
            const key = matched.toString();
            moduleCounters.byPattern[key] = (moduleCounters.byPattern[key] ?? 0) + 1;
            return;
          }
        }
        // KHÔNG match → delegate original (log ra như cũ)
        original.apply(console, args);
      };
    }
  }

  /** Restore original console.warn/error/log. Idempotent (restore 2 lần no-op). */
  restore(): void {
    if (!this.installed) return;
    this.installed = false;
    for (const method of CONSOLE_METHODS) {
      const original = this.originals[method];
      if (original !== undefined) {
        console[method] = original;
        delete this.originals[method];
      }
    }
  }
}

/**
 * Wrap async block với console filter active. Install → run → restore (try/finally
 * LUÔN restore — KHÔNG leak override global dù block throw).
 *
 * **Scope hạn chế**: chỉ cover connect-time spam (cache-miss replay khi buildModel).
 * WS error post-connect (wsocket.onerror async callback) KHÔNG cover — dùng
 * `installGlobalConsoleFilter()` cho connection lifetime.
 *
 * @param patterns RegExp[] match first-arg string (hoặc object.message)
 * @param fn async block (vd quanh connect() / warmPool)
 * @returns giá trị fn trả về
 */
export async function runWithConsoleFilter<T>(
  patterns: RegExp[],
  fn: () => Promise<T>,
): Promise<T> {
  const filter = new UpstreamConsoleFilter(patterns);
  filter.install();
  try {
    return await fn();
  } finally {
    filter.restore();
  }
}

/**
 * T-64 #69: Global console filter — install 1 lần, active toàn session lifetime
 * (KHÔNG restore). Cần thiết vì WS error (`wsocket.onerror` async callback trong
 * `client-resources/lib/connection.js:554`) fires **post-connect** — `runWithConsoleFilter`
 * chỉ cover connect-time, restore `console.error` trước khi WS error thật sự fire.
 *
 * Token leak (URL `_transactor/<token>`) chỉ gate được nếu filter active khi WS
 * error fire (bất kỳ lúc nào post-connect: reconnect, server down, network blip).
 *
 * Install idempotent — gọi 2 lần no-op (return false nếu đã active).
 *
 * @param patterns RegExp[] match first-arg string (hoặc object.message)
 * @returns true nếu install mới, false nếu đã active (no-op)
 */
let globalFilterInstalled = false;
let globalFilter: UpstreamConsoleFilter | null = null;

export function installGlobalConsoleFilter(patterns: RegExp[]): boolean {
  if (globalFilterInstalled) return false;
  globalFilter = new UpstreamConsoleFilter(patterns);
  globalFilter.install();
  globalFilterInstalled = true;
  return true;
}

/**
 * Restore global filter (test-only — production KHÔNG gọi, filter active toàn session).
 */
export function __resetGlobalFilterForTests(): void {
  if (globalFilter !== null) {
    globalFilter.restore();
    globalFilter = null;
  }
  globalFilterInstalled = false;
}

/**
 * Default upstream noise pattern registry.
 *
 * T-62 ship #67 (cache-miss warn). T-64 (#69) đăng ký thêm WS error spam +
 * token leak + 7 dòng spam khác trong `client-resources/lib/connection.js`.
 *
 * Pattern match FIRST-arg string (case-insensitive). KHÔNG match log khác
 * (vd pi-huly tool call log `[huly_list_issues] args: ...`) — guard test có sẵn.
 *
 * **KHÔNG filter Error instance** (dòng `console.error(new Error(...))` ở
 * connection.js:329 `unknown response id` + 488/496/510/518 decompress error):
 * Error.message là real error cần debug. Filter chỉ apply cho plain string /
 * structured log {message}. Decision documented CHANGELOG.
 */
export const DEFAULT_UPSTREAM_NOISE_PATTERNS: RegExp[] = [
  // #67 (T-62): cache-miss warn khi replay TxUpdateDoc/TxRemoveDoc/TxMixin cho
  // doc không có trong local model. Vô hại (doc đã expire/removed trên server).
  /^no document found, failed to apply model transaction/i,
  // #69 (T-64): WS error spam + token leak. Upstream connection.js:554 in ra
  // `client websocket error: <id> wss://.../_transactor/<token> <ws> <user>`
  // mỗi lần WS gặp error (reconnect backoff). URL chứa api-token → NFR-04
  // violation nếu log ra stderr/UI. Filter swallow toàn bộ (KHÔNG redact).
  /^client websocket error/i,
  // #69 (T-64): 6 dòng spam khác trong connection.js — session info, ping,
  // version, upgrade, perf warning. Vô hại, break UI pi.
  /^Generate new SessionId/i,
  /^no ping response from server/i,
  /^Connected to server/i,
  /^Processing upgrade/i,
  /^measure slow findAll/i,
];
