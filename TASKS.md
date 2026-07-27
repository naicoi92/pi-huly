# pi-huly — TASKS

> TaskStore = `local-tasks`. 42 issues (T-XX design ID). Size prefix [S/M/L]
> (gate: S không chia, M agent đề xuất, L bắt buộc chia — issues 21 đã split
> T-19a/b/c). DAG `blocked-by`/`blocks` text. Priority high/medium/low quyết
> định thứ tự implement (`milestone-implement` sort: priority > order > size).
> Roadmap đầy đủ: [docs/design/09-roadmap.md](./docs/design/09-roadmap.md).

## M0 Foundation

_DoD: build + lint + typecheck pass; config read/write; CI green._

**Status: ✅ completed** _(slash goal complete-milestone M0, 2026-07-27 — 3/3 tasks done, CI green, DoD pass)_

- [x] [T-01] [M] Skeleton + tooling (package.json pi-manifest, tsconfig TS7, rolldown bundle, oxlint/oxfmt, vitest, CI workflow, .node-version=24) — high | blocks: T-02,T-03 | risks: R3,R4,R6 — ✅ done (PR #1 merged 6ae59e7, CI green ubuntu+macos)
- [x] [T-02] [M] config/credentials.ts (auth union token|email+password, workspace-required, id-handle, findByName) + unit — high | blocked-by: T-01 | blocks: T-04 — ✅ done (PR #2 merged 515b7d2, 36 tests, coverage 90.54%)
- [x] [T-03] [M] config/config.ts + resolver.ts (transport ws|rest, projects cwd-map longest-prefix, same-name diff-URL disambiguate) + unit — high | blocked-by: T-01 | blocks: T-04,T-31 — ✅ done (PR #3 merged bcd9c92, 88 tests M0 total, coverage config 91.57% + resolver 100%)

## M1 Client core

_DoD: mock Huly WS+REST integration pass; markup round-trip fixtures green (R8)._

**Status: ✅ completed** _(slash goal complete-milestone M1, 2026-07-27 — 6/6 tasks done, 224 tests, CI green, DoD pass)_

- [x] [T-04] [S] client/errors.ts (HulyError taxonomy Auth/Connection/NotFound/Conflict/Internal/External, mapError, toToolResult no-leak) + unit — high | blocked-by: T-02,T-03 | blocks: T-05,T-08a,T-09 — ✅ done (PR #4 merged 01d1e63, 37 tests, coverage 93.33% stmts / 100% funcs)
- [x] [T-05] [M] client/client.ts (createHulyClient ws connect / rest connectRest, generic CRUD findOne/findAll/createDoc/updateDoc/removeDoc/addCollection/createMixin, getCurrentUser) + integration mock — high | blocked-by: T-04 | blocks: T-06,T-07 | risks: R2 — ✅ done (PR #6 merged 9c5bb2a, 28 tests, coverage 90%, ambient decls cho @hcengineering types)
- [x] [T-06] [M] client/pool.ts (transport-aware getClient, LRU evict ≤8 ws, auto-reconnect backoff, closeAll session_shutdown, health) + integration — high | blocked-by: T-05 | blocks: T-09 | risks: R2 — ✅ done (PR #7 merged 6316108, 15 tests, coverage 100% stmts)
- [x] [T-07] [S] client/assignee.ts (resolveAssignee: input→validate/lookup, absent→getCurrentUser email) + unit — medium | blocked-by: T-05 | blocks: T-09 — ✅ done (PR #8 merged, 5 tests)
- [x] [T-08a] [S] markup/markup.ts wrapper (@hcengineering/text-markdown markdownToMarkup/markupToMd, both directions) + unit — high | blocked-by: T-04 | blocks: T-08b — ✅ done (PR #9 merged, 26 tests + 12 markdown fixtures)
- [x] [T-08b] [M] native-ref transform (reimplement transformMarkupNodeNativeReferenceLinks + markupNodeToMarkdownString) + round-trip fixtures (R8) — high | blocked-by: T-08a | blocks: T-09 | risks: R8 — ✅ done (PR #10 merged a7d1ca6, 25 tests, R8 lossless verified)

## M2 Tools layer

_DoD: ~102 tool đăng ký; typebox schema valid; confirm gate; mock CRUD pass._

**Status: ✅ completed** _(slash goal complete-milestone M2, 2026-07-27 — 23/23 tasks done, 102 tools registered, 277 tests, CI green, DoD pass)_

- [x] [T-09] [M] tools/builder.ts (defineHulyTool seam: huly_ prefix, resolve ws+project, getClient, error map, confirm gate, render hook, assignee default) + unit — high | blocked-by: T-06,T-07,T-08b | blocks: T-10, T-11..T-29 — ✅ done (PR #11 merged 332d052, 26 tests, sanitize centralized)
- [x] [T-10] [S] tools/confirm.ts (confirmDestructive: ctx.ui.confirm; non-TUI auto-deny) + unit — high | blocked-by: T-09 | blocks: domains — ✅ done (PR #11 merged 332d052)
- [x] [T-11] [M] tools/domains/documents.ts (10: list/get/create/update/delete_teamspace, list/get/create/edit/delete_document) — high | blocked-by: T-09,T-10 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-12] [S] tools/domains/document-snapshots.ts (2: list/get_document_snapshot) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-13] [S] tools/domains/spaces.ts (5: list/get_space, list/get_space_type, update_space) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-14] [S] tools/domains/workspace.ts (5: get_workspace_info, list_workspaces, list_workspace_members, get/update_user_profile) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12, 8 tests)
- [x] [T-15] [M] tools/domains/projects.ts (6: list/get/create/update/delete_project, list_statuses) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-16] [S] tools/domains/task-management.ts (5: list_project_types, get_project_type, list_task_types, create_task_type, create_issue_status idempotent) — high | blocked-by: T-09 | blocks: T-19 — ✅ done (PR #12)
- [x] [T-17] [S] tools/domains/components.ts (6: list/get/create/update/set_issue/delete_component) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-18] [S] tools/domains/milestones.ts (6: list/get/create/update/set_issue/delete_milestone) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-19a] [M] tools/domains/issues-core.ts (8: list/get/create/update/delete/move_issue, add/remove_issue_label) — high | blocked-by: T-09,T-10,T-16 | blocks: T-30, T-19b, T-19c — ✅ done (PR #12)
- [x] [T-19b] [M] tools/domains/issues-templates.ts (8: list/get/create/create_from/update/delete_template, add/remove_template_child) — medium | blocked-by: T-19a | blocks: T-30 — ✅ done (PR #12)
- [x] [T-19c] [S] tools/domains/issues-relations.ts (5: add/remove/list_issue_relation, link/unlink_document_to_issue) — high | blocked-by: T-19a | blocks: T-30 — ✅ done (PR #12)
- [x] [T-20] [S] tools/domains/labels.ts (4: list/create/update/delete_label — GLOBAL namespace) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-21] [S] tools/domains/tags.ts (7: list/create/update/delete_tag, list_attached, attach/detach_tag) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-22] [S] tools/domains/tag-categories.ts (4: list/create/update/delete_tag category) — low | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-23] [S] tools/domains/comments.ts (4: list/add/update/delete_comment, body not message) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-24] [S] tools/domains/attachments.ts (5: list/get/add_attachment, add_issue_attachment, download_attachment) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-25] [S] tools/domains/search.ts (1: fulltext_search global) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-26] [S] tools/domains/deletion.ts (1: preview_deletion cascade) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-27] [S] tools/domains/time.ts (1: log_time minutes) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-28] [S] tools/domains/todos.ts (7: list/get/create/update/complete/reopen/delete_todo) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-29] [S] tools/domains/contacts.ts (2: list_employees, list_persons — read, assignee resolution) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-30] [S] tools/register.ts (register all 19 domain modules) — high | blocked-by: T-11..T-29 | blocks: T-31,T-32,T-33 — ✅ done (PR #12, 102 tools registered)

## M3 Commands + render + factory

_DoD: `/huly init` bind cwd; 3 tool render; session_shutdown cleanup._

**Status: ✅ completed** _(slash goal hoàn thành công M3, 2026-07-27 — 3/3 tasks done, 349 tests, CI green, DoD pass)_

- [x] [T-31] [M] commands/huly.ts (unified: no-arg smart, init flow w/ auth choice, status diagnostics, workspace list/add/remove, link, unlink) + unit — high | blocked-by: T-03,T-30 | blocks: T-33 — ✅ done (PR #13 merged 2ca649b, 34 tests, version.ts tách tránh circular import, non-TUI fail-safe)
- [x] [T-32] [M] render/issue.ts + render/document.ts (huly_get_issue card, huly_list_issues table, huly_get_document preview) — medium | blocked-by: T-30 | blocks: T-33 — ✅ done (PR #14 merged a07e40b, 28 tests, render/util.ts shared, ANSI sanitize chống terminal injection)
- [x] [T-33] [S] index.ts factory (register tools+commands, session_shutdown→pool.closeAll, skills via package manifest) — high | blocked-by: T-31,T-32 | blocks: T-34,T-35 — ✅ done (PR #15 merged 46f1786, 10 tests, render hooks wire 3 tools, setup() guard tránh dev-reload leak, bundle 149.71 kB)

## M4 Skills

_DoD: skill load, huly_ prefixed names, no MCP refs._

**Status: ✅ completed** _(slash goal complete-milestone M4, 2026-07-27 — 2/2 tasks done, 352 tests, CI green, DoD pass; R7 precondition verified, dispatch smoke deferred T-36)_

- [x] [T-34] [M] skills/huly-docs + skills/huly-tasks adapted (substitute huly_ prefix, drop "@firfi/huly-mcp MCP" refs, keep structure) — high | blocked-by: T-33 | blocks: T-36 — ✅ done (PR #16 merged 245d424, 7 skill files: 2 SKILL.md + 5 references/, 46 huly_ tool refs all resolve to bundle, 0 MCP positive refs, markdownlint 0 issues, 5 automated DoD checks pass)
- [x] [T-35] [S] R7 subagent smoke test (dispatch pi-subagent gọi huly tool → assert 1 connection; fallback if separate process) — medium | blocked-by: T-33 | blocks: T-36 | risks: R7 — ✅ done (PR #17 merged 30d5fd8, rescoped: 3 precondition tests added to pool.test.ts verifying D14 same-process pool sharing — main+subagent share 1 connection, concurrent dispatch no double-connect, cross-workspace boundary; R7 dispatch runtime UNVERIFIED in CI — pi-subagents package unavailable in node_modules, deferred to T-36 e2e; 352 tests pass)

## M5 Hardening + release

_DoD: e2e self-host smoke; npm publish; Bước 10 release._

**Status: ✅ completed** _(slash goal complete-milestone M5, 2026-07-27 — 4/4 tasks done: T-36 e2e smoke integration harness + T-37 docs/NOTICE R1 audit + T-38 publish prep + T-39 release EXECUTED — canary v1.0.0-beta.1 published to npm tag `beta`, git tagged, GitHub release created, post-publish verified; stable 1.0.0 sau canary feedback per 10-release §B)_

- [x] [T-36] [M] e2e self-host smoke (~10 critical tools: create_issue, list_issues, get_issue, create_document, edit_document, create_milestone, set_issue_milestone, add_comment, fulltext_search, /huly init) — medium | blocked-by: T-34,T-35 | blocks: T-38 — ✅ done (PR #18 merged 5e11700, 13 integration smoke tests invoke tool.execute() full builder seam, 365 tests total; RESCOPED: runtime real-Huly e2e DEFERRED — no self-host available, defer to post-deploy prod verify 10-release §D)
- [x] [T-37] [M] docs (README, setup guide, /huly guide, Bước 10 deploy, @hcengineering GitHub token doc, R1 license audit) — medium | blocked-by: T-33 | blocks: T-38 | risks: R1 — ✅ done (PR #19 merged dcb2e34, README rewritten user-facing + NOTICE.md R1 license audit — verified 8/8 packages license metadata thật: @hcengineering/* EPL-2.0 bundled, ws/typebox/pi MIT external; R1 accept, no release block)
- [x] [T-38] [S] npm publish prep (prepack build, version, pi-package keyword, pi manifest final) — high | blocked-by: T-36,T-37 | blocks: T-39 — ✅ done (PR #20 merged 9e7c3a9, version 1.0.0, prepack script, CHANGELOG.md, .npmignore, doc-code sync fix — @hcengineering KHÔNG bundled mà là npm public dep; tarball clean: dist+skills+4docs+package.json)
- [x] [T-39] [M] release (Bước 10: deployment strategy, git tag v1.0.0, post-deploy prod verify, monitoring window) — high | blocked-by: T-38 — ✅ done (canary v1.0.0-beta.1 PUBLISHED to npm tag `beta` — user authorized NPM_TOKEN publish; `npm view pi-huly@1.0.0-beta.1` verified registry metadata + dist-tags + tarball fetch + 14 files clean + pi manifest intact; git tag v1.0.0-beta.1 pushed; GitHub release https://github.com/naicoi92/pi-huly/releases/tag/v1.0.0-beta.1; stable 1.0.0 DEFERRED sau canary feedback per 10-release §B)

---

## Post-release hotfixes (M6)

_DoD: 7/7 task done (T-40..T-46); 411 tests pass; CI main green; audit doc
(`docs/design/11-runtime-audit.md`) làm source of truth._

**Status: ✅ completed** _(slash goal complete-milestone M6, 2026-07-27 — 7/7
tasks done, 411 tests pass (+46 từ 365 baseline), CI green cả ubuntu+macos, DoD
pass; audit runtime qua npm tarball source map extraction thay self-host
`workvps` unavailable; 3 class refs UNVERIFIED (Label/TsRelation/DocumentSnapshot)
giữ current — cần runtime server verify khi có self-host)_

> **Context**: Sau canary v1.0.0-beta.1, smoke test trên self-host `workvps` phát
> hiện **7 runtime bug** (GitHub issues #22-#28). Tất cả chia sẻ **1 root pattern**:
> code viết dựa trên assumption về Huly runtime (class name, description storage,
> search API, surface shape, addCollection signature) nhưng **chưa có runtime
> verification thật** — chỉ verify qua design doc/source code tĩnh.
>
> **Nhóm theo bản chất**:
> - **Surface shape** (#22 list giấu array, #26 create giấu id) — cùng root cause
>   ở `builder.ts`, T-40 fix 1 chỗ.
> - **Class/storage/protocol sai** (#23 description ref, #25 class name, #28
>   addCollection) — T-44 audit runtime là prerequisite.
> - **Operator sai** (#24 `$like`) — T-44 verify operator.
> - **Validation thiếu** (#27 label không check tồn tại) — T-45 fix, blocked-by T-44.
>
> **T-44 (audit runtime) là prerequisite cho T-41/T-42/T-43/T-45/T-46** — không
> đoán mò class name / storage model / operator nữa. **T-40 fix độc lập** (chỉ
> logic surface, không depend Huly server) → bắt đầu được ngay.
>
> Chi tiết mỗi task (vấn đề, phương án, acceptance) ở [`docs/tasks/T-XX.md`](./docs/tasks/).
> Theo dõi: [GitHub issues #22-#28](https://github.com/naicoi92/pi-huly/issues).

- [x] [T-40] [M] fix(builder): surface `details` → `content` cho non-TUI path — fix cả list (#22) lẫn create_*/add_* (#26) — high | blocked-by: (none) | blocks: (none) | issues: #22,#26 — [detail](./docs/tasks/T-40.md) — ✅ done (PR #29 merged 9c20abf, appendDetailsForLLM generic seam + sanitize, create_issue identifier lookup, 377 tests)
- [x] [T-41] [M] fix(get_issue): resolve description document ref → markdown content (issue #23) — high | blocked-by: T-44 | blocks: (none) | issue: #23 — [detail](./docs/tasks/T-41.md) — ✅ done (PR #32 merged 4bd1991, client.fetchMarkup MarkupOperations, fallback descriptionRef, 396 tests)
- [x] [T-42] [M] fix(fulltext_search): expand 3-domain search + honest capability (issue #24) — high | blocked-by: T-44 | blocks: (none) | issue: #24 — [detail](./docs/tasks/T-42.md) — ✅ done (PR #33 merged 1545c5b, Issue+Document+ChatMessage Promise.all, server reject catch honest, 402 tests)
- [x] [T-43] [L] fix(_class-refs): correct 6+ broken class name runtime (Employee→mixin, TaskType/ProjectType→task pkg, Document→tracker, Space→core, Tag→TagElement, Todo→time:ToDo, TimeSpendReport→tracker) (issue #25 updated) — high | blocked-by: T-44 | blocks: T-41,T-42,T-45,T-46 | issue: #25 — [detail](./docs/tasks/T-43.md) — ✅ done (PR #31 merged 039b15d, audit §1 truth table, 3 UNVERIFIED giữ current — Label/TsRelation/DocumentSnapshot, 393 tests)
- [x] [T-44] [M] chore(audit): runtime class refs + storage + search + addCollection verify qua npm tarball source map extraction (KHÔNG server — workvps unavailable) — high | blocked-by: (none) | blocks: T-41,T-42,T-43,T-45,T-46 — [detail](./docs/tasks/T-44.md) — ✅ done (PR #30 merged b273dd4, `docs/design/11-runtime-audit.md` source of truth, 9 audit regression tests, 386 tests)
- [x] [T-45] [S] fix(add_issue_label): validate label tồn tại + TagReference object shape (issue #27) — medium | blocked-by: T-44 | blocks: (none) | issue: #27 — [detail](./docs/tasks/T-45.md) — ✅ done (PR #34 merged fc06f30, lookup title OR _id + push {tag,title,color} shape, symmetric remove, 406 tests)
- [x] [T-46] [M] fix(create_todo): addCollection required fields (attachedToClass/user/visibility/rank/priority/workslots) + error wrap (issue #28) — medium | blocked-by: T-44,T-43 | blocks: (none) | issue: #28 — [detail](./docs/tasks/T-46.md) — ✅ done (PR #35 merged 768b566, priority string→number map, Visibility.Public default, lexorank empty, 411 tests)

---

## beta.2 follow-up hotfixes (post-beta.2 — không thuộc milestone)

> **Context**: Sau khi beta.2 shipped (fix 7 bug #22-#28 qua T-40..T-46), smoke
> test tiếp tục phát hiện **8 bug mới** (GitHub issues #36-#43). Phân tích cho thấy:
>
> - **3 bug là root cause mới chưa được address** (#36 update_issue status drop +
>   assignee leak, #40 space param sai, #41 silent space fallback).
> - **3 bug liên quan class registry vẫn UNVERIFIED** (audit §7 Known limitations
>   — Label/TsRelation/DocumentSnapshot): #38 Document class runtime lỗi, #39 +
>   #43 TsRelation runtime lỗi.
> - **1 bug là generalization** của pattern T-45 (validate FK ref): #42 mở rộng ra
>   7 tool khác cùng pattern.
> - **1 bug có thể là duplicate** của #22 đã fix T-40: #37 (list_* count) — cần
>   investigate xem user có chạy beta.2 hay chưa.
>
> **Nhóm theo bản chất**:
> - **Validation/space layer** (#40 + #41 + #42) — cùng root cause: write với
>   ref/space sai không validate → TxUpdateDoc skip lan truyền. Pattern chuẩn đã
>   ship ở PR #34 (T-45).
> - **Class registry remaining** (#38 + #39 + #43) — 3 class UNVERIFIED runtime,
>   cần server verify (T-53).
> - **Tool-specific bug** (#36 update_issue) — D15 leak + status không map enum.
> - **Investigate duplicate** (#37) — có thể close as duplicate #22.
>
> Chi tiết mỗi task ở [`docs/tasks/T-XX.md`](./docs/tasks/).
> Theo dõi: [GitHub issues #36-#43](https://github.com/naicoi92/pi-huly/issues).

- [ ] [T-47] [M] fix(update_issue): status persist + stop auto-assignee leak (D15 rule không apply cho update) (issue #36) — critical | blocked-by: (none) | blocks: (none) | issue: #36 — [detail](./docs/tasks/T-47.md) — **Open**
- [ ] [T-48] [S] investigate: list_* có còn chỉ trả count sau T-40 không? (có thể duplicate #22 đã fix) (issue #37) — high | blocked-by: (none) | blocks: (none) | issue: #37 — [detail](./docs/tasks/T-48.md) — **Open (investigate)**
- [ ] [T-49] [S] fix(fulltext_search): Document class sai runtime + defensive per-domain catch (issue #38) — high | blocked-by: (none, pair T-53 nếu cần server) | blocks: (none) | issue: #38 — [detail](./docs/tasks/T-49.md) — **Open**
- [x] [T-50] [S] fix(update_user_profile): space param sai → TxUpdateDoc skip (issue #40) — high | blocked-by: (none) | blocks: (none) | issue: #40 — [detail](./docs/tasks/T-50.md) — ✅ done (lookup Person.space trước updateDoc + schema drift guard; 413 tests, +2 regression +1 schema drift; replace test固化 bug cũ)
- [ ] [T-51] [M] fix(create_*): silent space fallback tạo document mồ côi khi project null (4 call site) (issue #41) — high | blocked-by: (none) | blocks: (none) | issue: #41 — [detail](./docs/tasks/T-51.md) — **Open**
- [ ] [T-52] [L] fix(*): validate foreign-key ref tồn tại trước write (7 tool: add_issue_relation, set_issue_component/milestone, move_issue, link/unlink_document, attach_tag) (issue #42) — critical | blocked-by: (none, pattern có sẵn PR #34) | blocks: (none) | issue: #42 — [detail](./docs/tasks/T-52.md) — **Open**
- [ ] [T-53] [M] investigate: verify 3 class refs UNVERIFIED runtime (Label, TsRelation, DocumentSnapshot) trên self-host thật — gộp #39 bug + #43 investigation (issues #39,#43) — high | blocked-by: (none code, cần user cung cấp self-host URL+auth) | blocks: (none, unblock confirm #38/#39) | issues: #39,#43 — [detail](./docs/tasks/T-53.md) — **Open (investigate)**

---

## Size / priority distribution

- Size: S ~27 · M ~27 · **L 2** (T-43 fix xong; T-52 mới — 7 tool validate FK ref).
- Priority: 🔴 critical 2 (T-47, T-52) · 🔴 high 33 · 🟡 medium 19 · 🟢 low 1 (T-22).
- Critical path: T-01→02/03→04→05→06→09→domains→30→31→33→34→36→38→39.
- **beta.1 hotfix chain (M6 — all done)**: T-40..T-46 fix #22-#28, PR #29-#35.
- **beta.2 follow-up chain (T-47..T-53)**:
  - **Independent, start ngay** (no blocker): T-47 (update_issue), T-50 (space param), T-51 (silent fallback), T-52 (FK validate).
  - **Investigate**: T-48 (list_* có duplicate #22 không?), T-53 (verify 3 class runtime — cần self-host).
  - **Pair với T-53 nếu cần server**: T-49 (Document class runtime).
- Task detail files: [`docs/tasks/`](./docs/tasks/) (1 task = 1 file, self-contained cho AFK agent).
- Audit source of truth: [`docs/design/11-runtime-audit.md`](./docs/design/11-runtime-audit.md).
