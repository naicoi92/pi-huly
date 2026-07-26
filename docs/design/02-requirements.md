# pi-huly — Requirements & User Stories

> Bước 2/10. Trace 15 ADR (xem [01 - Vision & Decision Log](./01-vision.md))
> → testable requirements. Phase WHAT chốt. Phase HOW → Bước 3+.

## 1. User Stories

| ID | Story | Priority | ADR ref |
|---|---|---|---|
| US-01 | Là pi user, tôi muốn tools Huly **native trong pi** (không MCP server riêng) để thao tác Issues/Documents ngay trong coding session | 🔴 | D1 |
| US-02 | Là pi user có **nhiều Huly workspace**, tôi muốn lưu token mỗi workspace optimal + switch qua command để không edit env mỗi lần | 🔴 | D8, D11 |
| US-03 | Là runner workflow `project-design`, tôi muốn DocStore=Huly + TaskStore=Huly hoạt động qua pi-huly (skills đi kèm) để thiết kế dự án end-to-end trên Huly | 🔴 | D5, D6 |
| US-04 | Là runner `task-implement`, tôi muốn issue lifecycle đầy đủ (status, comment, time, todo, attachment, relation) để triển khai task theo state machine | 🔴 | D4 |
| US-05 | Là runner `milestone-implement`, tôi muốn bulk tạo issues + milestones + DAG (blocks/blocked-by) + parent-child để triển khai cả milestone | 🟡 | D4 |
| US-06 | Là orchestrator dispatch subagent, tôi muốn huly tools **available cho subagent** (shared connection pool) để research/audit/bulk issue chạy song song | 🟡 | D6, D14 |
| US-07 | Là pi user, tôi muốn **confirm trước khi delete** (Huly KHÔNG soft-delete) để tránh mất data vĩnh viễn | 🔴 | D9 |
| US-08 | Là pi user onboard/debug, tôi muốn command `/huly` kiểm tra connection + workspace + token để verify setup nhanh | 🟡 | D13 |
| US-09 | Là pi user **self-host Huly**, tôi muốn pi-huly target self-host (không SaaS sắp chết) để đầu tư công cụ bền | 🔴 | D2 |
| US-10 | Là pi user, tôi muốn issue/doc **render đẹp trong TUI** (card/table/preview) để đọc nhanh không phải parse text | 🟢 | D12 |
| US-11 | Là pi user, tôi muốn **markdown round-trip** đúng (doc content, issue description) để format không hỏng khi sync Huly ↔ pi | 🔴 | D10 |
| US-12 | Là pi user, tôi muốn tool **fail rõ ràng** (Huly unreachable, token hết hạn, workspace sai) để debug không đoán mò | 🟡 | D10 |

## 2. Functional Requirements

| ID | Requirement (testable) | User story | Verify | ADR ref |
|---|---|---|---|---|
| FR-01 | Package cài được qua `pi install npm:<pkg>` HOẶC `pi install git:...`, `pi list` hiển thị, extension load không error | US-01 | `pi install` + `pi list` + session_start log | D1 |
| FR-02 | Extension đăng ký **~102 tools** với prefix `huly_` (vd `huly_create_issue`); `pi.getAllTools()` trả đủ | US-01, US-04, US-05 | Đếm tool đăng ký = ~102, prefix đúng | D4, D5 |
| FR-03 | Mỗi tool gọi Huly qua **WebSocket** `@hcengineering/api-client` (`connect`), KHÔNG qua MCP | US-01 | Inspect: không spawn process MCP, dùng WS transport | D1, D3, D10 |
| FR-04 | **19 domain include** có full CRUD (list/get/create/update/delete + domain-specific); skip list (recruiting/inventory/...) KHÔNG có tool | US-04, US-05 | Audit tool list vs D4 table (01-vision) | D4 |
| FR-05 | **Config global-only** 2 file: `credentials.json` (secret, chmod 600, auth union `{workspaces:{<id>:{url,workspace,(token \| email+password)}}}` — workspace BẮT BUỘC) + `config.json` (non-secret, `{transport:"ws"\|"rest",projects:{<path>:{workspace,project}},pool}`). KHÔNG env, KHÔNG project-local | US-02 | Tạo 2 file, verify schema auth-union + workspace-required | D8, D3 |
| FR-06 | **Resolution chain** (no env): per-call `workspace?`/`project?` param > **cwd-map** (config.json `projects`, longest-prefix) > interactive `/huly init`. Same-name diff-URL → disambiguate url. Secret (token/password) CHỈ credentials.json | US-02 | Test từng tier override + same-name diff-URL | D8, D11, D14 |
| FR-07 | **Unified `/huly` command** (git-like subcommands): `/huly` (smart bound→status/unbound→init), `/huly init` (setup/bind cwd), `/huly status` (diagnostics), `/huly workspace list\|add\|remove`, `/huly link [ws] [project]`, `/huly unlink` | US-02, US-08 | Gọi mỗi subcommand, verify | D11 |
| FR-08 | `/huly status` subcommand (connection check, current binding, user, token verify, version) — fold vào unified command | US-08 | `/huly status`, verify output | D11 |
| FR-09 | Tool destructive (`delete_issue/document/milestone/project/component`, `remove_*`) gọi `ctx.ui.confirm` trước khi thực hiện; non-TUI mode → auto-deny hoặc env override | US-07 | Tool delete → confirm prompt; deny → không xóa | D9 |
| FR-10 | Skills `huly-docs` + `huly-tasks` **bundled**, adapted (reference `huly_<tool>` prefixed, bỏ "MCP server @firfi/huly-mcp") | US-03 | Skill load, grep không còn "MCP server" | D5, D6 |
| FR-11 | pi-subagents dispatch subagent → huly tools callable, **shared connection pool** (không reconnect per subagent) | US-06 | Dispatch subagent gọi huly tool, verify 1 connection | D6, D14 |
| FR-12 | Connection pool keyed by workspace: lazy connect, auto-reconnect w/ backoff, cleanup all `session_shutdown` | US-01, US-12 | Drop network → reconnect; session_shutdown → close | D3, D14 |
| FR-13 | **Markdown ↔ Huly markup** round-trip: doc content + issue description, browse-URL native reference link ↔ markdown link | US-11 | Round-trip test (md→markup→md), browse-URL detect | D10 |
| FR-14 | Tool fail với **error class rõ** (Auth/Connection/NotFound/Conflict/Internal/External), KHÔNG leak token/impl detail | US-12 | Trigger mỗi error, verify message | D10 |
| FR-15 | Config `huly.app` URL → **warn** + link migrate guide; KHÔNG block (chỉ cảnh báo) | US-09 | Set url=huly.app → warning | D2 |
| FR-16 | TUI custom render cho `huly_get_issue` (card), `huly_list_issues` (table), `huly_get_document` (preview); default text cho còn lại | US-10 | Render 3 tool trong TUI | D12 |
| FR-17 | Bổ sung tool nếu api-client support operation cần mà huly-mcp chưa expose (escape hatch) | US-04, US-05 | Doc process thêm tool | D4 |
| FR-18 | Tool có `assignee?`/`owner?` (create_issue, claim, log_time, add_comment) **auto-resolve currentUser (email)** khi absent; present → validate + lookup `list_employees`. KHÔNG store user name trong credentials.json (single source = Huly) | US-02 | assignee absent → getCurrentUser().email; present → validate | D15 |
| FR-19 | **Transport global toggle** (config.json `transport`): `ws` (`connect` persistent + pool) \| `rest` (`connectRest` stateless). Cả 2 cùng HulyClient interface. Default `ws` | US-01 | Set transport=ws/rest, verify connect/connectRest | D3 |
| FR-20 | **Auth union** `/huly init` cho user **chọn**: token HOẶC email+password. api-client `connect` hỗ trợ cả 2. Lưu method per workspace entry | US-02 | init chọn từng method, verify connect | D8 |

## 3. Non-Functional Requirements

| ID | Category | Requirement | Metric | ADR ref |
|---|---|---|---|---|
| NFR-01 | Performance | Tool call latency: **ws** p95 < 500ms (warm), **rest** p95 < 800ms (self-host LAN) | p95 per transport | D3 |
| NFR-02 | Performance | Context footprint — strategy giữ system prompt gọn với ~102 tools (dynamic loading / grouped snippet) | system prompt +tool section < 8KB | D4, D5 |
| NFR-03 | Reliability | Auto-reconnect WS + retry idempotent op w/ exponential backoff; error classification | reconnect < 5s, retry ≤ 3 | D3, D10 |
| NFR-04 | Security | Token/password KHÔNG log; credentials.json chmod 600; KHÔNG commit; KHÔNG trong error response | grep token trong log = 0 | D8, D9 |
| NFR-05 | Compatibility | pi-coding-agent latest stable, **Node 24 LTS** (min `>=22.19.0` per pi engine), `@hcengineering/*` 0.7.x, self-host Huly current | matrix test | D2, D10 |
| NFR-06 | Installability | npm publish + `pi install`; `@hcengineering` GitHub Packages token documented; prepack build sạch | `pi install` fresh env OK | D1, D10 |
| NFR-07 | Maintainability | Test: unit (markup, retry, resolver) + integration (mock Huly WS server); CI fmt+lint+test | coverage ≥ 80% core | D7, D10 |
| NFR-08 | Observability | Structured log (workspace, tool, latency, error class); KHÔNG PII/secret; connection status visible | log schema | D3, D8 |
| NFR-09 | Robustness | Huly unreachable / token expired / workspace not found → clear error + recovery hint, KHÔNG crash session | fault injection | D10 |
| NFR-10 | Safety | Destructive op gated (FR-09); `preview_deletion` available; idempotent create (`create_issue_status` idempotent) | — | D9, D4 |
| NFR-11 | Scalability | Connection pool giới hạn (≤ N workspace connect đồng thời); LRU evict if vượt | default ≤ 8 | D3, D14 |

## 4. Coverage Matrix (ADR ↔ Requirement)

> Mọi ADR phải có ≥1 requirement affected. Requirement không link ADR = kiểm tra lại.

| ADR | Requirement affected |
|---|---|
| D1 (native/no-MCP) | FR-01, FR-03, NFR-06 |
| D2 (self-host) | FR-15, NFR-05 |
| D3 (Transport ws\|rest) | FR-03, FR-05, FR-12, FR-19, NFR-01, NFR-03, NFR-08, NFR-11 |
| D4 (~102 tools) | FR-02, FR-04, FR-17, NFR-02, NFR-10 |
| D5 (`huly_` prefix) | FR-02, FR-10, NFR-02 |
| D6 (pi-subagents compat) | FR-10, FR-11 |
| D7 (Production) | NFR-07 |
| D8 (config global + auth union) | FR-05, FR-06, FR-20, NFR-04, NFR-08 |
| D9 (confirm-delete) | FR-09, NFR-04, NFR-10 |
| D10 (reimplement thin) | FR-03, FR-13, FR-14, NFR-03, NFR-05, NFR-07, NFR-09 |
| D11 (unified /huly cmd) | FR-06, FR-07, FR-08 |
| D12 (TUI hybrid) | FR-16 |
| D13 (Superseded by D11) | — |
| D14 (shared pool) | FR-06, FR-11, FR-12, NFR-11 |
| D15 (auto-resolve assignee) | FR-18 |

**Check**: 15 ADR, tất cả có ≥1 requirement. 20 FR + 11 NFR, tất cả link ADR. Không requirement mồ côi. ✓

## 5. Open cho Bước 3+ (HOW — không phải requirement)

- Tool registration strategy cụ thể (register-all vs dynamic loading) → Bước 4 (NFR-02 flag).
- Markup conversion impl (vendor `@hcengineering` utils vs reimplement) → Bước 3/4.
- Error taxonomy chi tiết (HTTP-style codes, retry policy per class) → Bước 4.
- SLO số cụ thể + alerting + runbook → Bước 8.
- Version pin chính xác (`@hcengineering/*`, Node, pi) → Bước 3.

---

_Exit criteria Bước 2: mọi FR/NFR có ADR ref ✓; Coverage Matrix đầy đủ (mọi ADR ≥1 requirement affected) ✓._
