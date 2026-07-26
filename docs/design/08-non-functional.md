# pi-huly — Non-Functional Deep-Dive

> Bước 8/10. 3 concern cross-cutting: Security, Observability, Testing. Trace
> [03](./03-tech-stack.md) risks (R1-R8), [04](./04-system.md).

## A. Security & Threat Model

### STRIDE

| Category | Threat | Component | Mitigation/Risk-accept |
|---|---|---|---|
| **Spoofing** | token/password bị steal → giả danh user | credentials.json | chmod 600, KHÔNG commit (.gitignore), KHÔNG log; same-name diff-URL disambiguate tránh wrong-cred |
| **Tampering** | credentials.json/config.json bị sửa | config files | atomic write; schema validate on load; reject malformed |
| **Repudiation** | delete issue/doc không audit | delete_* tools | confirm gate (FR-09) + preview_deletion; structured log (workspace, tool, identifier, ts) |
| **Info Disclosure** | token/password leak log/error/response | logs, error envelope, ToolResult | NFR-04: grep token/password trong log = 0; error map strip secret (04 §3); ToolResult `details` KHÔNG secret |
| **DoS** | flood Huly WS/REST; pool exhaust | ConnectionPool | NFR-11 pool maxSize (default 8, ws); retry cap ≤3; ws reconnect backoff; rest stateless (no pool exhaust) |
| **Elevation** | subagent (headless) escalate delete | subagent + delete tools | `ctx.hasUI===false` → confirmDestructive auto-deny (FR-09); subagent read-heavy by design |

### Attack Surface Map

- **Public**: KHÔNG (pi-huly = local extension, không expose endpoint).
- **Authenticated**: ~102 tools (LLM-callable), credentials.json (token+password
  auth union), WS/REST transport tới self-host Huly.
- **Trust boundary**: LLM → tool (validate param via typebox) · tool → Huly
  (auth via credentials) · pi ↔ extension (in-process, full trust).

### Authn/Authz Matrix

| Endpoint/Tool group | Who | What | ADR |
|---|---|---|---|
| list/get/search (read) | agent (authenticated via ws/rest) | read | D4 |
| create/update (write) | agent | write (idempotent create riêng) | D4 |
| delete_* | TUI user (confirm) — subagent headless DENY | delete (permanent) | D9 |
| /huly init/status | user (TUI) | config mutate | D11 |
| credentials.json | user (fs perms 600) | secret read/write | D8 |

### Data Sensitivity

| Field | Classification | Protection |
|---|---|---|
| token / password | 🔴 secret | credentials.json chmod 600, KHÔNG log, KHÔNG error response |
| email (assignee/currentUser) | 🟡 PII | KHÔNG log raw; map → PersonRef khi cần |
| issue/document content | 🟢 internal | log metadata only (identifier), KHÔNG full content |
| workspace url | 🟢 internal | OK log (debug) |
| Huly markup | 🟢 internal | KHÔNG log raw markup |

### Dependency CVE + license

- CI: `nub audit` (or npm audit) + license scan (R1: @hcengineering EPL/MPL
  verify Bước 10).
- R4: nub deny-by-default build scripts → `trustedDependencies` whitelist
  @hcengineering.
- Supply-chain: nub OSV advisory + minimumReleaseAge 24h (nub default).

## B. Observability & Ops

### SLO/SLI + Error Budget

| Critical UC | SLO | SLI | Error budget |
|---|---|---|---|
| tool call (ws) | success 99.5%, p95 < 500ms | success rate + latency | ~22m downtime/30d |
| tool call (rest) | success 99%, p95 < 800ms | success rate + latency | ~43m/30d (rest handshake overhead) |
| /huly init | success 99% | setup completes | — |

### Logs

- Structured (JSON), fields: `ts, workspace, tool, latency_ms, errorClass,
  identifier?`.
- Level: info (call), warn (retry/recover), error (fail).
- **KHÔNG** PII/secret (NFR-04). email → hash hoặc không log.
- Retention: session-scoped (pi session log); không persistent riêng.

### Metrics

- Counter: `huly_tool_calls_total{tool,workspace,errorClass}`,
  `huly_reconnects_total{workspace}`.
- Histogram: `huly_tool_latency_ms{tool,transport}`.
- Gauge: `huly_pool_active{workspace}` (ws).
- Cardinality budget: workspace (≤8), tool (~102), errorClass (7) — bounded.

### Distributed Tracing

- N/A (single process, không microservice). Per-tool span = log entry (ts
  start/end).

### Alerting + Runbook

- Local tool (KHÔNG ops team): alert = `ctx.ui.notify` khi error spike trong
  session + `/huly status` diagnostic.
- Runbook: `/huly status` → check connection/token/binding; rebind via
  `/huly init`.

## C. Testing Strategy

### Test Pyramid

- **unit 70%**: markup (mdToMarkup/markupToMd + native-ref transform),
  retry/backoff, error map, WorkspaceResolver/ProjectResolver (cwd
  longest-prefix), AssigneeResolver, confirmGate logic, credentials/config
  schema validate (auth union, workspace-required).
- **integration 25%**: mock Huly WS server + REST endpoint (ws-based mock);
  full tool flow (create→set→relation); transport switch (ws/rest); auth union
  (token/email-password); reconnect; pool LRU.
- **e2e 5%**: real self-host Huly (CI secret, optional/manual) — smoke ~10
  critical tools.

### Coverage

- Target: ≥ 80% core (client/markup/config/tools/builder). Commands/render
  best-effort.
- Gate: PR fail if coverage drop > 2%.

### Markup Fixture Matrix (R8)

- Round-trip fixtures: headings, lists, tables (simple/nested), code blocks,
  HTML inline, Mermaid, **native ref links** (`?_class&_id&_label`), external
  links, plain issue-key text.
- Assert: md→markup→md == original (lossless) + native ref detected on write /
  inverse on read.

### Subagent Smoke (R7)

- Test: dispatch pi-subagent subagent gọi huly tool → assert **1 connection**
  (no reconnect) [IF same-process verified].
- If R7 break (separate process): test per-subagent connect fallback.

### Contract Test

- N/A inter-service (pi-huly client of Huly). Tool schema (typebox) = contract
  cho LLM.

### Test Data

- Mock Huly: in-memory fixture (issues/docs/milestones) seeded; deterministic
  identifiers.
- Production anonymization: N/A (e2e dùng throwaway self-host workspace).

### CI Matrix

| Dimension | Values |
|---|---|
| Node | 24 LTS |
| OS | ubuntu-latest, macos-latest |
| Transport | ws, rest (parametrized) |
| Auth | token, email+password (parametrized) |
| pi-coding-agent | 0.82.1 |

### Test Ownership

- Mỗi task T-XX (Bước 9) ship kèm test (unit + integration mock). Markup
  fixtures tập trung 1 task. R7/R8 smoke test task riêng.

## D. Risk carry-forward → Bước 9/10

- R1 (license) → Bước 10 audit.
- R2 (ws native deps), R3 (rolldown externals), R4 (nub build scripts), R6 (TS
  7) → Bước 4/9 impl verify.
- R7 (subagent process) → Bước 4 smoke + fallback.
- R8 (native-ref round-trip) → markup fixture matrix (this step) + Bước 9.

## Trace

| Section | Requirement/ADR |
|---|---|
| A STRIDE | FR-09, FR-14, NFR-04, D8, D9 |
| A auth matrix | D4, D9, D11 |
| A data sensitivity | NFR-04, D8 |
| A dep CVE/license | NFR-06, R1, R4 |
| B SLO/SLI | NFR-01, NFR-03, D3 (ws/rest) |
| B logs/metrics | NFR-08 |
| C testing | NFR-07, R7, R8 |
| C CI matrix | NFR-05, D3, D8 (transport×auth) |

---

_Exit criteria Bước 8: threat model (STRIDE) có attack surface + auth matrix ✓;
data classified ✓; SLO/SLI + error budget có số ✓; alerting quy tắc ✓; test
pyramid + coverage target ✓; dep CVE/license scan plan ✓; R7/R8 test plan ✓._
