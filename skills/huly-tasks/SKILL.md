---
name: huly-tasks
description: "Huly Issues storage adapter cho TaskStore — map TaskStore/TaskLifecycle methods sang huly tools (native pi-huly, KHÔNG MCP — gọi thẳng WebSocket API). Dùng khi `project-design`/`task-implement`/`milestone-implement` invoke TaskStore=huly, hoặc khi user muốn tạo issues/tasks/milestones/labels vào Huly: `tạo issues Huly`, `Huly tasks setup`, `sync task lên Huly`, `tạo milestone Huly`. Đặc biệt: huly_create_issue KHÔNG nhận milestone/component/labels trực tiếp (phải set tool riêng sau); Huly có native DAG (blocks/blocked-by/relates) + parent-child hierarchy; labels GLOBAL (phải namespace); milestone status enum planned/in-progress/completed/canceled."
---

# Skill: huly-tasks

Huly Issues storage adapter — implement TaskStore interface (xem
`project-design/references/adapter-contract.md`) cho Huly Issues module qua
**native huly tools** (extension `pi-huly`, gọi thẳng WebSocket API — KHÔNG MCP).
Map mọi TaskStore method sang huly tool (tên tool prefix `huly_`).

## Khi nào trigger

1. **Invoked bởi `project-design`** khi user chọn TaskStore = `huly-tasks` ở
   Bước 0. Core gọi TaskStore method → skill này chỉ tool tương ứng.
2. **User mention trực tiếp**: "tạo issues Huly", "Huly tasks", "milestone Huly".

## Khi nào KHÔNG dùng

- Task/issues trong GitLab → skill `gitlab-tasks` (tương lai) hoặc
  `gitlab-project-design` (hiện tại).
- Task local trong repo (TASKS.md) → core built-in `local-tasks`.
- Design docs (không phải tasks) → skill `huly-docs`.

## Yêu cầu: extension pi-huly đã cài + binding

Giống `huly-docs` — extension `pi-huly` đã cài + workspace bind qua `/huly init`.
Đọc `references/pi-huly-setup.md` (share với huly-docs) nếu chưa setup.

> ⚠️ Verify trước khi dùng: chạy `/huly status` để confirm workspace bind +
> extension load OK.

## TaskStore → huly tool mapping

Bảng này là core content (tất cả tool prefix `huly_`):

| TaskStore method | huly tool | Ghi chú |
|---|---|---|
| `setup()` | `huly_create_project` + `huly_list_statuses`/`huly_get_project_type` + `huly_create_component` (Phase) + `huly_create_label` | Project id 1-5 uppercase, states auto có |
| `createTask(...)` | `huly_create_issue` **+ `huly_set_issue_milestone` + `huly_set_issue_component` + `huly_add_issue_label`** (xem chi tiết) | `huly_create_issue` chỉ nhận project/title/description/priority/assignee/status/taskType/parentIssue/dueDate/estimation. Milestone/component/labels phải set SAU qua tool riêng |
| `updateTask(id, fields)` | `huly_update_issue` (+ `huly_set_issue_milestone`/`huly_set_issue_component`/`huly_add_issue_label`/`huly_remove_issue_label` nếu đổi những field đó) | `huly_update_issue` nhận project/identifier/title/description/priority/assignee/status/taskType/dueDate/estimation |
| `listTasks(filter?)` | `huly_list_issues` | Filter project + statusCategory (UnStarted/ToDo/Active/Won/Lost) |
| `createMilestone(name, desc, targetDate)` | `huly_create_milestone` (param `label` = name) + `huly_set_issue_milestone` | `huly_create_milestone` param: project/label/description/**targetDate (BẮT BUỘC, Unix ms)**. Default status = `planned` |
| `updateMilestoneStatus(milestone, status)` | `huly_update_milestone(status=...)` | param: project/milestone/status. Status enum: `planned`/`in-progress`/`completed`/`canceled` |
| `createLabel(name, category?, color?)` | `huly_create_label` (**GLOBAL!**) + `huly_add_issue_label` | `huly_create_label` param: title/color/description/category. Phải namespace prefix |
| `linkDependency(from, to, type)` | `huly_add_issue_relation` | param: project/issueIdentifier/targetIssue/relationType. type: `blocks`/`is-blocked-by`/`relates-to` |
| `setParent(child, parent)` | `huly_move_issue` (to new parent) HOẶC `huly_create_issue(parentIssue=...)` khi tạo | Epic/sub-issue hierarchy |
| `listRelations(issue)` | `huly_list_issue_relations` + `huly_list_issues(parentIssue=...)` | `huly_list_issue_relations` param: project/issueIdentifier. Union DAG + hierarchy |
| `attachDoc(issue, docId)` | `huly_link_document_to_issue` | param: project/issueIdentifier/teamspace/document. Hiện Relations panel |

### Lifecycle methods (task-implement)

| Method | huly tool | Param (verified schema) |
|---|---|---|
| `getTask(id)` | `huly_get_issue` | project + **identifier** (KHÔNG phải issueIdentifier) |
| `claim(issue, assignee)` | `huly_update_issue(assignee=...)` | assignee = **email** (vd `nai@example.com`) HOẶC **display name format `LastName,FirstName`** (vd `Còi,Nai` — KHÔNG space, KHÔNG `Nai Còi`). Query `huly_list_employees` trước nếu unsure |
| `setStatus(issue, status)` | `huly_update_issue(status=...)` | status = workflow NAME (vd "In Progress"), discover via `huly_list_statuses` |
| `comment(issue, body)` | `huly_add_comment` | **project + issueIdentifier + body** (markdown). Lưu ý: `issueIdentifier` (KHÔNG phải `identifier`) |
| `listComments(issue)` | `huly_list_comments` | project + issueIdentifier |
| `logTime(issue, minutes)` | `huly_log_time` | **project + identifier + value (minutes int) + description?**. Lưu ý: `identifier` (KHÔNG phải `issueIdentifier` — inconsistency package) |
| `addArtifact(issue, filePath)` | `huly_add_issue_attachment` | **project + identifier + filename + contentType + (filePath \| fileUrl \| data) + description?**. `identifier` (KHÔNG phải `issueIdentifier`) |
| `createSubTask(issue, title)` | `huly_create_todo` | title + attachedTo={type:"issue", project, identifier} + description? + owner? + dueDate? |
| `cancel(issue, reason)` | `huly_update_issue(status=<Lost category>)` + `huly_add_comment(reason)` | status = Lost category name (vd "Canceled"), discover via `huly_list_statuses` |
| `getCurrentUser()` | `huly_get_user_profile` | (no params) → trả account hiện tại (name, email) |

> ⚠️ **Param inconsistency package**: `huly_add_comment` dùng `issueIdentifier`, nhưng
> `huly_log_time` + `huly_add_issue_attachment` dùng `identifier`. Verify từng tool trước
> khi gọi. Sai param name → validation error.

### Chi tiết method

**`setup()`** — chạy 1 lần đầu Bước 9:

```text
1. huly_create_project(name="<ProjectName>", identifier="<1-5 uppercase, vd PD>")
   → idempotent, trả existing nếu trùng identifier
2. huly_get_project_type / huly_list_statuses → discover states có sẵn
   (Huly có default workflow: Backlog/Todo/In Progress/In Review/Done)
3. Với mỗi Phase trong roadmap: huly_create_component(project=<id>, label="Phase 0 Foundation")
4. huly_create_label cho categories: pd:<project>:phase-0, pd:<project>:status:todo,
   pd:<project>:priority:high, pd:<project>:size:S
   (huly_create_label param: title, color?, description?, category?)
```
**`createTask(...)`** — `huly_create_issue` chỉ nhận core fields, các field khác
gọi tool riêng sau:

```text
# Bước 1: create issue (core)
ISSUE = huly_create_issue(
  project=<project-id>,
  title="[T-01] [S] Skeleton",   # T-XX design ID + size prefix + tên task
  description=<markdown>,
  priority=<urgent/high/medium/low/no-priority>?,
  assignee=<email-or-name>?,
  status=<status-name>?,
  taskType=<type-id-or-name>?,
  parentIssue=<parent-identifier>?,   # nếu sub-issue (epic)
  dueDate=<timestamp-ms>?,
  estimation=<minutes>?
)
# → trả issue identifier (vd "PD-1")

# Bước 2: set milestone (nếu có)
huly_set_issue_milestone(project=<id>, identifier="PD-N", milestone=<milestone-label-or-id>)

# Bước 3: set component (nếu có — = Phase)
huly_set_issue_component(project=<id>, identifier="PD-N", component=<component-label-or-id>)

# Bước 4: add labels (mỗi label 1 call, hoặc huly_add_issue_label auto-create)
huly_add_issue_label(project=<id>, identifier="PD-N", label="pd:PD:phase-0")
huly_add_issue_label(project=<id>, identifier="PD-N", label="pd:PD:size:S")
```
> Lý do tách: `huly_create_issue` schema (verified) KHÔNG nhận milestone/component/labels
> trực tiếp. Phải set qua tool riêng sau khi issue đã tạo. Đây là khác biệt vs
> GitLab (`glab issue create --label ...` nhận label inline).
>
> ⚠️ **Param name KHÔNG nhất quán package**: `huly_set_issue_milestone`,
> `huly_set_issue_component`, `huly_move_issue`, `huly_update_issue`, `huly_log_time`,
> `huly_add_issue_attachment`, `huly_add_issue_label`, `huly_remove_issue_label`,
> `huly_delete_issue` dùng `identifier`. Nhưng `huly_add_comment`, `huly_list_comments`,
> `huly_list_issue_relations`, `huly_link_document_to_issue`, `huly_add_issue_relation`
> dùng `issueIdentifier`. Verify từng tool trước khi gọi. Chi tiết → `huly-tool-params.md`
> section "Param inconsistency reference".

**`linkDependency(from, to, type)`** — 2 hệ thống quan hệ TÁCH BẠCH (xem "2
hệ thống relations" bên dưới):

```text
huly_add_issue_relation(
  project=<project-id>,
  issueIdentifier=<from>,       # source issue (vd "PD-2" hoặc "2")
  targetIssue=<to>,             # target (vd "PD-5" hoặc "5"; cross-project "OTHER-42")
  relationType=<type>           # 'blocks' | 'is-blocked-by' | 'relates-to'
)
```
- `blocks`: source blocks target → đẩy vào target's blockedBy
- `is-blocked-by`: source blocked by target → đẩy vào source's blockedBy
- `relates-to`: bidirectional link (update cả 2 phía)
- Cross-project OK (`targetIssue` accept `OTHER-42`)
- No-op nếu relation đã tồn tại

**`setParent(child, parent)`** — epic hierarchy:

- Khi tạo mới: `huly_create_issue(parentIssue=<parent>)`
- Đổi parent sau khi tạo: `huly_move_issue(project=<id>, identifier=<child>, newParent=<parent>)`
- Promote top-level: `huly_move_issue(project=<id>, identifier=<child>, newParent=null)`

**`listRelations(issue)`**:

```text
huly_list_issue_relations(project=<id>, issueIdentifier=<issue-id>)
→ trả: blockedBy[], blocks[], relations[], documents[]
+ huly_list_issues(project=<id>, parentIssue=<issue-id>) → children[]
```
## 2 hệ thống relations độc lập (QUAN TRỌNG)

Huly có 2 loại quan hệ KHÁC NHAU — đừng gộp:

| Loại | Method | huly tool | Ý nghĩa |
|---|---|---|---|
| **DAG dependency** | `linkDependency(type)` | `huly_add_issue_relation` | Task A phải xong trước B. Native cross-project. |
| **Parent-child** | `setParent(child, parent)` | `huly_move_issue`/`huly_create_issue(parentIssue)` | Epic chứa sub-issue (composition) |

Một task có thể ở cả 2: sub-issue của epic "Auth" (hierarchy) VÀ blocked by
T-00 (DAG). Huly support cả 2 native — đây là ưu thế vs GitLab Free (chỉ
`relates_to`, không có `is_blocked_by`/`blocks`).

## Gotchas

1. **Labels GLOBAL, KHÔNG project-scoped** (khác GitLab). Phải namespace
   prefix để tránh collision project khác: `pd:<project-slug>:phase-0`,
   `pd:<project-slug>:status:todo`, `pd:<project-slug>:priority:high`,
   `pd:<project-slug>:size:S`. Lợi: reuse across project; Hại: collision.
2. **Components = Phase modules** (Phase 0 Foundation, Phase 1 Core...).
   Mỗi Phase trong roadmap = 1 component. `huly_set_issue_component` để gán.
3. **Project identifier 1-5 chars uppercase**, start với letter (vd `PD` cho
   "project-design", `SHOP` cho ecommerce). `huly_create_project` idempotent.
4. **Task types + statuses**: dùng `huly_get_project_type`/`huly_list_task_types`/
   `huly_list_statuses` để discover valid task types + statuses trước khi
   `huly_create_issue`. Status validate theo task type workflow.
5. **2 relations hệ thống** (DAG vs hierarchy) — dùng tool đúng (xem trên).
6. **`huly_create_issue` description markdown** — link tới browse URL của Huly
   object → native reference. Round-trip OK.
7. **`huly_delete_*` permanent** — `huly_delete_issue`, `huly_delete_milestone`,
   `huly_delete_component`, `huly_delete_label` KHÔNG undo. Dùng
   `huly_preview_deletion` trước khi delete để xem cascade impact. Confirm gate
   FR-09: subagent headless (ctx.hasUI=false) → auto-deny delete.
8. **Issue templates** (bonus): `huly_create_issue_template` + `huly_create_issue_from_template`
   cho task lặp qua milestone (vd "setup CI"). Template có children → tự sinh
   sub-issues.
9. ⚠️ **Hosted Huly (huly.app) SaaS đã ngừng hoạt động** (deadline shutdown
   2026-07-20 đã qua). Nếu user dùng SaaS → cảnh báo migrate self-host. Self-host OK.
10. ⚠️ **Assignee format**: Huly accept email (vd `nai@example.com`) HOẶC
    display name theo format `LastName,FirstName` (vd `Còi,Nai` — KHÔNG space,
    KHÔNG `Nai Còi`). Sai format → "Person not found". **Best practice**: dùng
    email, hoặc query `huly_list_employees` trước lấy exact display name.
    "Chính mình" = `huly_get_user_profile()` → email.

## Workflow Bước 9 (từ project-design)

Khi core chạy Bước 9 với TaskStore=huly:

```text
1. setup():
   - huly_create_project(identifier)
   - huly_get_project_type (discover states)
   - Với mỗi Phase: huly_create_component
   - huly_create_label cho categories (namespace pd:<proj>:...)

2. Milestones:
   - huly_create_milestone(M0, "Foundation", scope+DoD)
   - huly_create_milestone(M1, ...)

3. Approval Gate: trình issue list cho user, KHÔNG bulk-create.

4. Issues (chỉ sau user approve):
   - Với mỗi task T-XX: huly_create_issue(title="[T-XX] [S/M/L] <tên>", desc, ...)
     rồi huly_set_issue_milestone + huly_set_issue_component + huly_add_issue_label
   - Description self-contained (xem project-design/references/task-template.md)

5. Relations:
   - DAG: huly_add_issue_relation(type) cho mỗi dependency
   - Hierarchy: huly_move_issue hoặc huly_create_issue(parentIssue) cho epic-sub

6. Doc links:
   - huly_link_document_to_issue(issue, docId) cho traceability
   → hiện Relations panel trong UI
```
## Capability matrix (vs GitLab Free)

| Capability | huly-tasks | GitLab Free (hiện tại) |
|---|---|---|
| Issues | ✓ native | ✓ |
| Milestones | ✓ native | ✓ |
| Labels | ✓ **global** (namespace!) | ✓ project-scoped |
| DAG blocks/blocked-by | ✓ **native cross-project** | relates_to only |
| Parent-child (epic) | ✓ native (huly_move_issue) | ✓ |
| Doc↔issue link | ✓ native (Relations panel) | ✓ |
| Issue templates | ✓ (huly_create_issue_from_template) | ✓ |
| Time tracking | ✓ (huly_log_time, timer) | ✓ |

> Khi platform thiếu capability → ghi rõ + fallback (text section trong
> the description).

## Orchestrator query pattern (cho `milestone-implement`)

`milestone-implement` orchestrator cần query tasks theo milestone + priority +
topology. `huly_list_issues` **KHÔNG** filter theo milestone/priority +
**KHÔNG** sort topology. Orchestrator phải:

```text
1. Đọc design doc `09 - Implementation Roadmap` (DocStore.readDoc) → topology
   order table (source of truth cho Order + Priority + Milestone + DAG)
2. Cho mỗi task T-XX trong table:
   - getTask(T-XX) → status thật (todo/done/...)
   - listRelations(T-XX) → blockedBy[]
3. Sort locally theo (priority, order, size) — xem
   `milestone-implement/references/task-selection.md`
```
> Lý do dùng design doc: design doc là single source of truth cho topology +
> priority (user-approved ở project-design Bước 9). Huly chỉ track status.
> Sync 2 chiều: design doc có topology/priority + Huly có status runtime.

## Progressive disclosure

- `references/pi-huly-setup.md` — config `pi-huly` (share với huly-docs). Đọc khi
  setup/troubleshoot extension install + workspace binding.
- `references/huly-tool-params.md` — **bảng params CHÍNH XÁC cho mỗi tool** (field,
  required/optional, type, format, ví dụ, gotcha, lỗi phổ biến). **Đọc TRƯỚC khi
  gọi huly tool** để tránh sai param (vd assignee format, identifier vs
  issueIdentifier, targetDate Unix ms, color palette index).
- `references/task-format.md` — Huly-specific issue description format +
  relation syntax + label namespace convention. Đọc khi Bước 9.
