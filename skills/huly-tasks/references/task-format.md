# Huly Issues — task description format + conventions

Quy ước viết issue/task content cho Huly Issues. Khác biệt chính vs GitLab:
labels **global** (namespace), 2 hệ thống relations (DAG + hierarchy) native.

## Issue description — markdown

```markdown
## Mục tiêu

[1-2 câu mô tả chức năng task deliver.]

## Công việc

1. [Bước 1.]
2. [Bước 2.]

\`\`\`rust
// Code mẫu / interface level
pub fn hello() -> String
\`\`\`

## Verify

- [ ] `cargo build` pass
- [ ] `cargo test` pass

## Dependencies

- **Blocked by**: <issue-key, vd PD-12> (ghi task name)
- **Blocks**: <issue-key>

## Refs

- <browse-url link tới design doc trong Huly Documents>
- <browse-url link tới API spec doc>

## Out of scope

- KHÔNG làm X.
```
> Template base từ `project-design/references/task-template.md`. Huly-specific
> ở Refs (browse-URL link tới Huly doc, KHÔNG `[[Page]]`).

## Label namespace (GLOBAL — QUAN TRỌNG)

Huly labels là **global workspace**, không phải per-project. Phải namespace
để tránh collision:

| Category | Format | Ví dụ |
|---|---|---|
| Phase | `pd:<proj>:phase-<N>` | `pd:PD:phase-0` |
| Status | `pd:<proj>:status:<value>` | `pd:PD:status:todo` |
| Priority | `pd:<proj>:priority:<value>` | `pd:PD:priority:high` |
| Size | `pd:<proj>:size:<value>` | `pd:PD:size:S` |

Trong đó `<proj>` = project identifier (1-5 uppercase, vd `PD`, `SHOP`).

> Lý do namespace: 2 project cùng có label `phase-0` không phân biệt được.
> `pd:PD:phase-0` vs `pd:SHOP:phase-0` rõ ràng.

### Tạo labels

```text
huly_create_label(
  title="pd:PD:phase-0",
  category="phase",         // optional nhưng KHUYẾN NGHỊ — group đúng trong UI
  color=4                   // optional — Huly palette INDEX (int 0-23), KHÔNG phải hex string
)
```
`huly_create_label` idempotent (trả existing nếu trùng title). `category` giúp group
label trong UI Huly (vd phase/size/priority/status). Không truyền → default
"Other" → label lộn xộn.

> ⚠️ `color` = **Huly platform palette index** (số nguyên 0-23), KHÔNG phải hex
> string. Gọi `color="#3498db"` → schema error. Bỏ qua nếu không cần.

### Gán label cho issue

```text
huly_add_issue_label(
  project="PD",
  identifier="PD-1",   // identifier (KHÔNG phải issueIdentifier — inconsistency!)
  label="pd:PD:phase-0"
)
```
`huly_add_issue_label` auto-create label nếu chưa có (tiện nhưng có thể quên
namespace — luôn tạo trước qua `huly_create_label` để control).

## 2 hệ thống relations — syntax

### DAG dependency (`huly_add_issue_relation`)

```text
huly_add_issue_relation(
  project="PD",
  issueIdentifier="PD-2",            // source issue (string)
  targetIssue="PD-5",                // target (cross-project: "OTHER-42")
  relationType="is-blocked-by"       // PD-2 blocked by PD-5
)
```

| relationType | Ý nghĩa |
|---|---|
| `blocks` | source blocks target (target phải đợi source) |
| `is-blocked-by` | source blocked by target (source phải đợi target) |
| `relates-to` | bidirectional link (update cả 2 phía) |

Cross-project OK: `targetIssue="OTHER-42"`.

### Parent-child hierarchy (`huly_move_issue` / `huly_create_issue(parentIssue)`)

Tạo sub-issue mới (khi task size L bắt buộc chia, hoặc epic breakdown):

```text
huly_create_issue(
  project="PD",
  title="[T-01.1] [S] <tên sub-task>",
  parentIssue="PD-10"  # parent = epic
)
```
> `huly_create_issue` chỉ nhận core fields (project/title/description/priority/
> assignee/status/taskType/parentIssue/dueDate/estimation). KHÔNG nhận
> milestone/component/labels — set qua tool riêng sau khi tạo.

Đổi parent sau khi tạo:

```text
huly_move_issue(
  project="PD",
  identifier="PD-15",
  newParent="PD-10"
)
```
Promote top-level (bỏ parent):

```text
huly_move_issue(
  project="PD",
  identifier="PD-15",
  newParent=null
)
```
> DAG và hierarchy TÁCH BẠCH. Một issue có thể có cả: blocked by X (DAG) +
> sub-issue của epic Y (hierarchy).

## Milestone — tạo + gán

```text
huly_create_milestone(
  project="PD",
  label="M0 Foundation",                 // param tên là "label" (display name)
  description="Skeleton + config + DB setup. DoD: build+test+lint pass, CI green.",
  targetDate=1719792000000               // BẮT BUỘC — Unix timestamp milliseconds
)
```
> ⚠️ `targetDate` là **BẮT BUỘC** (verified schema), KHÔNG optional. Kiểu dữ
> liệu là **Unix timestamp milliseconds** (số nguyên), KHÔNG phải ISO date string.
> Convert: `date -d "2026-08-15" +%s` × 1000, hoặc `new Date("2026-08-15").getTime()`.
> Nếu user không có target date cụ thể → dùng default +30 ngày từ nay.

Gán issue vào milestone:

```text
huly_set_issue_milestone(
  project="PD",
  identifier="PD-1",       // string, KHÔNG phải int
  milestone="M0 Foundation"     // hoặc milestone id
)
```
## Component (= Phase) — tạo + gán

Mỗi Phase trong roadmap = 1 component:

```text
huly_create_component(
  project="PD",
  label="Phase 0 Foundation",   // param tên là "label"
  description="Skeleton, config, DB connection, CI setup.",
  lead=<email-or-name>?  // optional
)
```
Gán issue vào component (Phase):

```text
huly_set_issue_component(
  project="PD",
  identifier="PD-1",       // string
  component="Phase 0 Foundation"
)
```
## Doc ↔ Issue link (traceability)

```text
huly_link_document_to_issue(
  project="PD",
  issueIdentifier="PD-1",       // string (KHÔNG phải `identifier`)
  teamspace="<ProjectName> Design Docs",
  document="03 - Tech Stack & Architecture"
)
```
Hiện trong issue Relations panel. Idempotent.

Verify: `huly_list_issue_relations(project="PD", issueIdentifier="PD-1")` → field `documents[]`.

## Issue description — link tới Huly Documents

Trong description markdown, link tới design doc qua **browse-URL**:

```markdown
## Refs

- [03 - Tech Stack & Architecture](<huly-browse-url>)
- [06 - API & Interface Spec](<huly-browse-url>)
```
Cách lấy browse URL: `huly_get_document` trả field `url`. Markdown link có `_class`,
`_id`, `_label` → Huly convert native reference.

> KHÔNG dùng `[[Page Name]]` (GitLab wiki syntax) — KHÔNG render trong Huly.
> Plain issue key (vd `PD-12`) stays text, KHÔNG auto-link.

## Issue templates (task lặp qua milestone)

Khi nhiều milestone dùng chung task structure (vd "setup CI", "add tests"):

```text
huly_create_issue_template(
  project="PD",
  title="Setup CI Pipeline",
  description=<markdown template>,
  children=[  // sub-task templates
    { title="Add lint job", description="..." },
    { title="Add test job", description="..." }
  ]
)
```
Tạo issue từ template:

```text
huly_create_issue_from_template(
  project="PD",
  template="Setup CI Pipeline",
  includeChildren=true  // tự sinh sub-issues
)
```
## Task types + statuses (discover trước khi create)

Huly có default workflow (Backlog/Todo/In Progress/In Review/Done) nhưng mỗi
project type + task type có thể khác. Discover:

```text
huly_get_project_type(project="PD")       // hoặc huly_list_project_types
→ trả task types + statuses + categories

huly_list_statuses(project="PD")          // statuses available
huly_list_task_types(project="PD")        // task types available
```
`huly_create_issue` validate status theo task type workflow. Sai → error.

## Lifecycle (task-implement workflow)

Các method cho task-implement workflow (backlog → todo → in progress → in
review → done/canceled).

### Status discovery + transition

```text
# Discover valid statuses
huly_list_statuses(project="PD")
→ [{name:"Backlog",category:"UnStarted"}, {name:"In Progress",category:"Active"}, ...]

# Transition status
huly_update_issue(project="PD", identifier="PD-5", status="In Progress")
```
> `status` = workflow NAME (string, vd "In Progress"), KHÔNG phải statusCategory.
> Sai name → error. Verify via `huly_list_statuses` trước.

### claim (assign)

```text
huly_update_issue(
  project="PD",
  identifier="PD-5",
  assignee="john@example.com"  # email (preferred)
)
# HOẶC display name (format LastName,FirstName — KHÔNG space):
huly_update_issue(
  project="PD",
  identifier="PD-5",
  assignee="Doe,John"  # LastName,FirstName — EXACT match với huly_list_employees
)
```
> ⚠️ **Display name format**: Huly dùng `LastName,FirstName` (vd `Còi,Nai`), KHÔNG
> phải `Nai Còi` (space) hay `Nai Còi` (natural order). Sai format → "Person not
> found" error.
>
> **Best practice**: dùng **email** (vd `nai@example.com`) — exact match, KHÔNG
> cần đoán format. Hoặc query `huly_list_employees` trước để lấy exact display name.
>
> "Chính mình" = account hiện tại. Lấy qua `huly_get_user_profile()` (no params) →
> dùng email từ result cho assignee.

### comment (markdown)

```text
huly_add_comment(
  project="PD",
  issueIdentifier="PD-5",   # issueIdentifier, KHÔNG phải identifier
  body="Spec mismatch: API X đã đổi thành Y. Đã update spec."
)
```
Body hỗ trợ markdown + native reference (browse-URL link).

### listComments

```text
huly_list_comments(project="PD", issueIdentifier="PD-5")
→ [{body, author, createdOn}, ...]
```
### logTime (effort tracking)

```text
huly_log_time(
  project="PD",
  identifier="PD-5",     # identifier (KHÔNG phải issueIdentifier — inconsistency!)
  value=120,             # minutes (int, positive)
  description="Implement auth module"
)
```
### addArtifact (test output, screenshot)

```text
huly_add_issue_attachment(
  project="PD",
  identifier="PD-5",     # identifier (KHÔNG phải issueIdentifier!)
  filename="test-output.txt",
  contentType="text/plain",
  filePath="/tmp/test-output.txt"   # preferred (hoặc fileUrl hoặc data base64)
)
```
### createSubTask (sub-task checklist trong issue)

```text
huly_create_todo(
  title="Verify edge case null input",
  attachedTo={type: "issue", project: "PD", identifier: "PD-5"},
  description="Test null input handling trong auth module",
  owner="john@example.com"?   # optional, default = authenticated user
)
```
### cancel (hủy task, KHÔNG delete)

```text
huly_update_issue(
  project="PD",
  identifier="PD-5",
  status="Canceled"   # Lost category name, discover via huly_list_statuses
)
huly_add_comment(
  project="PD",
  issueIdentifier="PD-5",
  body="Canceled: spec drift quá lớn. Tạo issue mới PD-12 với spec đúng."
)
```
> KHÔNG dùng `huly_delete_issue` (permanent). Cancel = status Lost + comment reason.
> Giữ history audit trail. Subagent headless (ctx.hasUI=false) → confirm gate
> auto-deny delete (FR-09).

### getCurrentUser

```text
huly_get_user_profile()
→ {name, email, bio, ...}
```
Dùng cho "assign chính mình" rule.

## Param inconsistency reference (QUAN TRỌNG)

pi-huly bundle KHÔNG nhất quán param name cho issue locator (inherit schema từ
`@hcengineering/*`). **Verify từng tool trước khi gọi. Sai param name → validation error.**

**Dùng `identifier`** (10 tool):

| Tool | Params |
|---|---|
| `huly_get_issue` | project + identifier |
| `huly_update_issue` | project + identifier |
| `huly_set_issue_milestone` | project + identifier |
| `huly_set_issue_component` | project + identifier |
| `huly_move_issue` | project + identifier |
| `huly_log_time` | project + identifier |
| `huly_add_issue_attachment` | project + identifier |
| `huly_add_issue_label` | project + identifier + label |
| `huly_remove_issue_label` | project + identifier + label |
| `huly_delete_issue` | project + identifier |

**Dùng `issueIdentifier`** (5 tool):

| Tool | Params |
|---|---|
| `huly_add_comment` | project + issueIdentifier |
| `huly_list_comments` | project + issueIdentifier |
| `huly_list_issue_relations` | project + issueIdentifier |
| `huly_link_document_to_issue` | project + issueIdentifier |
| `huly_add_issue_relation` | project + issueIdentifier (source) + targetIssue |

> Cả 2 đều nhận type `IssueIdentifier` (string vd "PD-1" hoặc "1"). Chỉ tên param
> khác. Khi code, map đúng tên.
