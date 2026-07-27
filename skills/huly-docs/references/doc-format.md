# Huly Documents — Markdown conventions

Quy ước viết content cho Huly Documents. Khác biệt chính với GitLab wiki: Huly
dùng **Markdown native + Mermaid native + browse-URL link** (KHÔNG phải `[[Page]]`).

## Mermaid — render native

Huly render ` ```mermaid ` fence thành diagram tương tác. Giữ nguyên quy ước
`diagram-format.md` của core.

```markdown
\`\`\`mermaid
flowchart LR
    A[Client] --> B[API]
\`\`\`
```
> Khi viết trong doc, dùng 3-tick fence (` ```mermaid `). KHÔNG cần HTML trick.

## Code block — syntax highlight tự động

```markdown
\`\`\`rust
pub fn hello() -> String { "hi".into() }
\`\`\`

\`\`\`toml
[server]
port = 8080
\`\`\`
```
## Interlink — browse-URL markdown link (KHÔNG `[[Page]]`)

Đây là điểm khác biệt lớn nhất vs GitLab wiki. Huly KHÔNG dùng `[[Page Name]]`.

### Native reference (tới object Huly)

Markdown link có URL chứa `_class`, `_id`, `_label` → Huly tự convert thành
**native reference** (clickable, hiện metadata):

```markdown
[03 - Tech Stack & Architecture](https://<workspace>.huly.io/browse/tracker:Document:_id=xxx&_class=...&_label=03%20-%20Tech%20Stack)
```
Cách lấy URL: từ kết quả `huly_get_document` / `huly_list_documents`, đọc field
`url`. Round-trip: Huly browse link trong `huly_get_document` content → native
reference khi re-save.

### Plain text reference

- Plain issue key (vd `PROJ-123`) → **stays text** (KHÔNG auto-link).
- Plain doc title (vd `01 - Vision`) → stays text.

Muốn link → phải dùng browse-URL markdown link.

### External URL

```markdown
[External docs](https://example.com/docs)
```
Stays normal markdown link. KHÔNG convert native.

## Mention (@)

Huly support `@mention` người trong workspace:

```markdown
@John Doe please review this ADR.
```
> Project-design workflow thường KHÔNG cần mention (design là làm với user
> qua chat, KHÔNG qua Huly comments). Mention optional.

## Table — render đẹp

```markdown
| Layer | Tech | Version |
|---|---|---|
| Lang | Rust | 1.91 |
```
## Checklist — tương tác

Huly render `- [ ]` thành checkbox click được:

```markdown
## Verify
- [ ] build pass
- [ ] test pass
```
## Khi nào dùng huly_create_document vs huly_edit_document

| Tình huống | Tool |
|---|---|
| Doc mới (Bước N lần đầu) | `huly_create_document` |
| Rewrite toàn body (update lớn Bước N) | `huly_edit_document` mode `content` |
| Fix nhỏ 1-2 câu (audit) | `huly_edit_document` mode `old_text`+`new_text` |
| Rename title | `huly_edit_document` với `title` param |

## Resolve document — cách truyền identifier

Nhiều tool accept document locator theo nhiều dạng:

- Title exact: `01 - Vision & Decision Log`
- Document id (Huly native): `<uuid>`

Ưu tiên title exact (dễ đọc, khớp DocStore id mapping). Nếu title ambiguous →
dùng id.

## Nested document (parent-child)

`huly_create_document(parent=<title-or-id>)` tạo child document. Hỗ trợ cấu trúc
folders. Invalid parent → error (KHÔNG silently tạo top-level).

> Project-design KHÔNG dùng nested thường — flat structure với prefix số
> (`01 -`, `02 -`...) đủ sort + nhận diện. Nested optional cho use case phức tạp.

## Size limit

Document lớn (>1000 dòng markdown) render chậm. Nếu doc phình (vd `08 - Non-
Functional` nhiều subsection) → tách thành child docs hoặc reference file riêng.
Audit phải search cả parent + children.
