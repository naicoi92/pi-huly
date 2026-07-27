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

/** Error class identifier (04 §3 taxonomy, 7 classes). */
export type ErrorClass =
  | "Auth"
  | "Connection"
  | "NotFound"
  | "Conflict"
  | "Validation"
  | "Internal"
  | "External";

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
 * Map any error (PlatformError, network Error, generic) → HulyError subclass.
 * Order:
 *   1. Already HulyError → return as-is
 *   2. PlatformError (duck-type) → classify via status.code
 *   3. Network Error (ECONNREFUSED, fetch failed, WebSocket) → ConnectionError
 *   4. Plain Error 'Workspace not found' → AuthError (run /huly init)
 *   5. ExternalError → unwrap cause, mapError recursive
 *   6. Else → InternalError (wrap)
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
    return classifyPlatformError(e);
  }

  // 2. Plain Error
  if (e instanceof Error) {
    const msg = e.message ?? "";
    // Network patterns
    if (NETWORK_PATTERNS.some((re) => re.test(msg) || re.test(e.name))) {
      return new ConnectionError(`Huly unreachable: ${msg}`, e);
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
 * Convert HulyError → pi tool result (04 §6, 08 §A no-leak).
 * Strips: token, password, stack trace, internal _class names.
 * Keeps: error class, sanitized message.
 */
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
};

/** Patterns to strip from messages (secrets + stack). */
const LEAK_PATTERNS = [
  /(?:token|password|secret|api[_-]?key|authorization)\s*[=:]\s*['"]?[A-Za-z0-9_.+/ -]{8,}['"]?/gi,
  /ghp_[A-Za-z0-9]{36,}/g,
  /npm_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]+/g,
  // Stack frame: "at <path>:<line>:<col>" hoặc V8 "at fn (file.js:10:5)"
  /\bat\s+.*?:\d+:\d+(?::\d+)?\)?/g,
];

/** Sanitize message — strip secrets + stack traces. */
function sanitize(message: string): string {
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
