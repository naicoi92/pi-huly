# T-34 — Implement Plan: skills/huly-docs + skills/huly-tasks adapted

> **Task**: [T-34] [M] high priority — skills/huly-docs + skills/huly-tasks adapted
> (substitute `huly_` prefix, drop `@firfi/huly-mcp` MCP refs, keep structure).
> **Milestone**: M4 Skills. **Blocked-by**: T-33 (✅ done). **Blocks**: T-36.
> **Source skills**: `~/.agents/skills/huly-docs/`, `~/.agents/skills/huly-tasks/`.
> **Target**: `/Users/naicoi/Projects/lttech/pi-huly/skills/{huly-docs,huly-tasks}/`.

## 1. Mục tiêu

Bundle 2 skills (`huly-docs`, `huly-tasks`) vào pi-huly package, adapted cho native
pi-huly runtime (KHÔNG MCP). Skills load declarative qua `package.json` manifest
`pi.skills: ["./skills"]` (design 04-system.md §"Package manifest" + index.ts
comment line 313). DoD M4: **skill load, `huly_` prefixed names, no MCP refs**.

## 2. Phân tích skill gốc → adaptation

### Quy tắc adaptation chung (apply cho cả 2 skills)

| Element gốc | Adaptation | Lý do |
|---|---|---|
| Tool name gốc (vd `create_issue`) | `huly_<tên>` (vd `huly_create_issue`) | D5 prefix (01-vision §B.5), builder.ts:178 tự thêm prefix |
| `@firfi/huly-mcp` MCP server refs | **DROP hoàn toàn** | DoD M4: no MCP refs. pi-huly native, không MCP |
| `MCP tool` / `MCP client` / `MCP server` | Replace → `huly tool` / `pi-huly` / `extension` | Native runtime vocab |
| `get_huly_context` diagnostic (MCP built-in) | Replace → `/huly status` command | pi-huly có command riêng (T-31) |
| File `references/huly-mcp-setup.md` | **DROP file**, replace bằng `references/pi-huly-setup.md` ngắn | ISSUE-A audit: file MCP setup không còn giá trị |
| Verify trước khi dùng qua MCP diagnostic | Replace → `/huly status` + check config exists | Native flow |
| Param inconsistency `identifier` vs `issueIdentifier` | **GIỮ NGUYÊN** (gotcha value cao) | pi-huly bundle inherit schema từ @hcengineering, same inconsistency |
| Bảng params reference | Substitute prefix tool + drop MCP meta-context | Còn valid cho native tools |

### 2.1. huly-docs

**Files gốc** (3): `SKILL.md`, `references/doc-format.md`, `references/huly-mcp-setup.md`.

| File | Action | Chi tiết |
|---|---|---|
| `SKILL.md` | Adapt | Substitute tool names → `huly_` prefix (~21 tool refs). Drop MCP refs (lines 3,10,29,42,138). Replace frontmatter description "qua MCP server @firfi/huly-mcp" → "qua native huly tools". Replace `get_huly_context` → `/huly status`. Section "Yêu cầu: MCP server đã config" → "Yêu cầu: extension pi-huly đã cài + `/huly init` đã bind workspace". Progressive disclosure: thay `references/huly-mcp-setup.md` → `references/pi-huly-setup.md`. |
| `references/doc-format.md` | Adapt | Substitute tool names → `huly_` prefix (~8 refs). Content markdown conventions GIỮ NGUYÊN (Huly Documents render behavior không đổi). Bảng "Khi nào dùng create_document vs edit_document" → prefix. |
| `references/huly-mcp-setup.md` | **DROP**, replace | ISSUE-A: Toàn file là MCP server config (env vars, TOOLSETS, ZCode MCP client). Native pi-huly KHÔNG cần — extension tự kết nối WS qua config từ `/huly init`. Replace bằng `references/pi-huly-setup.md` ngắn: hướng dẫn `pi install pi-huly` + `/huly init` (auth choice, workspace binding) + verify `/huly status`. |

### 2.2. huly-tasks

**Files gốc** (4): `SKILL.md`, `references/huly-mcp-params.md`, `references/task-format.md`, `references/huly-mcp-setup.md`.

| File | Action | Chi tiết |
|---|---|---|
| `SKILL.md` | Adapt | Substitute tool names → `huly_` prefix (~71 refs). Drop MCP refs (lines 3,10,27,37,266). Frontmatter description adapt. Section "Yêu cầu: MCP server đã config" → extension setup. Replace `get_huly_context` → `/huly status`. Progressive disclosure: rename `huly-mcp-params.md` → `huly-tool-params.md`, `huly-mcp-setup.md` → `pi-huly-setup.md`. |
| `references/huly-mcp-params.md` → `huly-tool-params.md` | Adapt (rename + content) | ISSUE-C: Nặng nhất — ~44 tool refs + 2 MCP refs (lines 3,298). Substitute prefix toàn bộ. Header adapt "verified schema từ @firfi/huly-mcp dist bundle" → "verified schema từ pi-huly bundle". Rename file. Param inconsistency section GIỮ (value cao). |
| `references/task-format.md` | Adapt | Substitute tool names → `huly_` prefix (~57 refs). MCP ref line 395 drop. Issue format, label namespace, 2 relations systems, lifecycle — content GIỮ NGUYÊN (Huly Issues behavior không đổi). |
| `references/huly-mcp-setup.md` | **DROP**, replace | Same as huly-docs ISSUE-A. Native pi-huly setup. |

## 3. Plan implementation (TDD-ish cho docs)

> Skills là declarative markdown — KHÔNG có code logic test được trực tiếp.
> Verification = (a) lint markdown pass, (b) structural assertions (no MCP refs,
> tool names prefixed, all `huly_<name>` resolve to real bundle tool), (c) visual
> review subagent. DoD M4 spec: "skill load, prefixed names, no MCP refs" →
> 3 automated checks cover exact DoD.

### Phase 1: Scaffold skills/ folder structure

1. Tạo `/Users/naicoi/Projects/lttech/pi-huly/skills/huly-docs/` +
   `skills/huly-docs/references/`.
2. Tạo `/Users/naicoi/Projects/lttech/pi-huly/skills/huly-tasks/` +
   `skills/huly-tasks/references/`.

### Phase 2: huly-docs adapted (3 files)

3. Viết `skills/huly-docs/SKILL.md` (adapt từ gốc — substitute prefix, drop MCP,
   adapt frontmatter + setup section + progressive disclosure refs).
4. Viết `skills/huly-docs/references/doc-format.md` (adapt — substitute prefix,
   keep content conventions).
5. Viết `skills/huly-docs/references/pi-huly-setup.md` (replace MCP setup —
   native pi-huly setup flow: `pi install` + `/huly init` + `/huly status`).

### Phase 3: huly-tasks adapted (4 files)

6. Viết `skills/huly-tasks/SKILL.md` (adapt — substitute prefix, drop MCP,
   adapt frontmatter + setup + progressive disclosure refs).
7. Viết `skills/huly-tasks/references/huly-tool-params.md` (adapt+rename từ
   `huly-mcp-params.md` — substitute prefix, drop MCP meta).
8. Viết `skills/huly-tasks/references/task-format.md` (adapt — substitute prefix,
   drop MCP, keep format content).
9. Viết `skills/huly-tasks/references/pi-huly-setup.md` (replace MCP setup).

### Phase 4: DoD verification (5 automated checks — covers exact DoD M4)

> Check #1 + #2 + #2b cover literal DoD M4 ("no MCP refs", "prefixed names",
> "skill load"). Check #3 + #4 là structural/quality. Check #5 là visual review.

10. **Check #1 (no MCP refs — expanded pattern)**: grep toàn `skills/` cho pattern
    tích cực MCP (positive refs, KHÔNG phải negation "KHÔNG dùng MCP"):
    ```
    @firfi/huly-mcp|firfi/huly-mcp|huly-mcp@latest|huly-mcp (bin)
    | github\.com/dearlordylord/huly-mcp
    | MCP server|MCP client|MCP tool|MCP_TRANSPORT|HULY_TOOL_MODE
    | get_huly_context|TOOLSETS|mcpServers|invoke_tool
    | list_tool_categories|search_tools|get_tool_schema
    | HULY_URL|HULY_EMAIL|HULY_PASSWORD|HULY_TOKEN|HULY_WORKSPACE
    | HULY_ACCOUNTS_URL|HULY_FRONT_URL|HULY_CONNECTION_TIMEOUT
    | "npx -y @firfi|claude mcp (remove|add)"
    ```
    → **MUST return 0 matches**. Allowlist: negation prose ("KHÔNG dùng MCP",
    "no MCP", "drop MCP", "native (KHÔNG MCP)") — OK.

11. **Check #2 (prefixed tool names — bare name)**: grep `skills/` cho bare tool
    name pattern (backtick-wrapped hoặc code-block, KHÔNG preceded bởi `huly_`)
    → **MUST return 0 matches**. Strategy: extract tool name gốc list từ
    `src/tools/domains/*.ts` (`name: "..."`), build alternation regex, verify
    mỗi occurrence trong skills preceded bởi `huly_`. Allowlist: prose tự nhiên
    ("create a new issue" KHÔNG phải tool call — KHÔNG trong backticks).

12. **Check #2b (positive tool resolution — orphan catch)**: extract mọi token
    `huly_<word>` trong `skills/**/*.md`, verify mỗi cái resolve thành tool thật
    trong bundle (extract từ `src/tools/domains/*.ts`). Mismatches (vd
    `huly_get_huly_context`, `huly_list_inline_comments`) → **MUST report + fix**.
    Catches refs tới tools KHÔNG tồn tại trong pi-huly bundle.

13. **Check #3 (skill load + structure + manifest)**: verify
    `skills/huly-docs/SKILL.md` + `skills/huly-tasks/SKILL.md` tồn tại + có
    frontmatter `name:` valid (huly-docs / huly-tasks — KHÔNG `huly_docs` /
    `huly_tasks`, fix `R-frontmatter-name-collision` risk) + có ít nhất 1
    reference file. Verify package.json `pi.skills: ["./skills"]` + `files`
    bao gồm `skills`.

14. **Check #4 (markdown lint)**: **DECISION: add `skills/**/*.md` vào globs**
    trong `.markdownlint-cli2.jsonc` (scope update — OUT-OF-SCOPE §6 amended).
    Lý do: skills là shipped artifact, phải lint consistency. Sau update globs,
    `pnpm run lint:md` pass. Fix iteratively (line-length 120, blank lines).

15. **Check #5 (visual review)**: dispatch subagent `code-review-mentor` review
    skills — check clarity, consistency, no broken cross-refs (đặc biệt sau
    rename `huly-mcp-params.md` → `huly-tool-params.md`, drop `huly-mcp-setup.md`
    → `pi-huly-setup.md`), DoD met. Trả rõ approve/reject.

### Phase 5: Commit + PR

15. Commit (conventional): `[T-34] [M] skills/huly-docs + skills/huly-tasks adapted`.
16. Push branch `feat/T-34-skills-adapted` → create PR.
17. Chờ CI (fmt+lint+typecheck+test+build + markdownlint).
18. Address review feedback nếu có → merge → delete branch.

## 4. Verification checklist (DoD M4 — task-level)

- [ ] `skills/huly-docs/SKILL.md` + `references/` tồn tại, frontmatter valid
- [ ] `skills/huly-tasks/SKILL.md` + `references/` tồn tại, frontmatter valid
- [ ] Check #1: 0 MCP refs (pattern grep)
- [ ] Check #2: 0 bare tool name (tất cả `huly_` prefixed)
- [ ] Check #3: package.json manifest + structure OK
- [ ] Check #4: `pnpm run lint:md` pass
- [ ] Check #5: code-review-mentor pass
- [ ] CI green (push branch)
- [ ] PR merged to main
- [ ] TASKS.md update T-34 done

## 5. Risk / Gotchas

- **R-prefix-substitution**: regex substitute có thể miss tool name trong prose
  (vd "create a new issue" — KHÔNG phải tool call). Mitigation: manual review +
  allowlist trong check #2.
- **R-cross-ref-broken**: rename `huly-mcp-params.md` → `huly-tool-params.md`,
  drop `huly-mcp-setup.md` → `pi-huly-setup.md` → phải update cross-refs trong
  SKILL.md. Mitigation: visual review subagent catch + Check #5.
- **R-markdownlint**: skills markdown có thể vi phạm line-length 120 hoặc rules
  khác. Mitigation: Check #4 + fix iteratively.
- **R-doD-interpretation**: "no MCP refs" — phải rõ là KHÔNG reference
  `@firfi/huly-mcp` server hoặc MCP protocol vocab. Mention "KHÔNG dùng MCP" /
  "drop MCP" (negation) thì OK. Mitigation: Check #1 expanded pattern.
- **R-cross-context-ref**: skills gốc reference `project-design/references/
  adapter-contract.md`. project-design là skill shared (KHÔNG MCP), GIỮ refs.
  Mitigation: KHÔNG strip "project-design" mention — chỉ strip `@firfi/huly-mcp`.
- **R-frontmatter-name-collision**: skill `name: huly-docs` / `huly-tasks` share
  root `huly` với tool prefix `huly_<tool>`. Hyphen vs underscore tránh literal
  collision, nhưng note rõ để reviewer KHÔNG reformat thành `huly_docs`.
  Mitigation: Check #3 verify frontmatter `name:` exact.
- **R-env-leak-in-gotchas**: gotcha `HULY_FRONT_URL` trong huly-docs/SKILL.md
  (line 105-106 gốc) phải adapt sang pi-huly vocab (config via `/huly init`,
  KHÔNG env var). Mitigation: Check #1 pattern catch `HULY_FRONT_URL`.
- **R-saas-shutdown-staleness**: skills gốc có banner "SaaS ĐÃ SHUTDOWN
  2026-07-20". Hôm nay 2026-07-27 → upgrade ngôn ngữ "SaaS đã ngừng hoạt động"
  (factual, không deadline). Mitigation: adapt wording khi port.

## 6. Out of scope

- KHÔNG thay đổi source code (`src/`), chỉ thêm `skills/` folder.
- KHÔNG runtime register skills (declarative qua manifest).
- KHÔNG update package.json (đã có `pi.skills` + `files` sẵn từ T-01).
- **UPDATE: `.markdownlint-cli2.jsonc` globs** — add `skills/**/*.md` (Check #4
  requires lint coverage). Scope amendment.
- T-35 (R7 subagent smoke) — task riêng.
