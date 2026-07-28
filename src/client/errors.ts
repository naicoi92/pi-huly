// HulyError taxonomy — classify api-client/PlatformError + network errors.
// Design: 04-system.md §3 (taxonomy) + §6 (client/errors.ts contract), 08 §A (no-leak NFR-04).
//
// PlatformError (from @hcengineering/platform, re-exported via api-client) has shape:
//   class PlatformError extends Error { readonly status: { severity, code, params } }
// where `status.code` is a branded IntlString like 'platform:status:Unauthorized'.
//
// mapError uses DUCK-TYPING (no direct @hcengineering import) to avoid coupling:
//   - `e instanceof Error && 'status' in e` → treat as PlatformError, classify via status.code
//   - network patterns (ECONN*/fetch failed/WebSocket) → ConnectionError
//   - else → InternalError
//
// Security (08 §A): toToolResult strips token/password/stack — KHÔNG leak secrets.

/**
 * Error class identifier (04 §3 taxonomy, 8 classes).
 * T-57 #61: thêm "Unavailable" — class ref sai runtime (domain not found),
 * distinct khỏi NotFound (entity không tồn tại) và Internal (bug pi-huly).
 */
export type ErrorClass =
  | "Auth"
  | "Connection"
  | "NotFound"
  | "Conflict"
  | "Validation"
  | "Internal"
  | "External"
  | "Unavailable";

/** Base HulyError — all 7 subclasses extend this. */
export class HulyError extends Error {
  readonly class: ErrorClass;
  override readonly cause?: unknown;

  constructor(errorClass: ErrorClass, message: string, cause?: unknown) {
    super(message);
    this.name = `${errorClass}Error`;
    this.class = errorClass;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class AuthError extends HulyError {
  constructor(message: string, cause?: unknown) {
    super("Auth", message, cause);
  }
}

export class ConnectionError extends HulyError {
  constructor(message: string, cause?: unknown) {
    super("Connection", message, cause);
  }
}

export class NotFoundError extends HulyError {
  constructor(message: string, cause?: unknown) {
    super("NotFound", message, cause);
  }
}

export class ConflictError extends HulyError {
  constructor(message: string, cause?: unknown) {
    super("Conflict", message, cause);
  }
}

export class ValidationError extends HulyError {
  constructor(message: string, cause?: unknown) {
    super("Validation", message, cause);
  }
}

export class InternalError extends HulyError {
  constructor(message: string, cause?: unknown) {
    super("Internal", message, cause);
  }
}

export class ExternalError extends HulyError {
  constructor(message: string, cause?: unknown) {
    super("External", message, cause);
  }
}

/**
 * T-57 #61: Class ref sai runtime (domain not found) — distinct từ NotFound/
 * Internal. Khi Huly throw "domain not found: <class>", class đích KHÔNG tồn
 * tại trong workspace (package chưa enable HOẶC pi-huly dùng sai class ref).
 * Tool không chạy được → báo honest cho LLM thay vì generic InternalError.
 */
export class UnavailableError extends HulyError {
  /** Class ref bị reject (vd "tracker:class:Document"). */
  readonly hulyClass?: string;
  constructor(message: string, cause?: unknown, hulyClass?: string) {
    super("Unavailable", message, cause);
    if (hulyClass !== undefined) {
      this.hulyClass = hulyClass;
    }
  }
}

// PlatformError duck-type shape (matches @hcengineering/platform PlatformError).
type StatusLike = {
  severity: string;
  code: string | { _id?: string; default?: string } | object;
  params?: Record<string, unknown>;
};

type PlatformErrorLike = Error & {
  status?: StatusLike;
};

/** Extract string code from status.code (handles branded IntlString shape). */
function statusCode(code: StatusLike["code"]): string {
  if (typeof code === "string") return code;
  if (code && typeof code === "object") {
    const obj = code as { _id?: string; default?: string; key?: string; value?: string };
    return obj._id ?? obj.default ?? obj.key ?? obj.value ?? "";
  }
  return "";
}

/** Check if error looks like a PlatformError (duck-type, no instanceof). */
function isPlatformError(e: unknown): e is PlatformErrorLike {
  return e instanceof Error && "status" in e && typeof (e as PlatformErrorLike).status === "object";
}

/** Network error patterns (raw Error, NOT PlatformError). */
const NETWORK_PATTERNS = [
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /EHOSTUNREACH/i,
  /ENETUNREACH/i,
  /fetch\s*failed/i,
  /WebSocket/i,
  /abnormal\s*closure/i,
  /socket\s*hang\s*up/i,
  /network/i,
];

/** Classify PlatformError status.code → HulyError subclass. */
function classifyPlatformError(e: PlatformErrorLike): HulyError {
  const status = e.status!;
  const code = statusCode(status.code);
  const params = status.params ?? {};

  // Auth: Unauthorized, TokenExpired, TokenNotActive, PasswordExpired,
  //       WorkspaceNotFound, PasswordLoginLocked, InvalidPassword,
  //       AccountNotConfirmed, SocialIdNotConfirmed, Forbidden, ReadOnlyAccount
  if (
    code.includes("Unauthorized") ||
    code.includes("TokenExpired") ||
    code.includes("TokenNotActive") ||
    code.includes("PasswordExpired") ||
    code.includes("WorkspaceNotFound") ||
    code.includes("PasswordLoginLocked") ||
    code.includes("InvalidPassword") ||
    code.includes("AccountNotConfirmed") ||
    code.includes("SocialIdNotConfirmed") ||
    code.includes("Forbidden") ||
    code.includes("ReadOnlyAccount") ||
    code.includes("AccountNotFound") ||
    code.includes("AccountMismatch")
  ) {
    const hint = code.includes("WorkspaceNotFound")
      ? " Run /huly init to bind."
      : code.includes("PasswordLoginLocked")
        ? " Account locked — try again later or re-init."
        : "";
    return new AuthError(`Auth failed: ${code}${hint}`, e);
  }

  // Connection: ConnectionClosed, MaintenanceWarning, WorkspaceMigration, WorkspaceRateLimit
  if (
    code.includes("ConnectionClosed") ||
    code.includes("Maintenance") ||
    code.includes("Migration") ||
    code.includes("RateLimit")
  ) {
    return new ConnectionError(`Huly connection issue: ${code}`, e);
  }

  // Conflict: Conflict, AlreadyExists, AccountAlreadyExists, WorkspaceAlreadyExists
  if (
    code.includes("Conflict") ||
    code.includes("AlreadyExists") ||
    code.includes("IntegrationExists") ||
    code.includes("SecretAlreadyExists")
  ) {
    return new ConflictError(`Conflict: ${code}`, e);
  }

  // Validation: BadRequest, InvalidId, ExpiredLink, SocialIdAlreadyConfirmed
  if (
    code.includes("BadRequest") ||
    code.includes("InvalidId") ||
    code.includes("ExpiredLink") ||
    code.includes("AlreadyConfirmed")
  ) {
    return new ValidationError(`Validation: ${code}`, e);
  }

  // NotFound: PersonNotFound, InviteNotFound, SecretNotFound, NotFound
  if (
    code.includes("PersonNotFound") ||
    code.includes("InviteNotFound") ||
    code.includes("SecretNotFound") ||
    /(^|[:.])NotFound$/.test(code)
  ) {
    const id = typeof params.id === "string" ? `: ${params.id}` : "";
    return new NotFoundError(`Not found: ${code}${id}`, e);
  }

  // Internal (fallback): BadError, UnknownError, InternalServerError, UnknownMethod, MailboxError
  return new InternalError(`Internal: ${code}`, e);
}

/**
 * T-57 #61: Detect "domain not found: <class>" pattern trong error message.
 * Huly throw pattern này khi class ref KHÔNG tồn tại runtime (package chưa
 * enable HOẶC pi-huly dùng sai class ref). Match cả 2 dạng:
 *   - "domain not found: tracker:class:Document"
 *   - "Error: domain not found: core:class:TsRelation"
 *
 * Trả class ref thật (group 1) hoặc null nếu không match.
 */
// Capture đến whitespace/EOL (code-review MINOR #5) — defensive nếu Huly thêm
// class ref có ký tự lạ (vd dash). Trước đây `[\w:]+` cắt tại ký tự không match.
const DOMAIN_NOT_FOUND_RE = /domain\s+not\s+found:\s*(\S+)/i;
export function matchDomainNotFound(message: string): string | null {
  const m = DOMAIN_NOT_FOUND_RE.exec(message);
  return m ? m[1] : null;
}

/**
 * Map any error (PlatformError, network Error, generic) → HulyError subclass.
 * Order:
 *   1. Already HulyError → return as-is
 *   2. PlatformError (duck-type) → classify via status.code
 *   3. Network Error (ECONNREFUSED, fetch failed, WebSocket) → ConnectionError
 *   4. Plain Error 'Workspace not found' → AuthError (run /huly init)
 *   5. ExternalError → unwrap cause, mapError recursive
 *   6. Else → InternalError (wrap)
 *
 * T-57 #61: trước InternalError fallback, check "domain not found" pattern
 * (xuất hiện trong cả PlatformError UnknownError + plain Error) → UnavailableError.
 */
export function mapError(e: unknown): HulyError {
  // 0. Already HulyError
  if (e instanceof HulyError) {
    // ExternalError → unwrap cause recursively
    if (e instanceof ExternalError && e.cause !== undefined) {
      return mapError(e.cause);
    }
    return e;
  }

  // 1. PlatformError (duck-type)
  if (isPlatformError(e)) {
    const classified = classifyPlatformError(e);
    // T-57: PlatformError UnknownError có thể wrap "domain not found" trong
    // raw message (vd createDoc class sai → server throw UnknownError với
    // message "domain not found: <class>"). classifyPlatformError build message
    // từ status.code (chỉ "UnknownError") KHÔNG giữ raw text → check cả 2.
    if (classified.class === "Internal") {
      const cls = matchDomainNotFound(e.message) ?? matchDomainNotFound(classified.message);
      if (cls !== null) {
        return new UnavailableError(buildUnavailableMessage(cls), e, cls);
      }
    }
    return classified;
  }

  // 2. Plain Error
  if (e instanceof Error) {
    const msg = e.message ?? "";
    // Network patterns
    if (NETWORK_PATTERNS.some((re) => re.test(msg) || re.test(e.name))) {
      return new ConnectionError(`Huly unreachable: ${msg}`, e);
    }
    // T-57 #61: "domain not found: <class>" → UnavailableError (trước fallback
    // generic InternalError — Huly raw error message thường chứa pattern này).
    const cls = matchDomainNotFound(msg);
    if (cls !== null) {
      return new UnavailableError(buildUnavailableMessage(cls), e, cls);
    }
    // api-client own: 'Workspace <name> not found'
    if (/^Workspace\s+\S+\s+not\s+found/i.test(msg)) {
      return new AuthError(`Auth failed: ${msg} Run /huly init.`, e);
    }
    // Generic — include e.message cho ops debug (sanitize() ở toToolResult strip secret)
    return new InternalError(`Internal: ${e.name}: ${e.message}`, e);
  }

  // 3. Non-Error (string, object, null, undefined) → wrap
  const detail = typeof e === "string" ? e : JSON.stringify(e);
  return new InternalError(`Internal: ${detail}`, e);
}

/**
 * T-57 #61: Build honest message cho UnavailableError — list possible causes
 * giúp LLM/user debug (package chưa enable / sai class ref / report bug).
 */
function buildUnavailableMessage(cls: string): string {
  return (
    `Class "${cls}" không khả dụng trong workspace này. ` +
    `Có thể: (1) workspace chưa enable package chứa class này ` +
    `(vd Document/Tags feature opt-in); (2) pi-huly dùng sai class ref ` +
    `(report bug kèm workspace Huly version); (3) class đã bị rename/deprecated ` +
    `trong phiên bản Huly mới hơn.`
  );
}

/**
 * Convert HulyError → pi tool result (04 §6, 08 §A no-leak).
 * Strips: token, password, stack trace, internal _class names.
 * Keeps: error class, sanitized message.
 */
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
};

/**
 * Patterns to strip from messages (secrets + stack) — 08 §A NFR-04 no-leak.
 * Centralized ở errors.ts để mọi consumer (toToolResult, builder sanitize path)
 * dùng chung single source of truth (tránh drift khi thêm pattern mới).
 */
export const LEAK_PATTERNS = [
  // Generic key=value assignment: token=..., password: "...", Authorization: Bearer xxx
  /(?:token|password|secret|api[_-]?key|authorization)\s*[=:]\s*['"]?[A-Za-z0-9_.+/ -]{8,}['"]?/gi,
  // GitHub tokens (classic PAT, fine-grained, npm)
  /ghp_[A-Za-z0-9]{36,}/g,
  /npm_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]+/g,
  // Cloud provider access keys: AWS (AKIA...), OpenAI (sk-...)
  /(?:AKIA|sk-)[A-Za-z0-9]{16,}/g,
  // JWT (3 dot-separated base64url segments, each ≥10 chars)
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  // URL-embedded credentials: https://user:pass@host
  /https?:\/\/[^/\s@]+:[^/\s@]+@/gi,
  // Stack frame: "at <path>:<line>:<col>" hoặc V8 "at fn (file.js:10:5)"
  /\bat\s+.*?:\d+:\d+(?::\d+)?\)?/g,
];

/**
 * Sanitize message — strip secrets + stack traces (08 §A NFR-04).
 * Exported để builder + domain tool reuse (single source of truth cho patterns).
 */
export function sanitize(message: string): string {
  let out = message;
  for (const re of LEAK_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

export function toToolResult(err: HulyError): ToolResult {
  const errorClass = err.class;
  const sanitizedMsg = sanitize(err.message);
  return {
    content: [
      {
        type: "text",
        text: `[${errorClass}Error] ${sanitizedMsg}`,
      },
    ],
    isError: true,
  };
}
