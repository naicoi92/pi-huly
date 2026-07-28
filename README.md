# pi-huly

> Native Huly support cho [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) —
> ~102 tools + 2 skills + subagent-compatible.
> KHÔNG MCP, gọi thẳng Huly WebSocket/REST API.

[![CI](https://github.com/naicoi92/pi-huly/actions/workflows/ci.yml/badge.svg)](https://github.com/naicoi92/pi-huly/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/pi-huly.svg)](https://www.npmjs.com/package/pi-huly)

**Status**: M5 Hardening + release (post-T-37). Design docs trong [`docs/design/`](./docs/design/). Tasks trong [`TASKS.md`](./TASKS.md).

## Tại sao pi-huly?

Huly (self-host project management) không có native integration với pi-coding-agent.
Cách cũ: chạy `@firfi/huly-mcp` làm MCP server riêng (process ngoài, config
transport, ~470 tools nhiễu context window LLM). pi-huly đóng gói **đúng ~102
tools thiết yếu** chạy native trong pi process, kèm sẵn skills `huly-docs` +
`huly-tasks`, tương thích `pi-subagents`.

<details><summary>Vấn đề vs cách pi-huly giải quyết</summary>

| Vấn đề | pi-huly giải quyết |
|---|---|
| MCP server riêng (process phụ thuộc, env vars) | 1 package native, cùng lifecycle session |
| ~470 tools nhiễu LLM | **~102 tools** full-CRUD-per-domain, không gap lifecycle |
| Skills phụ thuộc MCP server runtime | Skills đi kèm, tools cùng process |
| Hosted Huly SaaS shutdown 2026-07-20 | Target **self-hosted Huly** từ đầu |

</details>

## Features

- 🔑 **Native, không MCP** — tools chạy trong pi process, không spawn process ngoài.
- 🔑 **Lean + complete** — 102 tools full-CRUD-per-domain, không nhiễu context.
- 🔎 **Tự chứa** — package mang theo skills + tools + Huly client, `pi install` xong dùng được.
- 🔒 **Multi-workspace** — lưu token/password mỗi workspace, switch qua `/huly`.
- 🔀 **Transport toggle** — WebSocket (persistent, pool) hoặc REST (stateless), default ws.
- 🛡️ **Confirm gate** — destructive ops (delete) yêu cầu confirm; non-TUI auto-deny.
- 🔁 **Markdown round-trip** — Huly markup ↔ markdown lossless (native ref links).
- 🎨 **TUI render** — `huly_get_issue` card, `huly_list_issues` table, `huly_get_document` preview.

## Requirements

- **Node.js 24** (LTS) — pin `.node-version`. Consumer floor `>=22.19.0` (pi engine).
- **pi-coding-agent** `>=0.82.1` (peer dependency).
- **Self-host Huly instance** (KHÔNG support hosted SaaS — đã shutdown 2026-07-20). Hướng dẫn self-host: <https://docs.huly.io/self-host/>.
- **`@hcengineering/*` deps** publish **public trên npmjs.org** (KHÔNG cần GitHub Packages token).

## Install

```bash
pi install npm:pi-huly
```

Hoặc từ source:

```bash
git clone https://github.com/naicoi92/pi-huly.git
cd pi-huly
pnpm install        # no token needed — @hcengineering public on npm
pnpm run typecheck  # verify toolchain
pnpm run build      # → dist/index.mjs
```

## Quick start (3 bước)

```bash
# 1. Cài package
pi install npm:pi-huly

# 2. Bind workspace cho cwd hiện tại (interactive — chọn workspace + project)
/huly init

# 3. Dùng tool (LLM tự gọi, hoặc bạn invoke qua prompt)
#    VD: "Tạo issue PD-1: 'Setup CI' priority high"
#    → LLM gọi huly_create_issue({project:"PD", title:"Setup CI", priority:"high"})
```

## `/huly` command guide

Unified command, git-like subcommands:

| Subcommand | Mô tả |
|---|---|
| `/huly` | Smart: cwd bound → status; unbound → init flow |
| `/huly init` | Setup/bind cwd (chọn workspace → verify → project → bind) |
| `/huly status` | Diagnostics: binding, pool health, user, version |
| `/huly workspace list` | List workspace đã config |
| `/huly workspace add` | Add workspace (url + auth) |
| `/huly workspace remove <id>` | Remove workspace |
| `/huly link [ws] [project]` | Bind cwd manual |
| `/huly unlink` | Remove cwd binding |

## Tool catalog (19 domains, 102 tools)

| Domain | Tools | VD |
|---|---|---|
| **Issues** | 21 | create/list/get/update/delete/move_issue, add/remove_label, relations, templates |
| **Documents** | 10 | create/edit/get/delete_document, teamspace CRUD |
| **Projects** | 6 | create/list/get/update/delete_project, list_statuses |
| **Milestones** | 6 | CRUD + set_issue_milestone |
| **Components** | 6 | CRUD + set_issue_component |
| **Comments** | 4 | list/add/update/delete_comment |
| **Workspace** | 5 | get_workspace_info, list_workspaces/members, get/update_user_profile |
| **Labels** | 4 | list/create/update/delete_label (GLOBAL namespace) |
| **Tags** | 7 | CRUD + attach/detach/list_attached |
| **Tag-categories** | 4 | CRUD |
| **Attachments** | 5 | list/get/add/download (incl issue attachment) |
| **Todos** | 7 | list/get/create/update/complete/reopen/delete |
| **Search** | 1 | fulltext_search (global) |
| **Deletion** | 1 | preview_deletion (cascade preview) |
| **Time** | 1 | log_time (minutes) |
| **Contacts** | 2 | list_employees, list_persons (assignee resolution) |
| **Task-management** | 5 | create_issue_status, create_task_type, list/get_project_type |
| **Spaces** | 5 | list/get_space, list/get/update_space_type |
| **Snapshots** | 2 | list/get_document_snapshot |

Mọi tool có prefix `huly_` (vd `huly_create_issue`). Common params:

- `workspace?` — override workspace (default: cwd-map)
- `project?` — project-scoped (issues/milestones/components)
- `identifier` — issue: `PD-123` hoặc raw `123`
- `assignee?` — auto-resolve currentUser email khi absent (D15)

Xem chi tiết: [`docs/design/06-api.md`](./docs/design/06-api.md).

## Configuration

pi-huly dùng 2 file global (KHÔNG env vars, KHÔNG project-local):

- **`~/.pi/huly/credentials.json`** (chmod 600, KHÔNG commit) — auth union per workspace:

  ```json
  {
    "workspaces": {
      "myteam": {
        "url": "https://huly.example.com",
        "workspace": "myteam",
        "token": "tok_xxx"
      }
    }
  }
  ```

  Hoặc email/password:

  ```json
  {
    "workspaces": {
      "myteam": {
        "url": "https://huly.example.com",
        "workspace": "myteam",
        "email": "user@example.com",
        "password": "pass123"
      }
    }
  }
  ```

- **`~/.pi/huly/config.json`** (non-secret) — transport + cwd binding:

  ```json
  {
    "version": 1,
    "transport": "ws",
    "projects": {
      "/Users/me/projects/myapp": { "workspace": "myteam", "project": "PD" }
    }
  }
  ```

Cả 2 file được tạo/quản lý qua `/huly init`. KHÔNG edit tay trừ khi cần.
Secret CHỈ trong credentials.json, KHÔNG log.

## Transport + Auth

- **Transport** (`config.json`):
  - `ws` (default) — WebSocket persistent, connection pool per-workspace
    (max 8 ws, LRU evict), auto-reconnect backoff. Tốt cho latency.
  - `rest` — REST stateless, KHÔNG pool. Tốt cho environments block WS.
- **Auth** (per workspace):
  - `token` — Huly API token (preferred).
  - `email` + `password` — login credentials (api-client `connect` hỗ trợ cả 2).

## Skills (bundled)

pi-huly ship 2 skills (auto-load qua package manifest `pi.skills`):

- **`huly-docs`** — DocStore adapter cho `project-design` workflow. Sync design docs ↔ Huly Documents.
- **`huly-tasks`** — TaskStore adapter. Sync tasks/issues ↔ Huly Issues. Hỗ trợ `milestone-implement` orchestrator.

Cả 2 đã adapted: dùng `huly_` prefixed tools (KHÔNG MCP refs), giữ structure gốc.

## Troubleshooting

| Symptom | Nguyên nhân + Fix |
|---|---|
| `NeedsInitError: No workspace resolved` | cwd chưa bind. Run `/huly init`. |
| `NeedsDisambiguationError: Workspace ambiguous` | Same-name diff-URL. Specify `workspace` param explicit. |
| `ConnectionError: Huly unreachable` | Check URL, network, self-host Huly running. `/huly status` diagnostic. |
| `AuthError: token expired` | Refresh token trong `/huly workspace add`. |
| TS 7 typecheck fail (R6) | Rollback TS 6.x: `pnpm install -D typescript@~6.1`. Xem [R6 rollback](#r6-rollback). |
| `no document found, failed to apply model transaction` spam | Upstream cache-miss warn khi replay tx cũ cho doc đã expire/removed — vô hại. Filter default ON. `/huly status` hiển thị `pool noise: N filtered`. Debug thật: set `quietUpstreamNoise: false` trong `~/.pi/agent/huly/config.json`. |
| `client websocket error` spam + token trong URL | Upstream WS error log (`connection.js:554`) chứa URL `_transactor/<api-token>` — **token leak security** (NFR-04). Filter swallow toàn bộ (KHÔNG redact). WS onerror vẫn trigger reconnect bình thường — chỉ log bị gate. Filter default ON. |

### R6 rollback

Nếu `pnpm run typecheck` fail với TS 7 incompatibility vs `@earendil-works/*` types:

```bash
pnpm install -D typescript@~6.1
pnpm run typecheck
# Pass → ghi known-good TS version + mở issue tag maintainer
# Fail → investigate root cause (có thể pi types bug, KHÔNG phải TS 7)
```

TS 7 (native Go compiler, 2026-07-08) mostly backward-compat.
R6 likelihood 🟢 (design `03-tech-stack.md` §8).

## License

- **pi-huly**: [MIT](./LICENSE) © naicoi92.
- **Runtime dependency `@hcengineering/*`**: **EPL-2.0** (consumer install từ
  npm public — KHÔNG bundled vào dist). Xem [`NOTICE.md`](./NOTICE.md) cho
  attribution + source availability.
- **Other deps** (`ws`, `typebox`, `@earendil-works/*`): MIT.

R1 license audit đầy đủ: [`NOTICE.md`](./NOTICE.md).

## Links

- [Design docs](./docs/design/) (10-step project-design)
- [Tasks](./TASKS.md) (TaskStore = local-tasks)
- [Implementation roadmap](./docs/design/09-roadmap.md)
- [Release plan](./docs/design/10-release.md)
- [Issues](https://github.com/naicoi92/pi-huly/issues)
- [Huly self-host guide](https://docs.huly.io/self-host/)
