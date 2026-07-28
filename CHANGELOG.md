# Changelog

All notable changes to pi-huly sẽ document ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/),
versioning theo [Semantic Versioning](https://semver.org/).

## [1.0.0-beta.6] - 2026-07-29

Hotfix canary #5. **beta.5 follow-up** — audit toàn diện 102 tool vs trusted
`@firfi/huly-mcp` v0.45 phát hiện ~40/102 tool có bug, ~22 hỏng hoàn toàn.
Slash goal complete-milestone beta.5: 13/13 task (T-65..T-77), 5 root-cause
(sai class ref · sai data model · sai field name/type · thiếu space scoping ·
thiếu account-client). 651 tests (baseline 583 → +68), CI green cả ubuntu+macos.

### Fixed (root-cause, verified vs trusted)

- **class refs** (T-65 #73): `tracker:class:Document` interface orphan (T-58
  conclusion sai) → `document:class:Document`/`Teamspace`/`DocumentSnapshot`
  from `@hcengineering/document` plugin. SUPERSEDES T-58.
- **document tools re-enabled** (T-66 #74): 10/11 honest-unavailable tools mở
  lại (list/get/update/delete teamspace + list/get/create/edit/delete document
  + list/get snapshot) dùng class refs mới. `uploadMarkup`/`updateMarkup` wired
  vào HulyClient (ws delegate + rest throw).
- **create_* AttachedDoc + sequence** (T-67 #75): create_issue dùng `$inc
  sequence` (atomic, no race dup identifier) + addCollection + number/kind/
  identifier/rank/parents. create_project self-ref space + type + members/owners
  + sequence:0 + idempotent. create_milestone status enum (KHÔNG string).
- **issue hierarchy** (T-68 #76): move_issue + list_issues dùng AttachedDoc
  fields (attachedTo/attachedToClass/collection/parents/subIssues) thay field
  `parentIssue` (KHÔNG tồn tại). 4 move cases cover + updateDescendantParents
  recursive + dec old parent subIssues.
- **tags TagReference** (T-69 #77): attach/detach/list_attached dùng addCollection/
  findAll/removeDoc trên `tags:class:TagReference` (collection "labels", KHÔNG
  "tags") thay $push/$pull inline array. color coerce Number().
- **comments field** (T-70 #78): field `message` (inline Markup) thay `body`
  (KHÔNG tồn tại). ChatMessage.message = `JSON.stringify(mdToMarkup(md))`,
  KHÔNG MarkupBlobRef. list_comments thêm filter `attachedToClass` + sort.
- **list_* space scoping** (T-71 #79): list_issues/milestones/components/
  templates thêm `space: project._id`. list_issues assignee resolve Person +
  titleSearch no-leak. list_statuses ProjectType.statuses traversal + category
  ref→enum + isDefault.
- **markup + enum** (T-72 #80): create/update issue description = MarkupBlobRef
  (uploadMarkup/updateMarkup) thay inline string. update_milestone status
  enum map (planned=0..canceled=3). update_issue status scope theo project
  (getProjectStatuses T-71 reuse).
- **workflow registration** (T-73 #81): create_issue_status full flow (statusClass
  dynamic + core.space.Model + category Ref + ofAttribute + register TaskType +
  ProjectType statuses). create_task_type copy sibling template fields + parent
  + register. list_task_types field `parent`. list_tags targetClass filter.
  list_space_types/get_space_type honest-unavailable (fabricated removed).
- **log_time** (T-74 #82): collection "reports" (KHÔNG "timetracking"), value hours
  (Type.Number, fractional 0.25=15min), date + employee best-effort. Off-by-60x
  fixed. list_employees drop email field (KHÔNG tồn tại).
- **attachments blob** (T-75 #83): storageClient wired (lazy connectStorage) →
  uploadBlob/getBlob trên HulyClient. add base64→Buffer→uploadBlob→addCollection
  {file: Ref<Blob>, size, type, lastModified}. download getBlob→base64. list/get
  read field `type` (KHÔNG contentType).
- **templates** (T-76 #84): add/remove_template_child IssueTemplateChild object +
  replace array (KHÔNG $push/$pull string). create_template defaults. create_
  issue_from_template copy priority/assignee/component.
- **search + misc** (T-77 #85): fulltext_search prefer `searchFulltext` API (ws
  fallback $like). preview_deletion cascade counters (subIssues/reverseBlocks/
  inline blockedBy/relations) + warnings. tag-category field `label` (KHÔNG
  title) + defaults.

### Known limitations (deferred)

- **T-74 sub-slice 2**: account-client HTTP layer cho list_workspaces + list_
  workspace_members (roles) — deferred behind ADR. 2 tools honest-unavailable.
- **T-76**: recursive child issue creation từ template.children — deferred.
- **T-73**: create_task_type Mixin + TaskTypeClass doc — template-copy covers
  usability.
- **Self-host runtime verify** (T-53) — class refs verified via trusted source,
  chưa test server thật (workvps unavailable).

## [1.0.0-beta.5] - 2026-07-28

Hotfix canary #4. **beta.4 follow-up hotfixes** — 3 task hardening noise + data
loss class. Verified upstream `@hcengineering/api-client@0.7.423` `connect()`
KHÔNG expose seam logger (`api-client/lib/client.js:42-79` chỉ nhận socketFactory
+ connectionTimeout) → filter ở ranh giới pi-huly.

### Added (T-62 #67 — noise filter framework)

- `src/client/console-filter.ts` — `UpstreamConsoleFilter` class install/restore
  `console.warn/error/log` override + `runWithConsoleFilter(patterns, fn)` wrap
  async block (try/finally LUÔN restore) + `DEFAULT_UPSTREAM_NOISE_PATTERNS`
  registry. Match first-arg string HOẶC structured log có field `message` qua
  `RegExp[]` (case-insensitive). Đếm per-pattern + total (module-level).
- Wrap `connect()` trong `createHulyClient` qua `runWithConsoleFilter()` — scope
  hẹp (try/finally restore), KHÔNG global-silent vĩnh viễn.
- Config escape hatch: `quietUpstreamNoise?: boolean` (default `true`) + 
  `upstreamNoisePatterns?: string[]` (override registry).
- Pool `health()` expose `upstreamNoiseFiltered?: { total; byPattern }` →
  `/huly status` hiển thị `pool noise: N upstream log filtered`.

### Known limitations

- **#67 upstream noise** — `no document found, failed to apply model transaction`
  cache-miss warn (core/memdb + core/client buildModel) vô hại khi replay tx cũ
  cho doc đã expire/removed. Filter gate (default ON). Set `quietUpstreamNoise: false`
  để debug thật.
- **T-64 pending** (blocked-by T-62) — WS error spam + token leak (URL
  `_transactor/<token>`) sẽ đăng ký thêm pattern vào framework này ở task kế.

### Changed (T-63 #68 — silent data loss audit hardening)

- `src/tools/domains/_common.ts` — thêm `safeUpdateDoc(client, _class, doc, ops)`
  + `safeRemoveDoc(client, _class, doc)` helper. Nhận **doc đã lookup** (KHÔNG nhận
  space/objectId riêng — ép caller lấy từ doc), tự extract `.space`/`._id` + guard
  undefined → return `isError` rõ ràng (KHÔNG gửi write → silent no-op prevention).
  Centralize pattern T-50 (`workspace.ts:155-173`).
- **Migration 42 call site** (30 updateDoc + 12 removeDoc) sang helper — static
  audit confirm 42/42 NHÓM A (space từ lookup doc), 0 NHÓM B. Trước T-63, 41/42
  thiếu schema drift guard (chỉ workspace.ts có T-50). Giờ 42/42 có guard qua helper.
- Migration file: comments (2) · components (3) · documents (2) · issues-core (6)
  · issues-relations (8) · issues-templates (4) · milestones (3) · projects (2)
  · spaces (1) · tag-categories (2) · tags (4) · todos (4) · workspace (1, T-50 ref).
- Regression test: tags schema drift (missing space → isError, missing _id →
  isError), workspace schema drift (T-50 preserved). Helper unit 12 tests.
  Schema-drift-guard test cho 4 file thiếu test (comments, projects, tag-categories,
  spaces) — 7 tool-entry regression verify migration wiring thật.

### Security (T-64 #69 — WS spam + token leak gate)

- **Token leak fix (NFR-04)** — upstream `@hcengineering/client-resources@0.7.423`
  `lib/connection.js:554` in ra stderr: `client websocket error: <id>
  wss://.../_transactor/<api-token> <ws> <user>`. URL chứa api-token → vi phạm
  NFR-04 (no-leak) nếu log capture/export. Filter swallow toàn bộ (KHÔNG redact,
  KHÔNG spam màn hình). Verified: stderr captured KHÔNG chứa `_transactor/` +
  token substring.
- Đăng ký 7 pattern vào `DEFAULT_UPSTREAM_NOISE_PATTERNS` (framework T-62):
  `client websocket error` + `Generate new SessionId` + `no ping response` +
  `Connected to server` + `Processing upgrade` + `measure slow findAll`.
- **KHÔNG filter Error instance** — `console.error(new Error('unknown response
  id'))` (connection.js:329) + `console.error(err)` decompress (488/496/510/518)
  là real error cần debug. Filter chỉ apply plain string / structured log.
  T-62 đã guard `!(firstArg instanceof Error)`.
- **WS onerror vẫn trigger reconnect** — filter chỉ override `console.error`
  METHOD, KHÔNG chạm `wsocket.onerror` callback. Error throw pathway (auth fail,
  server down) vẫn reach LLM qua `mapError()` → `toToolResult`.
- **B1 fix (review)** — `runWithConsoleFilter` chỉ cover connect-time (restore
  `console.error` trước khi `wsocket.onerror` async callback thật fire → token
  leak post-connect). Thêm `installGlobalConsoleFilter()` install 1 lần tại
  `setup()` (index.ts), active toàn session lifetime. WS error fires bất kỳ lúc
  nào post-connect (reconnect, server down, network blip) đều bị gate. Test verify
  post-connect timing (setTimeout gap) + reconnect spam 10 lần + Error instance
  vẫn log ra downstream.

## [1.0.0-beta.4] - 2026-07-28

Hotfix canary #3. **Root cause fix** beta.3 follow-up hotfixes — DEEP-AUDIT 12
@hcengineering packages @0.7.423 (scan plugin() class block registration, KHÔNG
chỉ interface existence). Resolve 5 class ref root cause (#39, #43, #55, #58,
#62). User nhấn mạnh "up level cao hơn — verify runtime thật + fix class ref
đúng, KHÔNG defensive che lỗi nữa".

### Fixed (root cause — KHÔNG defensive)

- **#39** — `add_issue_relation` fail `domain not found: core:class:TsRelation`:
  **TsRelation KHÔNG tồn tại** (0 match toàn packages). Issue relations stored
  **INLINE** (`Issue.relations?: RelatedDocument[]` + `Issue.blockedBy?:
  RelatedDocument[]`, `RelatedDocument = Pick<Doc, '_id'|'_class'>`). Refactor
  `add/remove/list_issue_relation` dùng `$push/$pull` trực tiếp trên Issue (T-59).
  Xóa `TS_RELATION_CLASS` dead code.
- **#43** — `view:class:Label` + `document:class:DocumentSnapshot` **KHÔNG tồn
  tại** (0 match toàn packages → deprecated). Huly dùng `tags:class:TagElement`.
  6 tool honest-unavailable: 4 label CRUD (`labels.ts`) + 2 snapshot
  (`document-snapshots.ts`) → redirect tag tools / Huly UI. `add/remove_issue_label`
  (`issues-core.ts`) switch `LABEL_CLASS` → `TAG_CLASS`.
- **#55/#64** — `fulltext_search` Document domain fail: `tracker:class:Document`
  interface exists NHƯNG **KHÔNG register** trong plugin() class block (interface
  orphan) → runtime fail (#55 report 2 lần, T-49 Promise.allSettled chỉ che warning).
  REMOVE Document domain khỏi search (T-60). Cùng verdict áp dụng 7 tool
  honest-unavailable: 5 document CRUD (`documents.ts`) + `link/unlink_document_to_issue`.
- **#58** — `create_teamspace` fail `platform:status:UnknownError`: `core:class:Space`
  base abstract (KHÔNG có SpaceTypeDescriptor). Documents Teamspace thật =
  `drive:class:Drive` NHƯNG createDoc cần `type: Ref<SpaceType>` = drive.DefaultDrive
  ref (branded, runtime-generate, KHÔNG accessible từ pi-huly). Honest-unavailable
  (T-54). Read path (list/get_teamspaces) vẫn OK qua SPACE_CLASS inheritance.

### Changed

- **#63** — `remove_issue_relation` API breaking change: param `relation: <_id>`
  → `targetIssue + relationType` (relation giờ là array element, KHÔNG doc riêng).
  `$pull` theo `{_id, _class}` match.
- **#64** — `fulltext_search` chỉ 2 domain (Issue title + ChatMessage content).
  Tool description honest "Document search NOT available".

### Added (enhancement — T-55/T-56/T-57)

- **#59** — `pool warm` at `session_start` (fire-and-forget, reason ∈ {startup,
  resume}): fix first-call failure (lazy connect cold start).
- **#60** — `debug log` tool calls: subscribe `tool_execution_start` → log
  `[huly_<tool>] args: <json>` ra stderr. Filter huly_ prefix, sanitize
  (LEAK_PATTERNS), truncate>500 (sanitize SAU truncate).
- **#61** — `error mapping` domain not found → `UnavailableError` honest (list
  possible causes + recovery hint). `ErrorClass` union thêm "Unavailable".

### Audit evidence

- Method: DEEP-AUDIT 12 packages @hcengineering/*@0.7.423 source map extraction
  (core/tracker/task/contact/chunter/tags/attachment/drive/view/platform/calendar/
  templates). Scan **plugin() class block** (registration truth, KHÔNG chỉ
  interface existence). Source of truth: `docs/design/11-runtime-audit.md` §7.
- 509 tests pass (+55 từ baseline 454). CI green (fmt+lint+typecheck+build).
- 2 review pass (code-review-mentor APPROVED + reality-checker CONFIRMED).

## [1.0.0-beta.3] - 2026-07-27

Hotfix canary #2. Fix 8 runtime bug phát hiện qua smoke test tiếp theo sau
beta.2 (GitHub issues #36-#43). Install: `pi install npm:pi-huly@beta` (hoặc
`pi update npm:pi-huly` nếu đã pin beta).

Mỗi fix pass **đầy đủ workflow `task-implement`**: audit (reality-checker) →
plan review (code-review-mentor) → TDD implement → review đa nguồn (code-review +
reality-checker integrity) → **independent audit cuối** phát hiện + fix thêm
blocker mà review trước bỏ sót.

### Fixed

- **#36** — `update_issue` status KHÔNG persist + assignee bị auto-claim:
  2 root cause. (1) `needsAssignee: true` leak từ `create_issue` (D15 FR-18 chỉ
  cho create) → builder auto-fill assignee = currentUser cho mọi update. Remove.
  (2) `ops.status = params.status` push raw short name ("Done") → server cần
  full ref ("tracker:status:Done"). Thêm `findAll(ISSUE_STATUS_CLASS)` resolve
  short → full ref, validate enum, isError + list valid statuses khi invalid.
  Edge cases: empty statuses, schema drift (_id missing), whitespace trim,
  findAll throw (transport) → isError rõ ràng + retry hint. (T-47, PR #44)
- **#37** — `list_*` chỉ trả "Found N item(s)": **duplicate của #22** đã fix T-40
  (beta.2). Defensive consistency fix: `builder.ts` `hasUI === false` → `!== true`
  (align với `confirm.ts`/`huly.ts`, insurance khi runtime omit field). (T-48, PR #45)
- **#38** — `fulltext_search` fail `domain not found: tracker:class:Document`:
  `Promise.all` reject nếu 1 domain throw (Document class UNVERIFIED runtime).
  Đổi `Promise.allSettled` → 1 domain fail KHÔNG kéo cả search fail. Partial
  result + warning log per failed domain. All-fail → isError honest. Root cause
  Document class deferred T-53 (cần runtime verify). (T-49, PR #46)
- **#40** — `update_user_profile` warning `no document found... TxUpdateDoc`:
  `updateDoc(PERSON_CLASS, currentUser.id, currentUser.id, ...)` — cả space +
  objectId = Person._id (space sai). Lookup Person record → resolve `person.space`
  thật. Schema drift guard: Person record tồn tại nhưng space/_id missing →
  isError. (T-50, PR #47)
- **#41** — `create_*` silent space fallback tạo document mồ côi: 4 tool
  (`create_component`, `create_milestone`, `create_template`,
  `create_issue_from_template`) dùng `project?.space ?? tctx.workspace` — khi
  project lookup null, fallback sang workspace → orphan document. Đổi:
  project null → isError rõ ràng "Run /huly init", KHÔNG tiếp tục createDoc.
  (T-51, PR #48)
- **#42** — Ref rác khi write FK không validate: 6 tool (`add_issue_relation`,
  `set_issue_component`, `set_issue_milestone`, `move_issue`,
  `link_document_to_issue`, `attach_tag`) cast `idRef(params.xxx)` raw không
  validate entity tồn tại. Thêm `findOne(TARGET_CLASS)` → if null → isError →
  KHÔNG write. Bonus `attach_tag` shape fix (TagReference object thay raw string,
  idempotent ref resolved) + `detach_tag` symmetric `$pull` object. `add_issue_relation`
  resolve identifier cross-project (KHÔNG route resolveIdentifier throw).
  `move_issue` Option A: KHÔNG truyền parentIssue = top-level promotion.
  `unlink_document_to_issue` skip per spec §3 ($pull idempotent). (T-52, PR #49 + #52 follow-up)

### Added

- `docs/tasks/T-53-runtime-verify-guide.md` — hướng dẫn user tự test runtime
  verify 3 class UNVERIFIED (Label, TsRelation, DocumentSnapshot) trên self-host.
- `docs/plans/T-49-implement-plan.md`, `T-51-implement-plan.md`,
  `T-52-implement-plan.md` — plan docs cho task L-size.

### Known limitations

- **3 class refs UNVERIFIED** (kế thừa beta.2): `view:class:Label`,
  `core:class:TsRelation`, `document:class:DocumentSnapshot` — cần runtime
  server verify. Guide tạo (T-53), pending user self-host test.
- T-49 defensive fix (Promise.allSettled) che root cause Document class —
  cần T-53 runtime verify để resolve hẳn.
- `add_issue_relation` idempotency (duplicate relation khi gọi 2 lần) —
  follow-up, không block.
- T-47 multi-project status filter (findAll ISSUE_STATUS_CLASS không filter
  theo project/taskType) — follow-up.

### Stats

- 454 tests pass (+43 từ beta.2 baseline 411)
- CI green cả ubuntu + macos (node 24)
- 9 PRs merged (#44-#52)

Feedback: <https://github.com/naicoi92/pi-huly/issues>

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

### Fixed

- **#TBD** `list_issue_relations` báo 0 relation dù issue có "blocks" (vd `LST-19 blocks LST-22` → list trên LST-19 rỗng). Root cause: `add/remove/list_issue_relation` lưu/đọc relation **sai hướng** so với Huly thật (T-61). Verified từ Huly source chính thức: `RelationsPopup.svelte:33-41` + `issues.ts:111 updateIssueRelation` + test spec `relations.spec.ts`.
  - Storage đúng (khớp Huly UI): `blocks`→`target.blockedBy` (A blocks B → `B.blockedBy.push(A)`), `is-blocked-by`→`source.blockedBy` (A blocked-by B → `A.blockedBy.push(B)`), `relates-to`→**bidirectional** (`A.relations.push(B)` + `B.relations.push(A)`).
  - `list_issue_relations` thêm **reverse query** `findAll(Issue, { 'blockedBy._id': issue._id })` để tìm "blocks" (Issue KHÔNG có field `blocks` — phải compute qua reverse).
  - T-59 #63 refactor trước đây đã **đảo ngược** `blocks`/`is-blocked-by` + thiếu chiều `relates-to`.

### Known limitations

- Relation `blocks`/`is-blocked-by` tạo bằng `huly_add_issue_relation` ở **beta.3/beta.4** (trước T-61) lưu sai chỗ (`source.relations` thay vì `target.blockedBy`) sẽ KHÔNG hiển thị đúng sau upgrade. **Workaround**: `remove_issue_relation` (relation cũ không match, no-op) → tạo lại relation qua Huly UI Relations panel, hoặc `add_issue_relation` (relationType `blocks` — ghi đúng vào `target.blockedBy`).
