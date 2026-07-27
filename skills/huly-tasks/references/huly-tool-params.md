# Huly Tool Params — field reference đầy đủ (verified schema)

Bảng params CHÍNH XÁC cho mỗi huly tool, verify từ pi-huly bundle (domains/*.ts).
Đọc reference này TRƯỚC khi gọi huly tool để tránh sai param (thử mò).

## Quy ước chung

- **Required**: KHÔNG có `optional()`. Bắt buộc truyền.
- **Optional**: có `optional()`. Có thể bỏ qua (dùng default hoặc KHÔNG set).
- **Nullable**: `NullOr(Type)` — truyền `null` để clear, hoặc giá trị để set.
- **Issue locator**: 2 tên param KHÁC NHAU tùy tool — xem "Param inconsistency" cuối file.
- **Priority normalize**: input được normalize (bỏ `-`,`_`,space + lowercase) rồi match.
  Vd `"no-priority"`, `"nopriority"`, `"No Priority"` đều OK.
- **Timestamp**: Unix timestamp **milliseconds** (int). Vd `1719792000000` = 2024-07-01.
  KHÔNG phải ISO string. Convert: `date -d "2024-07-01" +%s` × 1000.

## PersonRefInput (assignee / owner) — QUAN TRỌNG

```text
PersonRefInput = Union(Email, PersonName)
```

| Type | Format | Ví dụ | Lưu ý |
|---|---|---|---|
| **Email** (preferred) | `xxx@yyy` (regex `^[^@]+@[^@]+$`) | `nai@example.com` | Exact match, KHÔNG đoán format |
| **PersonName** | Display name Huly `LastName,FirstName` | `Còi,Nai` | KHÔNG space, KHÔNG `Nai Còi`. Case-sensitive. Exact match |

> **Best practice**: dùng EMAIL (exact, KHÔNG đoán format). Nếu chỉ biết tên →
> query `huly_list_employees` trước để lấy exact display name (`Còi,Nai` format).
> "Chính mình" = `huly_get_user_profile()` → dùng email từ result.
>
> **Sai format → "Person not found" error.** Đây là lỗi phổ biến nhất.

## huly_create_issue

Tạo issue mới. Trả issue identifier (vd `"PD-1"`).

| Field | Required | Type | Format / Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | Project identifier 1-5 uppercase chars |
| `title` | Yes | string | `"[T-01] [S] Skeleton"` | NonEmpty |
| `description` | No | string (markdown) | `"## Mục tiêu\n..."` | Huly browse-URL → native ref |
| `priority` | No | enum string | `"high"` | Values: `urgent`/`high`/`medium`/`low`/`no-priority`. Normalize OK |
| `assignee` | No | PersonRefInput | `"nai@example.com"` HOẶC `"Còi,Nai"` | Xem PersonRefInput section trên |
| `status` | No | string | `"Todo"` | Workflow status NAME (vd "Todo", "In Progress"). Default project nếu omit |
| `taskType` | No | string | `"Bug"` | Task type ID hoặc display name. Default "Issue" nếu omit |
| `parentIssue` | No | string | `"PD-10"` | Parent issue identifier (tạo sub-issue) |
| `dueDate` | No | int (ms) HOẶC null | `1719792000000` | Unix ms. `null` = clear |
| `estimation` | No | int (minutes) | `120` | Positive number |

> **KHÔNG nhận**: `milestone`, `component`, `labels`. Phải set SAU qua tool riêng
> (`huly_set_issue_milestone`, `huly_set_issue_component`, `huly_add_issue_label`).

## huly_update_issue

Update issue. Chỉ field truyền mới đổi.

| Field | Required | Type | Format / Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `identifier` | Yes | string | `"PD-5"` HOẶC `"5"` | **`identifier`** (KHÔNG `issueIdentifier`) |
| `title` | No | string | `"New title"` | |
| `description` | No | string (markdown) HOẶC null | `"..."` | `null` = clear |
| `priority` | No | enum string | `"high"` | |
| `assignee` | No | PersonRefInput HOẶC null | `"nai@example.com"` | `null` = unassign |
| `status` | No | string | `"In Progress"` | Workflow status NAME. Validate theo task type |
| `taskType` | No | string | `"Bug"` | Status preserved only if valid cho new task type |
| `dueDate` | No | int (ms) HOẶC null | `1719792000000` | `null` = clear |
| `estimation` | No | int (minutes) HOẶC null | `120` | `null` = clear |

## huly_get_issue

Đọc issue full details.

| Field | Required | Type | Ví dụ |
|---|---|---|---|
| `project` | Yes | string | `"PD"` |
| `identifier` | Yes | string | `"PD-5"` HOẶC `"5"` |

> **`identifier`** (KHÔNG `issueIdentifier`).

## huly_list_issues

Query issues với filter.

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `status` | No | string | `"Todo"` | Exact workflow status NAME |
| `statusCategory` | No | enum string | `"ToDo"` | Values: `UnStarted`/`ToDo`/`Active`/`Won`/`Lost` |
| `assignee` | No | PersonRefInput | `"nai@example.com"` | |
| `component` | No | string | `"Phase 0 Foundation"` | Component label hoặc ID |
| `parentIssue` | No | string | `"PD-10"` | List children của issue |
| `titleSearch` | No | string | `"auth"` | Case-insensitive substring |
| `descriptionSearch` | No | string | `"login"` | Fulltext search description |
| `limit` | No | int | `50` | Default 50, max 200 |

> **KHÔNG filter theo**: `milestone`, `priority`, `labels`. Phải filter locally.
> **Sort**: modification date (newest first). KHÔNG sort topology/priority.

## huly_add_comment

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `issueIdentifier` | Yes | string | `"PD-5"` HOẶC `"5"` | **`issueIdentifier`** (KHÔNG `identifier`) |
| `body` | Yes | string (markdown) | `"Spec mismatch: ..."` | NonEmpty. Huly browse-URL → native ref |

## huly_list_comments

| Field | Required | Type | Ví dụ |
|---|---|---|---|
| `project` | Yes | string | `"PD"` |
| `issueIdentifier` | Yes | string | `"PD-5"` |

> **`issueIdentifier`** (KHÔNG `identifier`).
> Sort: creation date (oldest first).

## huly_create_milestone

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `label` | Yes | string | `"M0 Foundation"` | Param tên `label` (KHÔNG `name`) |
| `description` | No | string (markdown) | `"Scope: ..."` | |
| `targetDate` | **Yes** | int (ms) | `1719792000000` | **BẮT BUỘC**, Unix ms. KHÔNG phải ISO string |

> Default status = `planned`.

## huly_update_milestone

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `milestone` | Yes | string | `"M0 Foundation"` | Milestone ID hoặc label |
| `label` | No | string | `"M0"` | Rename milestone |
| `description` | No | string HOẶC null | `null` | `null` = clear |
| `targetDate` | No | int (ms) | `1719792000000` | Unix ms |
| `status` | No | enum string | `"in-progress"` | Values: `planned`/`in-progress`/`completed`/`canceled` |

## huly_set_issue_milestone

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `identifier` | Yes | string | `"PD-5"` | **`identifier`** |
| `milestone` | Yes | string HOẶC null | `"M0 Foundation"` HOẶC `null` | `null` = clear milestone |

## huly_set_issue_component

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `identifier` | Yes | string | `"PD-5"` | **`identifier`** |
| `component` | Yes | string HOẶC null | `"Phase 0 Foundation"` HOẶC `null` | `null` = clear |

## huly_create_component

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `label` | Yes | string | `"Phase 0 Foundation"` | Param `label` (KHÔNG `name`) |
| `description` | No | string (markdown) | `"Skeleton, config..."` | |
| `lead` | No | PersonRefInput | `"nai@example.com"` | Component lead |

## huly_add_issue_label

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `identifier` | Yes | string | `"PD-5"` | **`identifier`** |
| `label` | Yes | string | `"pd:PD:phase-0"` | Label title. Auto-create nếu chưa có |

## huly_remove_issue_label

| Field | Required | Type | Ví dụ |
|---|---|---|---|
| `project` | Yes | string | `"PD"` |
| `identifier` | Yes | string | `"PD-5"` |
| `label` | Yes | string | `"pd:PD:phase-0"` |

> **`identifier`** (KHÔNG `issueIdentifier`).

## huly_create_label

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `title` | Yes | string | `"pd:PD:phase-0"` | Param `title` (KHÔNG `name`/`label`) |
| `color` | No | int (0-23) | `4` | **Palette INDEX** (KHÔNG hex string). Default = DEFAULT_COLOR_INDEX |
| `description` | No | string | `"Phase 0 label"` | |
| `category` | No | string | `"phase"` | Category ID hoặc label name. Default "Other" |

> ⚠️ `color` = int 0-23 (Huly palette), KHÔNG phải `"#3498db"`. Sai type → error.

## huly_add_issue_relation

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | Project của SOURCE issue |
| `issueIdentifier` | Yes | string | `"PD-2"` | Source issue. **`issueIdentifier`** |
| `targetIssue` | Yes | string | `"PD-5"` HOẶC `"OTHER-42"` | Target. Cross-project OK |
| `relationType` | Yes | enum string | `"is-blocked-by"` | Values: `blocks`/`is-blocked-by`/`relates-to` |

> `blocks`: source blocks target. `is-blocked-by`: source blocked by target.
> `relates-to`: bidirectional. No-op nếu relation đã tồn tại.

## huly_list_issue_relations

| Field | Required | Type | Ví dụ |
|---|---|---|---|
| `project` | Yes | string | `"PD"` |
| `issueIdentifier` | Yes | string | `"PD-5"` |

> **`issueIdentifier`**. Trả: `blockedBy[]`, `blocks[]`, `relations[]`, `documents[]`.

## huly_link_document_to_issue

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `issueIdentifier` | Yes | string | `"PD-5"` | **`issueIdentifier`** |
| `teamspace` | Yes | string | `"Project Design Docs"` | Teamspace name hoặc ID |
| `document` | Yes | string | `"03 - Tech Stack"` | Document title hoặc ID |

## huly_move_issue

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `identifier` | Yes | string | `"PD-15"` | **`identifier`** |
| `newParent` | Yes | string HOẶC null | `"PD-10"` HOẶC `null` | `null` = top-level (bỏ parent) |

## huly_log_time

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `identifier` | Yes | string | `"PD-5"` | **`identifier`** |
| `value` | Yes | int (minutes) | `120` | Positive. KHÔNG phải hours/seconds |
| `description` | No | string | `"Implement auth module"` | |

## huly_create_todo (sub-task checklist)

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `title` | Yes | string | `"Verify null input"` | |
| `description` | No | string (markdown) | `"Test edge case"` | |
| `owner` | No | PersonRefInput | `"nai@example.com"` | Default = authenticated user |
| `dueDate` | No | int (ms) | `1719792000000` | Unix ms |
| `priority` | No | enum string | `"high"` | ToDo priority |
| `visibility` | No | enum string | `"public"` | Default public cho issue todo |
| `attachedTo` | No | object | `{type:"issue", project:"PD", identifier:"PD-5"}` | Attach issue. Omit = personal todo |

> `attachedTo` structure: `{type: "issue", project: "PD", identifier: "PD-5"}`
> (object, KHÔNG string). `identifier` trong attachedTo (KHÔNG `issueIdentifier`).

## huly_add_issue_attachment

| Field | Required | Type | Ví dụ | Ghi chú |
|---|---|---|---|---|
| `project` | Yes | string | `"PD"` | |
| `identifier` | Yes | string | `"PD-5"` | **`identifier`** |
| `filename` | Yes | string | `"test-output.txt"` | |
| `contentType` | Yes | string | `"text/plain"` | MIME type |
| `filePath` | No | string | `"/tmp/test.txt"` | Local path (preferred) |
| `fileUrl` | No | string | `"https://..."` | Remote URL |
| `data` | No | string (base64) | `"SGVsbG8="` | Base64 (small files <10KB) |
| `description` | No | string | `"Test output"` | |

> CHÍNH XÁC 1 trong: `filePath` / `fileUrl` / `data`.

## huly_list_statuses

| Field | Required | Type | Ví dụ |
|---|---|---|---|
| `project` | Yes | string | `"PD"` |

> Trả: `[{name, category, isDefault}]`. `category` = `UnStarted`/`ToDo`/`Active`/`Won`/`Lost`.

## huly_get_user_profile

| Field | Required | Type |
|---|---|---|
| (none) | — | — |

> Trả: `{name, email, bio, ...}`. Dùng cho "chính mình" assign.

## huly_list_employees

| Field | Required | Type | Ví dụ |
|---|---|---|---|
| `limit` | No | int | `50` |

> Trả: `[{id, name, active, url, modifiedOn}]`. `name` = display name format
> `LastName,FirstName` (vd `Còi,Nai`). Dùng để lookup assignee exact name.

---

## Param inconsistency reference (QUAN TRỌNG)

pi-huly bundle KHÔNG nhất quán param name cho issue locator (inherit schema từ
`@hcengineering/*`). **Verify từng tool trước khi gọi. Sai param name → validation error.**

**Dùng `identifier`** (10 tool — group 1):

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

**Dùng `issueIdentifier`** (5 tool — group 2):

| Tool | Params |
|---|---|
| `huly_add_comment` | project + issueIdentifier |
| `huly_list_comments` | project + issueIdentifier |
| `huly_list_issue_relations` | project + issueIdentifier |
| `huly_link_document_to_issue` | project + issueIdentifier |
| `huly_add_issue_relation` | project + issueIdentifier (source) + targetIssue |

> Cả 2 đều nhận type `IssueIdentifier` (string vd "PD-1" hoặc "1"). Chỉ tên param
> khác. Khi code, map đúng tên.

## Lỗi phổ biến (tránh)

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| "Person not found" | assignee sai format (`"Nai Còi"` thay vì `"Còi,Nai"` hoặc email) | Dùng email, hoặc `huly_list_employees` lookup |
| "Unknown key issueIdentifier" | Tool group 1 nhận `identifier` nhưng truyền `issueIdentifier` | Check group trong bảng trên |
| "Unknown key identifier" | Tool group 2 nhận `issueIdentifier` nhưng truyền `identifier` | Check group |
| Status validation error | Sai status name (guess thay vì `huly_list_statuses`) | `huly_list_statuses` trước |
| targetDate schema error | Truyền ISO string thay vì Unix ms int | `date +%s` × 1000 |
| color schema error | Truyền hex `"#3498db"` thay vì palette index `4` | Dùng int 0-23 |
| huly_create_issue missing milestone | Truyền `milestone` vào `huly_create_issue` | `huly_set_issue_milestone` sau create |
