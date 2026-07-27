# pi-huly Setup — install extension + bind workspace

Hướng dẫn setup extension `pi-huly` (native Huly support cho pi-coding-agent —
KHÔNG MCP, gọi thẳng WebSocket API). Skills `huly-docs`/`huly-tasks` bundle sẵn
trong package.

## Cài đặt

```bash
pi install pi-huly
```
Package `pi-huly` publish public trên npmjs.org. Sau install:

- Extension `dist/index.mjs` tự load → register 102 huly tools (prefix `huly_`).
- Skills `huly-docs` + `huly-tasks` tự load qua package manifest `pi.skills`
  (declarative, KHÔNG runtime register).
- Command `/huly` available (unified: init/status/workspace/link/unlink).

## Bind workspace (UC-01)

pi-huly cần biết workspace + project bind tới cwd (working directory) trước khi
gọi tool. 2 cách:

### Cách 1: `/huly init` (interactive, TUI only)

```text
/huly init
```
Flow (UC-01):

1. Prompt workspace name.
2. `findByName`: 0 match → prompt URL + auth (Token HOẶC Email+password) → add
   workspace. 1 match → reuse. N match (same-name diff-URL) → disambiguate.
3. Verify auth (connect WS → `huly_get_user_profile`).
4. `huly_list_projects` → pick HOẶC create new project.
5. Bind cwd → {workspace, project}.

### Cách 2: `/huly link` (non-interactive, subagent/CI)

```text
/huly workspace add <name> <url> [--token <t> | --email <e> --password <p>]
/huly link <workspace-id> <project-id>
```
Subagent KHÔNG có UI → KHÔNG dùng `/huly init`. Main agent phải bind TRƯỚC khi
dispatch subagent (orchestrator pattern — subagent KHÔNG onboard).

## Verify setup

```text
/huly status
```
Trả: extension version, workspace resolved cho cwd, project binding, pool health
(số WS connection active), current user (name + email). **KHÔNG lộ token/password**.

Nếu trả lỗi hoặc workspace sai → check credentials + re-link.

## SaaS vs self-host

**Self-host** (Docker-first, repo `huly-selfhost`): cấu hình URL + auth qua
`/huly init` HOẶC `/huly workspace add`.

> ⚠️ **Hosted Huly (huly.app) SaaS đã ngừng hoạt động** (deadline shutdown
> 2026-07-20 đã qua). Nếu user dùng huly.app → migrate self-host. Link:
> <https://github.com/hcengineering/huly-selfhost> + backup/restore guide.

## Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| "No Huly binding for this directory" | cwd chưa bind | `/huly init` (TUI) HOẶC `/huly link <ws> <proj>` |
| "Person not found" | assignee sai format | Dùng email, hoặc `huly_list_employees` lookup exact display name (`LastName,FirstName`) |
| Auth/connection failed | URL/credentials sai | `/huly workspace remove <id>` rồi add lại |
| `huly_get_document` content rỗng | Front service URL không reach | Check workspace URL config (front service resolve qua workspace URL) |
| "Failed to reconnect" | Server died / network | `/huly status` check pool health, retry |
| Tool KHÔNG tìm thấy | Extension chưa load | Verify `pi install pi-huly` + restart pi session |
| Subagent "no binding for cwd" | Main chưa bind trước dispatch | Main chạy `/huly init`/`link` TRƯỚC dispatch |

## Cập nhật

```bash
pi install pi-huly@latest
```
Restart pi session để load extension mới (pi giữ process alive).

## Link tham khảo

- Repo: <https://github.com/naicoi92/pi-huly>
- Issues: <https://github.com/naicoi92/pi-huly/issues>
- Huly self-host: <https://github.com/hcengineering/huly-selfhost>
