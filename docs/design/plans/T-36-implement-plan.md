# T-36 — Implement Plan: e2e self-host smoke (rescoped)

> **Task**: [T-36] [M] medium priority — e2e self-host smoke (~10 critical tools).
> **Milestone**: M5 Hardening + release. **Blocked-by**: T-34 (✅), T-35 (✅).
> **Blocks**: T-38.

## 1. Mục tiêu (rescoped)

Spec gốc (TASKS.md + 08-non-functional §"e2e 5%"): *"real self-host Huly (CI
secret, optional/manual) — smoke ~10 critical tools"* gồm: `create_issue,
list_issues, get_issue, create_document, edit_document, create_milestone,
set_issue_milestone, add_comment, fulltext_search, /huly init`.

Audit T-36 (2026-07-27) xác nhận KHÔNG có self-host Huly available:
- KHÔNG có env vars HULY_* (`env | grep -i huly` = empty).
- User KHÔNG confirm có Huly instance (slash goal mode, no answer).
- Release doc 10 §D liệt kê runtime verify là post-deploy prod step, KHÔNG CI gate.

→ **Rescope T-36** (spec mismatch — self-resolvable, KHÔNG design conflict):
- **In-scope CI**: integration smoke harness — invoke `tool.execute()` chain
  cho 10 critical tools với in-memory mock HulyClient (verifies full builder
  seam: resolver → getClient → currentUser → confirm gate → handler → result
  sanitize → AgentToolResult shape). Đây là **integration** (KHÔNG unit) vì nó
  wire nhiều module thật (builder + handler + errors map + render).
- **Out-of-scope CI (deferred)**: actual real-Huly round-trip — cần self-host
  instance + CI secret. Defer tới post-deploy prod verify (10-release.md §D)
  HOẶC task mới khi maintainer có Huly.

## 2. 10 critical tools under smoke

| # | Tool | Domain file | Handler flow verified |
|---|---|---|---|
| 1 | `huly_create_issue` | issues-core.ts | resolve project → createDoc → return id |
| 2 | `huly_list_issues` | issues-core.ts | findAll → map → table |
| 3 | `huly_get_issue` | issues-core.ts | findOne → render card |
| 4 | `huly_create_document` | documents.ts | resolve teamspace → createDoc |
| 5 | `huly_edit_document` | documents.ts | findOne → updateDoc |
| 6 | `huly_create_milestone` | milestones.ts | resolve project → createDoc |
| 7 | `huly_set_issue_milestone` | milestones.ts | findOne issue → updateDoc |
| 8 | `huly_add_comment` | comments.ts | findOne issue → addCollection |
| 9 | `huly_fulltext_search` | search.ts | client.search global |
| 10 | `/huly init` (command) | commands/huly.ts | bind cwd → status |

## 3. Implementation

### Phase 1: Tạo integration smoke test file

`src/__tests__/e2e-smoke.test.ts` — harness:

1. **In-memory HulyClient mock** (`MockHulyStore`): Map<class, Map<_id, doc>>.
   Implement `findOne/findAll/createDoc/updateDoc/removeDoc/addCollection/
   getCurrentUser/getAccount`. Stateful — create thêm doc thật, list trả list
   thật. (Giống fixture pattern nhưng cho builder integration.)
2. **Mock resolver + pool + client factory**: `vi.mock` config/resolver +
   client/pool để builder dùng mock store. Setup `cwd` binding cho workspace.
3. **10 smoke test cases** (1 test/tool) — invoke `tool.execute(toolCallId,
   params, signal, onUpdate, ctx)` trực tiếp, assert:
   - `result.content` non-empty + human-readable
   - `result.details` có id/identifier
   - `result.isError` undefined (success path)
   - Mock store phản ánh side-effect (doc được create/update)
4. **Cross-cutting assertions**: 1 pool connection shared across 10 tool calls
   (D14); no-leak (content KHÔNG chứa token); error path (create_issue no
   project → clear hint).
5. **Comment header rõ**: explain T-36 status — integration smoke (CI),
   runtime e2e deferred (KHÔNG có Huly self-host), what this verifies vs NOT.

### Phase 2: Update TASKS.md + risk register

6. TASKS.md T-36 done note: "integration smoke (10 critical tools via
   builder.execute + in-memory mock store) added; runtime real-Huly e2e
   deferred to post-deploy prod verify (10 §D) — maintainer cần self-host".
7. (Optional) Update 08-non-functional §"e2e 5%" + 10-release §D note.

### Phase 3: Verify + commit + PR

8. `pnpm run test:run` pass (352 + ~12 new tests).
9. `pnpm run fmt:check && lint && typecheck && build && lint:md` pass.
10. Branch `t-36-e2e-smoke` + commit + push + PR + chờ CI + merge.

## 4. Verification checklist (DoD T-36 rescoped)

- [ ] `e2e-smoke.test.ts` có 10 critical tool smoke cases (1/tool)
- [ ] Test invoke `tool.execute()` (KHÔNG chỉ call handler — verify full seam)
- [ ] In-memory MockHulyStore stateful (create/list/get round-trip thật)
- [ ] Comment header rõ T-36 status (integration CI; runtime deferred)
- [ ] test:run pass (~364 tests total)
- [ ] CI green (ubuntu + macos, node 24)
- [ ] PR merged
- [ ] TASKS.md T-36 done + deferred note
- [ ] No-leak assertion (content KHÔNG chứa token/secret)

## 5. Risk / Out of scope

- **Runtime real-Huly e2e**: KHÔNG verify được trong CI (no self-host).
  Flag honestly. Defer tới post-deploy prod verify (10-release §D).
- **R7 subagent dispatch**: vẫn UNVERIFIED (carry T-35). KHÔNG smoke được
  pi-subagent dispatch (package unavailable).
- **Mock fidelity**: in-memory mock KHÔNG = real Huly WS/REST semantics
  (reconnect, latency, serialization). Document limitation. KHÔNG claim
  runtime e2e pass.
- **KHÔNG** add self-host Huly CI secret (out of scope, maintainer decision).
- **KHÔNG** change builder.ts/handler implementations (T-36 test-only).
