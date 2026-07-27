# T-53 — Hướng dẫn runtime verify 3 class UNVERIFIED

> User tự test trên self-host Huly thật. Paste kết quả vào issue #39 + #43.

## Prerequisite

- Self-host Huly `@hcengineering/*@0.7.423` (hoặc version tương đương)
- pi-huly đã bind workspace qua `/huly init` (URL + auth)

```bash
# Verify binding
/huly status
# Hoặc check package version
cat node_modules/pi-huly/package.json | grep version
```text

## 3 class cần verify

| Class ref hiện tại | Dùng ở đâu | Triệu chứng nếu sai |
|---|---|---|
| `view:class:Label` | `labels.ts`, `issues-core.ts` (add/remove_issue_label) | `domain not found: view:class:Label` khi `huly_list_labels` hoặc `huly_add_issue_label` |
| `core:class:TsRelation` | `issues-relations.ts` (add/remove/list_issue_relation) | `domain not found: core:class:TsRelation` khi `huly_add_issue_relation` (issue #39) |
| `document:class:DocumentSnapshot` | `document-snapshots.ts` | `domain not found: document:class:DocumentSnapshot` khi `huly_list_document_snapshots` |

## Test procedure

### Test 1: Class registry dump (verify tồn tại)

Gọi tool (hoặc qua MCP direct):

```
huly_fulltext_search({ query: "Class" })  # KHÔNG reliable — search không list class
```text

**Cách tốt nhất**: dùng Huly DevTools / admin panel inspect class registry. Tìm 3 class:
- `view:class:Label`
- `core:class:TsRelation`
- `document:class:DocumentSnapshot`

**Output cần paste**:
```
Class registry contains:
- view:class:Label: [FOUND / NOT FOUND]
- core:class:TsRelation: [FOUND / NOT FOUND]
- document:class:DocumentSnapshot: [FOUND / NOT FOUND]
```text

### Test 2: Direct probe từng class

#### 2a. Label probe

```
huly_list_labels({})
```text

**Expected (nếu class đúng)**: `Found N label(s).` + list labels.
**If error**: `domain not found: view:class:Label` → class sai, cần tìm đúng.

**Alternative class candidates** (nếu `view:class:Label` sai):
- `tags:class:Label` (có thể Huly gộp Label vào tags package)
- `core:class:Label`
- Label deprecated, thay bằng `tags:class:TagElement` (đã dùng ở `tags.ts`)

#### 2b. TsRelation probe

Tạo issue A + B, rồi:

```
huly_add_issue_relation({
  identifier: "PD-1",  # issue A
  targetIssue: "PD-2", # issue B
  relationType: "blocks"
})
```text

**Expected (nếu class đúng)**: `Added relation PD-1 -[blocks]-> PD-2.`
**If error**: `domain not found: core:class:TsRelation` → class sai (issue #39).

**Alternative hypotheses**:
- Issue relations stored inline (`Issue.relations?: RelatedDocument[]`) — KHÔNG qua class riêng
- Nếu inline → cần refactor `add/remove/list_issue_relation` dùng `$push/$pull` trên `Issue.relations` thay vì
  `addCollection(TS_RELATION_CLASS, ...)`

#### 2c. DocumentSnapshot probe

Tạo document, edit vài lần (tạo snapshot), rồi:

```
huly_list_document_snapshots({ document: "<doc-id>" })
```text

**Expected (nếu class đúng)**: `Found N snapshot(s).`
**If error**: `domain not found: document:class:DocumentSnapshot` → class sai.

**Alternative candidates**:
- `tracker:class:DocumentSnapshot` (Document đã move sang tracker pkg theo T-43)
- `chunter:class:DocumentSnapshot`

## Output template (paste vào #39 + #43)

```markdown
## T-53 Runtime verify results

**Environment**: self-host Huly `@hcengineering/*@0.7.423` (hoặc version X)
**Date**: YYYY-MM-DD
**Tester**: <name>

### Results

| Class ref | Verdict | Evidence |
|---|---|---|
| `view:class:Label` | FOUND / NOT FOUND / RENAMED → `<new-ref>` | <paste output hoặc error> |
| `core:class:TsRelation` | FOUND / NOT FOUND / INLINE (Issue.relations) | <paste output hoặc error> |
| `document:class:DocumentSnapshot` | FOUND / NOT FOUND / RENAMED → `<new-ref>` | <paste output hoặc error> |

### Action needed

- [ ] Nếu class RENAMED → update `_class-refs.ts` + audit truth table
- [ ] Nếu TsRelation INLINE → refactor 3 tool relations (separate task)
- [ ] Nếu FOUND → update audit §7 "VERIFIED" + add regression test
```

## Sau khi verify

Paste kết quả vào:
- GitHub issue #39 (TsRelation bug)
- GitHub issue #43 (investigation)

Hoặc gửi trực tiếp cho tôi, tôi sẽ:
1. Update `_class-refs.ts` nếu class sai
2. Update `docs/design/11-runtime-audit.md` §7 truth table
3. Refactor `add/remove/list_issue_relation` nếu TsRelation inline
4. Close T-53 + link kết quả

## Known context

- Audit §7 hiện tại dựa trên npm tarball source map extraction (KHÔNG runtime — workvps unavailable).
- 3 class này là root cause của warning `no document found, failed to apply model transaction, skipping
  _class="core:class:Tx*"` spam.
- Defensive fix đã ship ở T-49 (Promise.allSettled cho search) + T-52 (FK validate) — không block user khi class sai,
  nhưng root cause vẫn cần verify.
