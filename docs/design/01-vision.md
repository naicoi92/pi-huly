# pi-huly — Vision & Decision Log

> Bước 1/10. Gộp 2 phần: A — problem statement, B — decisions + alternatives.
> DocStore = local-docs. Storage adapter: `local-docs` (`docs/design/*.md`).

## Phần A — Vision & Problem Definition

### A.0. Working Backwards (artifacts from future — viết như đã ship)

**Changelog entry** (conventional commits):

```text
feat(pi-huly): native Huly support cho pi-coding-agent — tools + skills + subagent
```

**PR/FAQ 1 đoạn** (user được gì? tại sao dùng?):
> pi-huly mang hỗ trợ Huly native vào pi coding agent. Thay vì chạy riêng
> `@firfi/huly-mcp` làm MCP server (process ngoài, proxy discovery, ~470 tools
> gây nhiễu context), pi-huly đóng gói **~102 tools thiết yếu** gọi thẳng Huly
> WebSocket API, kèm sẵn skills `huly-docs` + `huly-tasks`, tương thích
> `pi-subagents`. Developer dùng pi giờ thao tác Huly Issues/Documents ngay
> trong session — design docs sync Huly Docs, design tasks sync Huly Issues,
> subagent dispatch đọc/ghi Huly — không tab-switch, không process phụ thuộc.

### A.1. Mô hình sản phẩm

Pi package (extension + skills) cài qua `pi install`. Extension đăng ký native
pi tools qua `pi.registerTool()`, mỗi tool wrap một operation Huly gọi qua
`@hcengineering/api-client` (WebSocket persistent, session-scoped, pool
per-workspace). Skills `huly-docs`/`huly-tasks` (DocStore + TaskStore adapter
cho `project-design`) đi kèm, chỉ tool pi-huly thay MCP. Tương thích
`pi-subagents` — subagent personality lấy từ `agency-agents`.

### A.2. Problem Statement

| Vấn đề hiện tại | Cách giải quyết |
|---|---|
| Muốn Huly trong pi → phải cài `@firfi/huly-mcp` + config MCP server riêng (process ngoài, env vars, transport config) | pi-huly = 1 package, tools native, config trong pi settings/credential store |
| huly-mcp expose ~470 tools → nhiễu context window LLM, agent bối rối chọn tool | pi-huly expose đúng **~102 tools** (full CRUD per included domain) phục vụ project-design/task-implement workflow |
| Skills `huly-docs`/`huly-tasks` hiện phụ thuộc MCP server chạy độc lập → dependency runtime | Skills đi kèm package, tools cùng process, không dependency ngoài |
| Hosted Huly SaaS **shutdown 2026-07-20** → user phải self-host, tooling cần target self-host | pi-huly thiết kế cho **self-hosted Huly** từ đầu |
| Cherry-pick tool lỏng → gap lifecycle (thiếu `create_issue_status`, `remove_issue_relation`, get/update/delete) | Nguyên tắc **full CRUD mỗi domain include**, skip ở cấp domain |

### A.3. Target Users

1. **Developer/indie hacker tự host Huly** — dùng pi coding agent làm việc
   cá nhân/nhóm nhỏ, muốn PM (issues/docs) tích hợp vào coding session.
   Self-host Huly trên VPS/docker. Nhiều workspace, mỗi workspace own token.
2. **User chạy workflow `project-design`/`milestone-implement`** — cần
   DocStore=Huly + TaskStore=Huly, dispatch subagent cho research/audit/bulk
   issues.

### A.4. Core Value Proposition

- 🔑 **Native, không MCP** — tools chạy trong pi process, cùng lifecycle
  session, không process phụ thuộc.
- 🔑 **Lean + complete** — ~102 tools full-CRUD-per-domain, không nhiễu context
  (vs 470), không gap lifecycle.
- 🔎 **Tự chứa** — package mang theo skills + tools + Huly client, `pi install`
  xong dùng được.
- 🔗 **Tương thích pi-subagents** — subagent (agency-agents) dùng được huly
  tools, shared connection pool.
- 🔐 **Multi-workspace optimal** — credential store per-workspace, mỗi
  workspace own token, chọn/switch qua command.

### A.5. MVP Scope (Production)

**✅ In-scope:**

- ~102 native pi tools (prefix `huly_`, full CRUD per included domain) wrap
  Huly operations qua WebSocket api-client.
- Skills `huly-docs` + `huly-tasks` (bundled, adapted: MCP → pi-huly tools).
- **Multi-workspace config global-only** — credentials.json (secret, token per
  workspace, id-handle + `workspace` field cho same-name diff-URL) + config.json
  (non-secret, `projects` cwd-binding). Auto-resolve workspace + project từ cwd.
- WebSocket connection **pool per-workspace** (cached, lazy connect, cleanup
  all `session_shutdown`).
- Config resolution: per-call param > cwd-map (config.json) > interactive
  `/huly init`. No env, no project-local override.
- Markup conversion (markdown ↔ Huly markup + browse-URL native references) —
  reimplement thin.
- `pi-subagents` compatibility (shared connection pool; agency-agents
  personalities).
- Commands: unified `/huly` (init/status/workspace/link/unlink).
- TUI hybrid render: custom cho `huly_get_issue`, `huly_list_issues`,
  `huly_get_document`; default text cho còn lại.
- Confirm-before-delete gate cho destructive tools.
- Diagnostics: connection check, workspace verify, token verify.

**❌ Out-of-scope (MVP):**

- ~368 tools skip (recruiting/inventory/test-mgmt/CRM/chat/calendar/drive/
  boards/processes/activity/sdk-discovery/custom-fields/collaborators/
  preferences/registry/storage/drawings/workspace-admin/...).
- Hosted SaaS `huly.app` support (đã shutdown).
- Real-time WebSocket push → tool reactive (tools vẫn request-response).
- Read-only mode toggle (YAGNI — thêm sau nếu cần).
- GUI/TUI dashboard panel cho Huly (chỉ tools + skills + commands).
- Vendor/fork `@firfi/huly-mcp` (reimplement thin, D10).

### A.6. Non-Goals

- ❌ Không thay thế `@firfi/huly-mcp` toàn năng — pi-huly subset có chủ đích
  cho project workflow.
- ❌ Không phải MCP server (user yêu cầu rõ: tools native, KHÔNG MCP).
- ❌ Không target SaaS Huly (chỉ self-host).
- ❌ Không port toàn bộ huly-mcp tool catalog (~102 of ~470, full CRUD per
  included domain).
- ❌ Không tự xây Huly instance — user tự self-host Huly riêng.
- ❌ Không bundle agency-agents personalities (chỉ compatible + doc setup).

---

## Phần B — Decision Log (ADR)

> Mọi quyết định agent tự đưa ra ở phần A, minh bạch + alternatives. 15 ADR
> Phase WHAT. Phase HOW (framework, version, markup impl, error taxonomy,
> schema) → Bước 3+.

### B.1. D1: Pi package native tools, KHÔNG MCP

- **Status**: 🟡 Proposed
- **Risk**: 🔴 (core direction, đảo ngược = rewrite)
- **Context**: Có 2 cách mang Huly vào pi: (A) chạy `@firfi/huly-mcp` MCP
  server rồi pi connect qua MCP gateway, (B) viết pi package với native tools
  gọi Huly API trực tiếp.
- **Decision**: **(B) Pi package native tools**. Tools đăng ký qua
  `pi.registerTool()`, gọi `@hcengineering/api-client` trực tiếp trong pi
  process.
- **Rationale**: User yêu cầu rõ "KHÔNG MCP, dùng tools trong extension". Lợi:
  cùng process = không dependency ngoài, cùng lifecycle session, control đầy
  đủ tool surface. Native tools có `promptSnippet`/`promptGuidelines`/custom
  render — MCP proxy không có.
- **Alternatives**:
  - A — MCP server `@firfi/huly-mcp` + pi MCP gateway — pro: zero port effort,
    con: process ngoài, proxy discovery (chỉ 4 tools surface với client không
    phải claude-code), mất native pi features (render/guidelines).
  - C — Fork `@firfi/huly-mcp`, giữ code, đổi transport từ MCP sang pi tool
    calls — pro: reuse logic, con: phụ thuộc internal API package (không public
    contract), Effect runtime nặng.
- **Consequences**: Phải tự build client wrapper (connect/retry/markup) —
  effort ở Bước 3-4. Loại bỏ `@firfi/huly-mcp` khỏi dependency.

### B.2. D2: Target self-hosted Huly only (SaaS shutdown)

- **Status**: 🟡 Proposed
- **Risk**: 🟡 (constraint thị trường)
- **Context**: Huly hosted SaaS (`huly.app`) **shutdown 2026-07-20** (README
  upstream). Self-host không affected.
- **Decision**: pi-huly thiết kế + test cho **self-hosted Huly**. Nếu user
  config `huly.app` → cảnh báo + hướng dẫn migrate.
- **Rationale**: SaaS chết → đầu tư vào SaaS support = throwaway. Self-host là
  tương lai Huly.
- **Alternatives**:
  - A — Hỗ trợ cả 2 (SaaS + self-host) — pro: rộng, con: test/maintain SaaS sắp
    chết, giải thích "shutdown" cho user.
- **Consequences**: Docs/cấu hình nhấn mạnh self-host. Skill `huly-docs`/
  `huly-tasks` gotcha #7 (SaaS shutdown) giữ. Không cần SaaS-specific features
  (regions, hosted billing).

### B.3. D3: Transport — ws OR rest, global toggle (default ws)

- **Status**: 🟡 Proposed
- **Risk**: 🟡 (HOW, nhưng user mandate)
- **Context**: api-client offer 2 transport: `connect` (WebSocket persistent)
  - `connectRest` (HTTP stateless). Huly docs khuyến nghị WS cho client dùng
  nhiều. Multi-workspace (D8) → mỗi workspace 1 connection.
- **Decision**: **Global toggle** `config.json` `transport`: `"ws"` (default,
  `connect` persistent + pool keyed by workspace, auto-reconnect, cleanup
  `session_shutdown`) | `"rest"` (`connectRest` stateless, no persistent pool —
  cached client instance only). Cả 2 implement cùng `HulyClient` interface.
- **Rationale**: User chọn có choice. WS = perf cho workflow gọi tool dồn
  (Bước 9 bulk); REST = đơn giản, debug dễ, phù hợp CI/serverless. Default ws
  (khuyến nghị Huly).
- **Alternatives**:
  - A — WS-only — pro: 1 transport, con: mất choice REST (CI/serverless).
  - B — REST-only — pro: đơn giản, con: handshake mỗi call (chậm bulk), không
    realtime.
- **Consequences**: `createHulyClient(creds, transport)` chọn connect |
  connectRest (Bước 4). Pool logic chỉ apply ws. Subagent shared pool (D14,
  ws only). NFR-01 latency metric khác ws vs rest.

### B.4. D4: Tool surface = full CRUD per domain (~102 tools)

- **Status**: 🟡 Proposed
- **Risk**: 🟢
- **Context**: huly-mcp expose ~470 tools/50 domains. Cherry-pick từng
  operation gây gap (thiếu `create_issue_status`, `remove_issue_relation`,
  get/update/delete lifecycle). User lo "thiếu tool".
- **Decision**: Port **full CRUD mỗi domain include** (~102 tools), skip chỉ ở
  cấp DOMAIN (recruiting/inventory/test-mgmt/CRM/chat/calendar/drive/boards/
  processes/activity/sdk-discovery/custom-fields/collaborators/preferences/
  registry/storage/drawings/workspace-admin/...). Bổ sung tool nếu api-client
  support operation cần mà huly-mcp chưa expose.
- **Rationale**: Nguyên tắc "complete trong phạm vi" — không surprise thiếu
  operation. 102 vs 470 = lean 78% nhưng không gap. Domain-level skip rõ ràng,
  dễ mở rộng sau.
- **Alternatives**:
  - A — Cherry-pick ~48 — pro: cực lean, con: gap lifecycle (create_issue_status,
    remove/unlink, get/update/delete) → "thiếu tool".
  - B — Port toàn bộ ~470 — pro: parity, con: context explosion, phần lớn
    unused.
- **Consequences**: Document skip-domain list rõ ranh giới. Mỗi domain include
  = full CRUD (list/get/create/update/delete + domain-specific). Effort
  implement + test cao hơn ~48 (Bước 9 task breakdown).

**Domain include (19) + tool count:**

| Domain | Tools | Số |
|---|---|---|
| Documents/Teamspaces | list/get/create/update/delete_teamspace, list/get/create/edit/delete_document | 10 |
| Document snapshots | list/get_document_snapshot | 2 |
| Spaces | list/get_space, list/get_space_type, update_space | 5 |
| Workspace/profile | get_workspace_info, list_workspaces, list_workspace_members, get/update_user_profile | 5 |
| Projects | list/get/create/update/delete_project, list_statuses | 6 |
| Task-management | list_project_types, get/list_task_type, create_task_type, create_issue_status | 5 |
| Components | list/get/create/update/set_issue/delete_component | 6 |
| Milestones | list/get/create/update/set_issue/delete_milestone | 6 |
| Issues | list/get/create/update/delete/move_issue, add/remove_issue_label, list/get/create/create_from/update/delete_template, add/remove_template_child, add/remove/list_relation, link/unlink_document | 21 |
| Labels | list/create/update/delete_label | 4 |
| Tags | list/create/update/delete_tag, list_attached, attach/detach_tag | 7 |
| Tag-categories | list/create/update/delete_tag_category | 4 |
| Comments | list/add/update/delete_comment | 4 |
| Attachments | list/get/add_attachment, add_issue_attachment, download_attachment | 5 |
| Search | fulltext_search | 1 |
| Deletion | preview_deletion | 1 |
| Time | log_time | 1 |
| Todos | list/get/create/update/complete/reopen/delete_todo | 7 |
| Contacts (read) | list_employees, list_persons | 2 |
| **TỔNG** | | **~102** |

### B.5. D5: Tool name prefix `huly_`

- **Status**: 🟡 Proposed
- **Risk**: 🟢
- **Context**: Skills `huly-docs`/`huly-tasks` reference MCP tool names gốc
  (`create_issue`, `list_documents`). pi tool namespace flat → risk collision.
- **Decision**: pi-huly đăng ký tool với prefix `huly_` (vd `huly_create_issue`,
  `huly_list_documents`). Skills bundle substitute tên gốc → prefixed.
- **Rationale**: User chọn prefix. Tránh collision namespace flat của pi +
  tự-document provenance (agent/user thấy `huly_` biết source). Conflict global
  skill cùng tên → pi package wins (scope precedence).
- **Alternatives**:
  - A — Giữ tên gốc (`create_issue`) không prefix — pro: skill zero-change,
    con: collision risk (flat namespace), khó trace tool source.
  - B — Tên hoàn toàn khác (`pm_create_task`) — pro: semantic, con: skill
    rewrite lớn, mất parity mental model với huly-mcp.
- **Consequences**: Phải adapt 2 skills (substitute `create_issue` →
  `huly_create_issue` v.v.). Verify Bước 7 (skill interlink đúng prefixed name).

### B.6. D6: Subagent via pi-subagents (compatible, no bundle)

- **Status**: 🟡 Proposed
- **Risk**: 🟡
- **Context**: project-design/task-implement dispatch subagent
  (research/audit/bulk/cross-review). User chỉ định: subagent dùng
  `pi-subagents` ext, personality lấy từ `agency-agents`.
- **Decision**: pi-huly KHÔNG tự ship subagent personality. Khai báo
  **compatibility** với `pi-subagents` — huly tools available cho subagent
  dispatched. agency-agents personalities dùng làm source (user tự cài/convert
  sang pi-subagent format). pi-huly doc hướng dẫn setup.
- **Rationale**: Không nhân bản agency-agents (169+ agents, cập nhật liên
  tục). Tách bạch: pi-huly = tools+skills, agency-agents = personalities. Tránh
  duplication + maintenance.
- **Alternatives**:
  - A — Bundle subset agency-agents đã convert — pro: ready-to-use, con: freeze
    snapshot, lag upstream, tăng package size, trùng cài đặt.
  - B — Ship custom Huly-aware subagent riêng — pro: tuned, con: reimplement
    personalities đã có ở agency-agents.
- **Consequences**: Depends on `pi-subagents` (peer/sibling). Doc setup
  agency-agents → pi-subagent convert. Verify tool access cross subagent
  boundary Bước 4.

### B.7. D7: Goal = Production

- **Status**: 🟡 Proposed
- **Risk**: 🟢
- **Context**: User chọn Production (full hardening).
- **Decision**: Production-ready: error handling, reconnect, secret handling
  (KHÔNG log token/password), tests, docs. Không skip hardening.
- **Rationale**: User explicit.
- **Alternatives**: PoC (skip hardening) — rejected.
- **Consequences**: Effort cao hơn. Testing + security (Bước 8) bắt buộc.

### B.8. D8: Config — global-only, cwd project binding (credentials + config)

- **Status**: 🟡 Proposed
- **Risk**: 🟡
- **Context**: User có nhiều Huly workspace (mỗi workspace own token) + nhiều
  local project (repo) cần bind tới workspace + Huly tracker project cụ thể.
  Cần lưu optimal (không lặp, không leak), auto-resolve từ cwd. Same-name
  diff-URL phải xử lý (2 Huly instance có workspace cùng tên).
- **Decision**: **Global-only** `~/.pi/agent/huly/`, 2 file tách secret/non-secret,
  KHÔNG env, KHÔNG project-local override:

  ```json
  // credentials.json (secret, chmod 600) — auth union: token OR email/password
  {
    "version": 1,
    "workspaces": {
      "myteam": {
        "url": "...",
        "workspace": "myteam",        // BẮT BUỘC — Huly workspace name (cho connect)
        "token": "..."                  // auth option A: token
      },
      "corp-prod": {
        "url": "...",
        "workspace": "corp",           // BẮT BUỘC (khác id khi same-name diff-URL)
        "email": "...", "password": "..."  // auth option B: email+password
      }
    }
  }
  // config.json (non-secret) — transport toggle + cwd project binding
  {
    "version": 1,
    "transport": "ws",                  // "ws" (default, persistent pool) | "rest" (stateless)
    "projects": {
      "/abs/project/path": { "workspace": "<id-handle>", "project": "<huly-id>" }
    },
    "pool": { "maxSize": 8 }             // ws only
  }
  ```

  - **credentials key = `id` handle** (local label, default = workspace name).
  - **`workspace` field BẮT BUỘC** — Huly workspace name truyền cho api-client
    `connect`/`connectRest` (mọi auth method đều cần). **KHÔNG optional.**
    **Same-name diff-URL** → id distinct (vd `corp-prod`), `workspace` giữ tên
    Huly thật (`corp`).
  - **auth = union**: mỗi entry `{url, workspace}` + (`{token}` XOR
    `{email,password}`). `/huly init` cho user **chọn** method (token |
    email/password). api-client `connect` hỗ trợ cả 2.
  - **transport = global toggle** (config.json `transport`): `ws` (default,
    `connect` persistent + pool) | `rest` (`connectRest` stateless, no pool).
  - **config.json `projects`**: cwd (longest-prefix) → {workspace id, project}.
  - **Resolution chain**: per-call `workspace?`/`project?` param > cwd-map
    (config.json) > interactive `/huly init` prompt.
  - Secret (token/password) CHỈ credentials.json. ws = connection cached pool;
    rest = stateless client (no persistent conn).
- **Rationale**: Global-only = đơn giản, không env sprawl, không commit risk.
  Secret/non-secret tách bạch. cwd auto-resolve = zero-config day-to-day.
  id-handle + `workspace` field xử lý same-name diff-URL rõ ràng.
- **Alternatives**:
  - A — Env vars (HULY_TOKEN/URL/WORKSPACE) — pro: CI-friendly, con: 1
    workspace, không cwd-bind, secret trong env.
  - B — pi auth.json provider model — pro: reuse pi infra, con: auth.json cho
    model provider, không fit Huly semantic.
  - C — Single file `~/.pi/agent/huly.json` (path→full binding incl token) —
    pro: đơn giản nhất, con: token duplicate nếu workspace share nhiều project.
  - D — Project-local `.pi/huly/` override — pro: per-repo, con: phức tạp,
    secret commit risk.
- **Consequences**: 2 file global. credentials = chmod 600, KHÔNG log token,
  `.gitignore`. Tool schema thêm `workspace?`/`project?` param (optional).
  Verify Bước 4 (connection pool, cwd resolver), Bước 8 (secret handling).

### B.9. D9: Delete safety — confirm-before-delete

- **Status**: 🟡 Proposed
- **Risk**: 🟢
- **Context**: Huly KHÔNG soft-delete — `delete_issue`/`delete_document`/
  `delete_milestone`/`delete_project`/`delete_component` permanent. Agent có
  thể delete nhầm.
- **Decision**: Tool delete* gọi `ctx.ui.confirm("Xóa <obj>?", detail)` trước
  khi thực hiện. Có `preview_deletion` available cho agent audit cascade.
  KHÔNG có read-only mode toggle (giữ lean).
- **Rationale**: User chọn confirm-only. Huly permanent = cần gate. Không
  read-only mode (YAGNI — thêm sau nếu cần).
- **Alternatives**:
  - A — Cả confirm + read-only mode — pro: linh hoạt, con: phức tạp, chưa cần.
  - B — Không safeguard — pro: agent flow không chặn, con: rủi ro delete nhầm
    không undo.
- **Consequences**: Delete tool chặn flow (đợi user confirm). Non-TUI mode
  (print/json) → confirm no-op hoặc auto-deny (Bước 6). Bước 8 threat model:
  repudiation/tampering mitigation.

### B.10. D10: Client layer — reimplement thin trên api-client

- **Status**: 🟡 Proposed
- **Risk**: 🔴 (effort/risk cao)
- **Context**: 3 cách build client (connect/retry/markup/browse-URL): vendor
  huly-mcp `src/huly/` (MIT, Effect runtime), reimplement thin, hoặc depend
  huly-mcp làm lib.
- **Decision**: **Reimplement thin** trên `@hcengineering/api-client`. Tự
  viết: WS connect/pool, retry w/ backoff, error classification. Markup:
  **parser** dùng `@hcengineering/text-markdown` (`markdownToMarkup`/
  `markupToMarkdown`, cả 2 chiều — verified export). **Native-ref transform**
  (browse-URL ↔ md link: `transformMarkupNodeNativeReferenceLinks` +
  `markupNodeToMarkdownString`) = **huly-mcp custom (MIT)**, KHÔNG text-markdown
  built-in → reimplement HOẶC vendor 2 func (MIT attribution). KHÔNG Effect
  runtime, KHÔNG vendor toàn bộ huly-mcp.
- **Rationale**: User chọn reimplement. Lợi: lean (no Effect dep), full
  control, không phụ thuộc internal API huly-mcp. Chi phí: phải tự build markup
  conversion (huly-mcp dùng `@hcengineering` markup utils — có thể dùng utils
  đó, chỉ bỏ wrapper Effect) + retry + error map.
- **Alternatives**:
  - A — Vendor huly-mcp `src/huly/` (MIT) — pro: proven, reuse, con: Effect
    runtime nặng, internal API fragile.
  - B — Depend `@firfi/huly-mcp` làm lib — pro: zero rewrite, con: KHÔNG public
    API, violates D1 spirit (phụ thuộc MCP package).
- **Consequences**: Effort Bước 3-4: WS pool/retry/error map + **native-ref
  transform reimplement** (parser dùng text-markdown sẵn — verified export cả 2
  chiều). Risk: native-ref round-trip fidelity (md link `?_class&_id&_label` ↔
  native ref). Bước 4 verify round-trip test. Bước 8 test markup edge cases
  (tables/code/HTML/Mermaid).
- **Note**: `@hcengineering/*` publish **public trên npmjs.org** (KHÔNG cần
  GitHub Packages token — verified 2026-07-27, version 0.7.423). ADR cũ (GitHub
  token install) đã sai thực tế. Mitigation: install trực tiếp từ npmjs.org,
  bundle @hcengineering vào dist (NFR-06 consumer no token needed).

### B.11. D11: Unified `/huly` command (git-like subcommands)

- **Status**: 🟡 Proposed · **Supersedes**: D13
- **Risk**: 🟢
- **Context**: User cần onboard (bind project), check status, manage workspace,
  link/unlink cwd. 3 command tách (`/huly`, `/huly-status`, `/huly-workspace`)
  trùng lặp chức năng, rối.
- **Decision**: **1 unified command `/huly`** git-like subcommands:
  - `/huly` (no arg) — smart: cwd bound → status; unbound → init flow.
  - `/huly init` — setup/bind cwd (prompt workspace name → check trùng (same-name diff-URL
    disambiguate) → add nếu mới → verify token → list_projects → link/create project → bind
    config.json `projects[cwd]`).
  - `/huly status` — diagnostics (connection, current binding, user, token verify, version).
  - `/huly workspace list|add|remove` — global workspace CRUD.
  - `/huly link [ws] [project]` — bind cwd (manual).
  - `/huly unlink` — remove cwd binding.
- **Rationale**: Git-like = quen thuộc, 1 entrypoint, subcommand rõ chức năng.
  Smart `/huly` = onboard 1 bước. Fold diagnostics (D13) vào `/huly status`.
- **Alternatives**:
  - A — 3 command tách (`/huly` setup, `/huly-status`, `/huly-workspace`) —
    pro: tách bạch, con: trùng lặp, rối.
  - B — 2 command (`/huly` smart + `/huly-workspace`) — pro: ít hơn, con: vẫn
    2 entrypoint.
- **Consequences**: 1 command registration (Bước 6) với subcommand dispatch.
  Replaces D13 (diagnostics fold vào `/huly status`).

### B.12. D12: TUI render — hybrid

- **Status**: 🟡 Proposed
- **Risk**: 🟢
- **Context**: Tool result render trong TUI. Custom render = UX đẹp nhưng
  effort. Default text = lean.
- **Decision**: **Hybrid** — custom render cho 3 high-value tools:
  `huly_get_issue` (issue card: id/title/status/labels/assignee/milestone),
  `huly_list_issues` (compact table), `huly_get_document` (title + first lines
  preview). Default text cho ~99 tool còn lại.
- **Rationale**: User chọn hybrid. Focus effort vào tool agent/user xem nhiều
  (issue/doc). Default text OK cho create/update/delete (chỉ cần confirm text).
- **Alternatives**:
  - A — Default text toàn bộ — pro: lean, ship nhanh, con: issue/doc khó đọc.
  - B — Custom render toàn bộ — pro: UX premium, con: effort cao, phần lớn
    tool default text đủ.
- **Consequences**: 3 tool cần `renderResult` impl (Bước 4). `@earendil-works/
  pi-tui` component (Text/Box). Verify Bước 7.

### B.13. D13: ~~`/huly` diagnostics command~~ — Superseded by D11

- **Status**: 🕳️ Superseded by D11
- **Superseded by**: D11
- **Ghi chú**: Diagnostics fold vào `/huly status` subcommand (D11 unified
  command). Giữ ADR cho audit trail.

### B.14. D14: Subagent — shared connection pool

- **Status**: 🟡 Proposed
- **Risk**: 🟢
- **Context**: pi-subagents dispatch subagent (research/audit/bulk). Subagent
  có cần connection Huly riêng hay share parent?
- **Decision**: **Shared pool** — 1 connection pool module-level (keyed by
  workspace). Subagent (pi-subagents, cùng process, forked context) reuse
  connection parent. Cleanup `session_shutdown`.
- **Rationale**: User chọn shared. Tiết kiệm connection + auth overhead. pi-
  subagents chạy cùng process (forked context) → share module state OK.
- **Alternatives**:
  - A — Per-subagent isolate — pro: isolation cao, con: nhiều connection + auth
    overhead, phức tạp lifecycle.
- **Consequences**: Connection pool = module singleton (không per-session).
  Concurrency: multiple tool call share connection — verify thread-safety
  (Huly WS có thể multiplex request). Bước 4 verify. Fold vào D3/D6.

### B.15. D15: Auto-resolve currentUser cho default assignee

- **Status**: 🟡 Proposed
- **Risk**: 🟢
- **Context**: Tool cần assignee (create_issue assignee?, claim, log_time owner,
  add_comment owner). User không muốn nhập tay mỗi lần — muốn auto-resolve
  "chính mình".
- **Decision**: On connect, fetch currentUser (get_user_profile) → cache per
  workspace connection. Tool `assignee?` param absent → default
  `getCurrentUser().email`. `assignee` present → validate + lookup
  (`list_employees`). KHÔNG store user name trong credentials.json (single
  source = Huly).
- **Rationale**: User directive "tự resolve name để gán assignee". Tránh nhập
  tay; single source = Huly (KHÔNG stale stored name). Email format preferred
  (match huly-tasks assignee format).
- **Alternatives**:
  - A — Require explicit assignee every call — pro: explicit, con: repetitive,
    user phải biết email/format mỗi lần.
  - B — Store user name trong credentials.json — pro: không cần fetch, con:
    stale (đổi name trên Huly → desync), duplicate source.
- **Consequences**: Component `client/assignee.ts` (Bước 4). getCurrentUser
  cached on connect (pool). Map tới huly-tasks skill `getCurrentUser()`.

---

## Coverage preview (ADR → Bước kế)

Mọi ADR trace tới requirement/Bước kế sẽ chốt ở Bước 2 (Coverage Matrix):

| ADR | Bước kế ảnh hưởng |
|---|---|
| D1, D10 | Bước 3 (tech stack), Bước 4 (client impl) |
| D3, D8, D14, D15 | Bước 4 (connection pool, credential resolution, assignee) |
| D4, D5 | Bước 4 (tool registration), Bước 6 (schema), Bước 9 (task breakdown) |
| D6 | Bước 4 (subagent compat), Bước 9 |
| D9, D11, D12, D13 | Bước 6 (commands, render, confirm) |
| D2, D7 | Bước 8 (security, SLO), Bước 10 (deploy) |

---

_Exit criteria Bước 1: mọi 🔴🟡 đã có ≥2 alternatives + context. D1🔴, D10🔴,
D3🟡, D6🟡, D8🟡, D15🟡 — tất cả có alternatives. Cần user chốt Phase Gate sau
Bước 2._
