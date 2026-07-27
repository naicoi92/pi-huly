---
name: huly-docs
description: "Huly Documents storage adapter cho DocStore của skill `project-design`. Khi skill `project-design` invoke DocStore=huly, dùng skill này. Cũng dùng khi user muốn lưu design docs / spec / tài liệu thiết kế vào Huly Documents (Notion-like) qua native huly tools (KHÔNG MCP — gọi thẳng qua extension pi-huly): `lưu design docs vào Huly`, `Huly documents setup`, `sync spec lên Huly`, `lưu tài liệu thiết kế Huly`. Map DocStore methods (setup, saveDoc, patchDoc, readDoc, listDocs, interlink, searchDocs, getHistory) sang huly tools (huly_create_teamspace, huly_create_document, huly_edit_document, huly_get_document, huly_list_documents, huly_fulltext_search, huly_list_document_snapshots). Đọc skill này khi core gọi DocStore=huly."
---

# Skill: huly-docs

Huly Documents storage adapter — implement DocStore interface (xem
`project-design/references/adapter-contract.md`) cho Huly Documents module qua
**native huly tools** (extension `pi-huly`, gọi thẳng WebSocket API — KHÔNG MCP).
Map mọi DocStore method sang huly tool có sẵn (tên tool prefix `huly_`).

## Khi nào trigger

1. **Invoked bởi `project-design`** khi user chọn DocStore = `huly-docs` ở
   Bước 0. Core gọi DocStore method → skill này chỉ tool tương ứng.
2. **User mention trực tiếp**: "lưu docs vào Huly", "Huly documents",
   "sync spec lên Huly".

## Khi nào KHÔNG dùng

- Lưu design docs trong GitLab Wiki → skill `gitlab-docs` (tương lai) hoặc
  `gitlab-project-design` (hiện tại).
- Lưu docs local trong repo → core built-in `local-docs`, không cần skill này.
- Lưu task/issues (không phải docs) → skill `huly-tasks`.

## Yêu cầu: extension pi-huly đã cài + binding

Skill này giả định extension `pi-huly` đã cài qua `pi install pi-huly` + workspace
đã bind qua `/huly init` (auth choice + workspace binding tới cwd). Nếu chưa →
đọc `references/pi-huly-setup.md` cho hướng dẫn setup (install, init flow, verify).

> ⚠️ **Verify trước khi dùng**: chạy command `/huly status` (built-in diagnostic
> của pi-huly) để confirm extension load + workspace bind + config OK. Trả
> version + workspace resolved + binding map (KHÔNG lộ token).

## DocStore → huly tool mapping

Bảng này là core content. Khi `project-design` gọi DocStore method, dùng huly tool
tương ứng (tất cả tool prefix `huly_`):

| DocStore method | huly tool | Ghi chú |
|---|---|---|
| `setup()` | `huly_create_teamspace` (idempotent) + `huly_create_document` (Home/index) | 1 teamspace cho cả design docs của project |
| `saveDoc` (tạo mới) | `huly_create_document` | Markdown + **Mermaid render native** |
| `saveDoc` (update toàn body) | `huly_edit_document` mode `content` | Replace toàn markdown |
| `patchDoc(id, oldText, newText)` | `huly_edit_document` mode `old_text`+`new_text` | Targeted replace. Error nếu multiple match trừ khi `replace_all=true`; `new_text` rỗng = delete |
| `readDoc(id)` | `huly_get_document` | Trả markdown content + `url` field tới web app |
| `listDocs()` | `huly_list_documents(teamspace=<teamspace>)` | `teamspace` BẮT BUỘC (verified schema). Có `url` field mỗi doc + hỗ trợ `titleSearch`/`contentSearch` |
| `interlink(targetId, displayText?)` | Markdown link tới Huly browse URL | KHÔNG dùng `[[Page]]` (đó là GitLab wiki). Xem "Interlink format" bên dưới |
| `searchDocs(keyword)` | `huly_fulltext_search` | Global, search issues+documents+messages, relevance sort |
| `getHistory(id)` | `huly_list_document_snapshots` + `huly_get_document_snapshot` | snapshotId/title/createdOn resolver |

### Chi tiết method

**`setup()`** — chạy 1 lần đầu Bước 0:

```text
1. huly_create_teamspace(name="<ProjectName> Design Docs")
   → idempotent, trả existing nếu trùng tên
2. huly_create_document(teamspace, title="Home", content="# <ProjectName> Design Docs\n\nIndex...")
   → Home/index doc
```
**`saveDoc(id, title, content)`** — resolve id:

- Nếu doc `id` chưa tồn tại (check `huly_list_documents` titleSearch) → `huly_create_document`
- Nếu đã tồn tại → `huly_edit_document` mode `content` (replace toàn body)
- Map `id` ↔ Huly document title (vd `01-vision` ↔ `01 - Vision & Decision Log`)

**`patchDoc(id, oldText, newText)`** — audit fix nhỏ:

```text
huly_edit_document(
  document=<id hoặc title>,
  old_text=<oldText>,
  new_text=<newText>,
  replace_all=false  # true nếu muốn replace mọi match
)
```
- `new_text` rỗng → delete matched text
- Error nếu `old_text` match nhiều chỗ + `replace_all=false` → user decide

**`interlink(targetId, displayText)`** — KHÔNG dùng `[[Page]]`. Huly dùng
**markdown link tới browse URL**:

```markdown
[<displayText>](<huly-browse-url-có-_class-_id-_label>)
```
Cách lấy browse URL: từ kết quả `huly_get_document`/`huly_list_documents`, field
`url`. Markdown link có `_class`,`_id`,`label` → Huly tự convert thành **native
reference**; external URL stays normal link; plain issue key (vd `PROJ-123`)
stays text.

> Khi viết content doc mới, nếu chưa có browse URL (doc target chưa tạo) →
> dùng plain title làm placeholder text + cập nhật sau khi target tồn tại.

**`searchDocs(keyword)`** — `huly_fulltext_search` search global. Lọc kết quả cho
teamspace hiện tại nếu cần.

## Gotchas

1. **Document content = Markdown native + Mermaid native**. Giữ nguyên quy ước
   `diagram-format.md` của core gần 100%.
2. **Interlink KHÔNG phải `[[Page]]`** — đó là GitLab wiki syntax. Huly dùng
   browse-URL markdown link. Sai syntax = link không native.
3. **`huly_edit_document` targeted replace** error nếu multiple match. Dùng
   `replace_all=true` cẩn thận (có thể replace nhầm chỗ không mong muốn).
4. **`huly_get_document` content rỗng** → check binding `/huly status` (front
   service URL resolve qua config workspace binding, KHÔNG phải env var).
5. **Snapshots đã có sẵn** (Huly tự snapshot) — không cần tự quản version.
   Dùng `huly_list_document_snapshots` để xem history, `huly_get_document_snapshot`
   để đọc content tại 1 thời điểm.
6. **Real-time collaborative edit**: nếu user đang edit doc trên web UI cùng
   lúc agent update → conflict. Huly resolve qua change history nhưng verify
   sau update.
7. ⚠️ **Hosted Huly (huly.app) SaaS đã ngừng hoạt động** (deadline shutdown
   2026-07-20 đã qua). Nếu user dùng huly.app SaaS → cảnh báo Bước 0: export +
   migrate self-host. Self-host KHÔNG affected.
8. **Idempotency**: `huly_create_teamspace` + `huly_create_document` idempotent
   (trả existing nếu trùng). An toàn retry.
9. **`huly_delete_document` permanent** — KHÔNG undo. Huly KHÔNG có soft-delete.
   Chỉ delete khi chắc chắn (confirm gate FR-09 áp dụng — subagent headless auto-deny).

## Quy ước doc title + id

Map giữa DocStore `id` (ổn định) ↔ Huly document `title` (display):

| DocStore id | Huly title | Note |
|---|---|---|
| `home` | `Home` | Index doc |
| `01-vision` | `01 - Vision & Decision Log` | Prefix số sort |
| `07-uc-01-stream` | `07 - UC-01 - User Stream Live` | Use case |
| `09-roadmap` | `09 - Implementation Roadmap` | |

> Id KHÔNG đổi dù rename title. Lưu mapping trong scratch `docs/design/.huly-map.json`
> nếu cần (JSON `{ "01-vision": "<huly-doc-id>" }`). Hoặc resolve qua
> `huly_list_documents` titleSearch mỗi lần (đơn giản hơn, idempotent).

## Progressive disclosure

- `references/pi-huly-setup.md` — config `pi-huly` (install extension, `/huly init`
  flow, auth choice, workspace binding, `/huly status` verify). Đọc khi setup hoặc
  troubleshoot.
- `references/doc-format.md` — Huly-specific markdown conventions (Mermaid,
  browse-URL link syntax, mention). Đọc khi viết content doc.
