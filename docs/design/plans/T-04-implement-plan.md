# T-04: client/errors.ts — HulyError taxonomy

> Implement plan. T-04 = task-type logic mới → TDD red-green-refactor.
> Evidence: @hcengineering/platform PlatformError + status codes (evidence-collector verified).

## Issue reference
- Issue: T-04 (local-tasks, TASKS.md dòng 21)
- Spec: client/errors.ts (HulyError taxonomy Auth/Connection/NotFound/Conflict/Internal/External, mapError, toToolResult no-leak) + unit
- Design docs:
  - [04 - System](../04-system.md) §3 Error Taxonomy & Propagation (dòng 41-52) + §6 client/errors.ts (dòng 223-230)
  - [08 - Non-Functional](../08-non-functional.md) §A Info Disclosure (NFR-04 no token/password leak)
  - [09 - Roadmap](../09-roadmap.md) topology order 4
- Blocked by: T-02, T-03 (✅ done)
- Blocks: T-05, T-08a, T-09
- Priority: high | Size: S | Milestone: M1

## Evidence: PlatformError API (từ huly.core@main, evidence-collector)

```ts
// @hcengineering/platform
class PlatformError<P> extends Error {
  readonly status: Status<P>  // { severity, code, params }
}
// platform.status.* — object references (KHÔNG string compare)
//   Unauthorized, TokenExpired, TokenNotActive, PasswordExpired  → AuthError (re-login)
//   WorkspaceNotFound, PasswordLoginLocked, InvalidPassword,
//   AccountNotConfirmed, SocialIdNotConfirmed                 → AuthError (/huly init)
//   Forbidden, ReadOnlyAccount                                 → AuthError (not owner)
//   ConnectionClosed                                           → ConnectionError (server-signal close)
//   Conflict, AlreadyExists, AccountAlreadyExists             → ConflictError
//   BadRequest, InvalidId, ExpiredLink                         → ValidationError
//   PersonNotFound, InviteNotFound                             → NotFoundError
//   BadError, UnknownError, InternalServerError, UnknownMethod → InternalError
// Network errors (raw Error, NOT PlatformError):
//   ECONNREFUSED, ETIMEDOUT, ENOTFOUND, EAI_AGAIN,
//   'fetch failed', 'WebSocket', 'abnormal closure'           → ConnectionError
// api-client own: throw new Error('Workspace <name> not found') → AuthError (/huly init)
```

## Approach

T-04 = **logic mới** (error taxonomy + mapError classify + toToolResult no-leak) → **TDD red-green-refactor**.

Key design decisions (từ evidence):
1. **Import PlatformError từ `@hcengineering/api-client`** (re-exported, đã bundled) — KHÔNG import trực tiếp platform (reduce coupling)
2. **Import `platform` namespace từ `@hcengineering/platform`** cho status code references (stable object identity)
3. **mapError priority order**:
   1. `e instanceof PlatformError` → classify via `e.status.code` references (Auth/Connection/Conflict/Validation/Internal)
   2. `e instanceof Error` → network heuristic (ECONN*/fetch failed/WebSocket) → ConnectionError; `message.startsWith('Workspace ')` → AuthError; else InternalError
   3. `else` → InternalError (wrap non-Error)
4. **HulyError base class** with `class: ErrorClass` + `message` + `cause?`
5. **7 subclasses** (Auth/Connection/NotFound/Conflict/Validation/Internal/External) extending HulyError
6. **toToolResult no-leak**: strip token/password/stack from output; only safe metadata (error class + sanitized message)

## Task-type dispatch
- Skill: `superpowers:test-driven-development` (red-green-refactor)
- Subagent impl: no (task S homogeneous, main agent TDD đủ)

## Steps

### Step 1: Types + HulyError class hierarchy
- Files: `src/client/errors.ts` — types + classes only (red phase)
  - `type ErrorClass = 'Auth' | 'Connection' | 'NotFound' | 'Conflict' | 'Validation' | 'Internal' | 'External'`
  - `class HulyError extends Error { readonly class: ErrorClass; readonly cause?: unknown }`
  - `class AuthError extends HulyError { constructor(message, cause?) }` (and 6 others)
- Verify: `tsc --noEmit` pass

### Step 2: mapError — TDD
- Files: `src/client/errors.ts` (impl), `src/client/__tests__/errors.test.ts` (tests)
- Test cases (red → green):
  1. PlatformError with status.code = Unauthorized → AuthError
  2. PlatformError with status.code = TokenExpired → AuthError
  3. PlatformError with status.code = WorkspaceNotFound → AuthError
  4. PlatformError with status.code = ConnectionClosed → ConnectionError
  5. PlatformError with status.code = Conflict → ConflictError
  6. PlatformError with status.code = BadRequest → ValidationError
  7. PlatformError with status.code = PersonNotFound → NotFoundError
  8. PlatformError with status.code = UnknownError → InternalError
  9. PlatformError with unknown status.code → InternalError (fallback)
  10. Plain Error with code ECONNREFUSED → ConnectionError
  11. Plain Error with message 'fetch failed' → ConnectionError
  12. Plain Error with message 'WebSocket abnormal closure' → ConnectionError
  13. Plain Error with message 'Workspace foo not found' → AuthError (/huly init)
  14. Plain Error (generic) → InternalError
  15. Non-Error value (string, object) → InternalError (wrap)
- Verify: vitest green

### Step 3: toToolResult — TDD (no-leak)
- Files: same
- Test cases:
  1. AuthError → `{ content: [{ type: 'text', text: '...' }], isError: true }` with safe message
  2. ConnectionError → tool result with URL (no token)
  3. Token text NOT in output (inject token in cause, verify toToolResult strips)
  4. Password text NOT in output
  5. Stack trace NOT in output
  6. All 7 error classes produce valid tool result
- Verify: vitest green; grep token/password in output = 0

### Step 4: Integration smoke + finalize
- Test cases:
  1. Full flow: throw PlatformError(Unauthorized) → mapError → toToolResult → safe output
  2. Wrap external dep error (ExternalError) → unwrap cause → mapError recursive
- Verify: full suite green, coverage ≥80%

## Verify checklist (tổng)
- [ ] `oxfmt --check` pass
- [ ] `oxlint .` pass
- [ ] `markdownlint-cli2` pass
- [ ] `tsc --noEmit` pass
- [ ] `vitest run` green — errors tests pass
- [ ] coverage errors.ts ≥ 80%
- [ ] mapError classify đúng tất cả PlatformError codes (Auth/Connection/Conflict/Validation/NotFound/Internal)
- [ ] mapError classify network errors (ECONNREFUSED/fetch failed/WebSocket)
- [ ] toToolResult no-leak (grep token/password/stack = 0)
- [ ] spec coverage: 04 §6 errors.ts API (HulyError, mapError, toToolResult) + 7 subclasses

## Risk / side-effect
- **PlatformError import path**: `@hcengineering/api-client` re-exports PlatformError; `platform.status.*` từ `@hcengineering/platform`. Test dùng mock PlatformError (construct với real Status) — cần @hcengineering/platform installed. Verify install OK sau T-01.
- **Status code drift**: nếu Huly đổi status code names → mapError fallback InternalError (safe). Mitigation: import object references (KHÔNG string), compare bằng `===`.
- **Network heuristic false-positive**: plain Error với message chứa 'fetch failed' → ConnectionError. Mitigation: heuristic conservative (chỉ specific patterns), fallback InternalError.
- **ExternalError unwrap**: design §3 nói "unwrap → map vào class trên". Impl: ExternalError có cause, mapError đệ quy vào cause. Test cover.

## Out of scope
- KHÔNG implement HulyClient (T-05) — chỉ errors layer
- KHÔNG implement connection pool (T-06)
- KHÔNG implement markup (T-08a/b)
- KHÔNG integrate errors vào builder (T-09)
- KHÔNG implement ValidationError trigger (typebox schema pre-execute — T-09 builder job)
- NotFoundError cho document-level (findOne null) = synthesized ở HulyClient (T-05), KHÔNG qua mapError
