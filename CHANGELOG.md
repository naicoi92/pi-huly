# Changelog

All notable changes to pi-huly sẽ document ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/),
versioning theo [Semantic Versioning](https://semver.org/).

## [1.0.0-beta.2] - 2026-07-27

Hotfix canary. Fix 7 runtime bug phát hiện qua smoke test beta.1 trên self-host
(GitHub issues #22-#28). Install: `pi install npm:pi-huly@beta` (hoặc
`pi update npm:pi-huly` nếu đã pin beta).

Audit runtime qua **npm tarball source map extraction** (`docs/design/11-runtime-audit.md`)
thay self-host unavailable — phát hiện root cause thật của 6+ class broken
(KHÔNG đoán mò).

### Fixed

- **#22, #26** — `list_*`/`create_*` non-TUI path mất data array + id: builder
  seam `appendDetailsForLLM()` auto-append summary `details` → `content` text
  khi `hasUI=false`. Sanitize mọi field (NFR-04 no-leak). TUI mode giữ nguyên.
  `create_issue` thêm identifier lookup sau createDoc. (T-40, PR #29)
- **#23** — `get_issue` description trả ref vô nghĩa: `Issue.description` là
  `MarkupBlobRef` (document ref), KHÔNG inline markup. Thêm `client.fetchMarkup()`
  vào HulyClient, resolve ref → markdown content. Fallback `descriptionRef`
  rõ ràng khi fail. (T-41, PR #32)
- **#24** — `fulltext_search` stub chỉ search title: expand query across 3
  domains (Issue title + Document title + ChatMessage content) qua `Promise.all`.
  Honest description "substring search (NOT fulltext index)". Catch server
  reject `$like` → error rõ ràng (KHÔNG fake "Found 0"). (T-42, PR #33)
- **#25** — Sai class name runtime (6+ broken): Employee là **mixin** không class;
  TaskType/ProjectType thuộc `task` pkg (cross-package import); Document trong
  `tracker` (pkg `document` deprecated); Space là base abstract trong `core`;
  Tag → `TagElement` (rename); Todo → `time:class:ToDo` (cross-pkg + chữ viết
  hoa D); TimeSpendReport → `tracker` pkg. (T-43, PR #31)
- **#27** — `add_issue_label` push raw string không validate: `Issue.labels` là
  `TagReference[]` (object `{tag, title, color}`), KHÔNG string. Validate label
  tồn tại (lookup title OR _id) → push object shape đúng. Symmetric remove.
  Idempotent. (T-45, PR #34)
- **#28** — `create_todo` crash `platform:status:UnknownError`: `ToDo extends
  AttachedDoc` với required fields. Fill đầy `attachedToClass`, `user`,
  `visibility` (Public), `rank` (lexorank empty), `priority` (number enum map),
  `workslots` (0). Priority param string → number map (urgent→4, high→0, ...).
  Wrap server error generic với context rõ ràng. (T-46, PR #35)

### Added

- `client.fetchMarkup()` method trong HulyClient interface (delegate PlatformClient
  MarkupOperations, ws transport; REST fallback NotImplementedError với hint).
- `docs/design/11-runtime-audit.md` — runtime audit source of truth (class
  registry truth table, storage model, search operator, label ref shape, Todo
  storage). Method: npm tarball source map extraction (`@hcengineering/*@0.7.423`).
- `appendDetailsForLLM()` helper trong builder.ts — shape-aware serialize details
  → content text (array cap top 30, scalar id/identifier, sanitize mọi field).
- 9 audit regression tests (`class-refs-audit.test.ts`) snapshot class refs
  against registry truth.

### Known limitations

- **3 class refs UNVERIFIED**: `view:class:Label`, `core:class:TsRelation`,
  `document:class:DocumentSnapshot` — không có trong audited packages, cần
  runtime server verify khi maintainer có self-host instance (audit §7).
- Runtime real-Huly e2e smoke vẫn deferred (T-36 integration smoke only — no
  self-host in CI). Audit §3 verified `$like` client-side predicate behavior.
- R7 pi-subagent dispatch runtime unverified (precondition verified T-35).

### Stats

- 411 tests pass (+46 từ beta.1 baseline 365)
- Bundle size: 158.63 kB (vs 149.71 kB beta.1 — tăng do fetchMarkup +
  appendDetailsForLLM + audit tests)
- CI green cả ubuntu + macos (node 24)

Feedback: <https://github.com/naicoi92/pi-huly/issues>

## [1.0.0-beta.1] - 2026-07-27

Canary pre-release. Early adopter test trước stable 1.0.0. Install:
`pi install npm:pi-huly@beta`.

Same content as 1.0.0 (below). Known limitations:

- Runtime real-Huly e2e smoke deferred (T-36 integration smoke only — no self-host in CI).
- R7 pi-subagent dispatch runtime unverified (precondition verified T-35).

Feedback: <https://github.com/naicoi92/pi-huly/issues>

## [1.0.0] - 2026-07-27

Initial stable release. Native Huly support cho pi-coding-agent.

### Added

- **102 tools** across 19 domains (full CRUD per domain):
  - Issues (21): create/list/get/update/delete/move_issue, labels, relations, templates
  - Documents (10): teamspace + document CRUD
  - Projects (6), Milestones (6), Components (6), Comments (4)
  - Workspace (5), Labels (4), Tags (7), Tag-categories (4)
  - Attachments (5), Todos (7), Search (1), Deletion preview (1)
  - Time log (1), Contacts (2), Task-management (5), Spaces (5), Snapshots (2)
- **2 skills** bundled: `huly-docs` (DocStore adapter) + `huly-tasks` (TaskStore adapter)
  for project-design workflow. Adapted `huly_` prefix, dropped MCP refs.
- **Unified `/huly` command** (git-like): init/status/workspace list|add|remove/link/unlink
- **Multi-workspace credentials**: token OR email+password auth union per workspace
- **Transport toggle**: WebSocket (persistent, connection pool LRU ≤8, auto-reconnect)
  OR REST (stateless). Default ws.
- **TUI render**: `huly_get_issue` card, `huly_list_issues` table, `huly_get_document` preview
- **Confirm gate** for destructive ops (delete_*) — FR-09, non-TUI auto-deny
- **Markdown round-trip** lossless (R8): Huly markup ↔ markdown, native ref links
- **Assignee auto-resolve** (D15 FR-18): absent → currentUser email
- **Error taxonomy** (FR-14): Auth/Connection/NotFound/Conflict/Internal/External,
  no secret leak (NFR-04)

### Documentation

- Full user-facing [README.md](./README.md) (install, quick start, /huly guide, tool catalog)
- [NOTICE.md](./NOTICE.md) with R1 license audit (@hcengineering EPL-2.0 attribution)
- Design docs (10-step project-design) in [`docs/design/`](./docs/design/)

### Tested

- **365 tests** pass (unit + integration + e2e smoke)
- CI green (ubuntu-latest + macos-latest, node 24)
- Coverage ≥80% core modules

### Dependencies

- **Runtime** (npm public, KHÔNG GitHub token needed):
  - `@hcengineering/*` ^0.7.423 (EPL-2.0) — Huly client + domain classes + markup
  - `ws` ^8.21.1 (MIT) — WebSocket transport
- **Peer** (pi ecosystem):
  - `@earendil-works/{pi-coding-agent,pi-ai,pi-tui,pi-agent-core}` (MIT)
  - `typebox` (MIT)

### License

MIT © naicoi92. Runtime dependency `@hcengineering/*` is EPL-2.0 (see [NOTICE.md](./NOTICE.md)).

---

## [Unreleased]

_None yet._
