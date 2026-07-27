# Changelog

All notable changes to pi-huly sẽ document ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/),
versioning theo [Semantic Versioning](https://semver.org/).

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
