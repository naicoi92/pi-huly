# Runtime Audit — Huly class refs + storage + search + addCollection

> T-44 output. Source of truth cho T-41/T-42/T-43/T-45/T-46 implement.
> Audit method: **npm tarball source map extraction** (KHÔNG runtime server —
> self-host `workvps` unavailable; packages npm public có source map embed
> TypeScript source gốc). Version audited: `@hcengineering/*@0.7.423`.
>
> Ngày audit: 2026-07-27. Repo source: `hcengineering/platform` branch `develop`
> (package `@hcengineering/*@0.7.423`).

## Methodology

```bash
# Tải tarball npm + extract (source map embed TypeScript gốc)
curl -sL "https://registry.npmjs.org/@hcengineering/<pkg>/-/<pkg>-0.7.423.tgz" | tar xz
# Compiled JS có plugin() call với class/mixin keys (empty value — runtime generate)
# Source map (lib/index.js.map) có sourcesContent embed full TypeScript source
python3 -c "
import json
with open('<pkg>/lib/index.js.map') as f: data = json.load(f)
for s in data.get('sourcesContent', []):
    if s: print(s)  # full .ts source gốc
"
```

Evidence cấp độ:
- **STRONG**: TypeScript interface source rõ ràng (sourcesContent).
- **MEDIUM**: plugin() class/mixin block keys (empty value, runtime generate).
- **WEAK**: inference từ package structure (chỉ khi thiếu source).

## 1. Class registry truth table (T-43 input)

| pi-huly hiện tại | Source thật | Package | Action | Evidence |
|---|---|---|---|---|
| `contact:class:Person` | `contact:class:Person` ✓ | contact class block | **KEEP** | MEDIUM (class block key) |
| `contact:class:Employee` | `contact:mixin:Employee` ✗ | contact **mixin** block | **FIX** | MEDIUM — Employee là **mixin**, KHÔNG phải class |
| `contact:class:Contact` | `contact:class:Contact` ✓ | contact class block | **KEEP** | MEDIUM |
| `tracker:class:Issue` | `tracker:class:Issue` ✓ | tracker class block | **KEEP** | STRONG (Issue interface source) |
| `tracker:class:Milestone` | `tracker:class:Milestone` ✓ | tracker class block | **KEEP** | STRONG (Milestone interface source) |
| `tracker:class:Component` | `tracker:class:Component` ✓ | tracker class block | **KEEP** | STRONG (Component interface source) |
| `tracker:class:Project` | `tracker:class:Project` ✓ | tracker class block | **KEEP** | STRONG (Project interface source) |
| `tracker:class:TaskType` | `task:class:TaskType` ✗ | **task** package (không tracker) | **FIX** | STRONG — TaskType interface define trong `@hcengineering/task`, import vào tracker |
| `tracker:class:IssueStatus` | `tracker:class:IssueStatus` ✓ | tracker class block | **KEEP** | STRONG |
| `tracker:class:IssueTemplate` | `tracker:class:IssueTemplate` ✓ | tracker class block | **KEEP** | STRONG |
| `tracker:class:ProjectType` | `task:class:ProjectType` ✗ | **task** package | **FIX** | STRONG — ProjectType extends SpaceType trong task package |
| `document:class:Document` | `tracker:class:Document` ✗ | **tracker** package (không document) | **FIX** | STRONG — Document interface define trong tracker source (line ~110). `@hcengineering/document` deprecated v0.7.0 |
| `document:class:DocumentSnapshot` | ? | ? | **VERIFY** runtime — không có trong tracker/document | WEAK |
| `document:class:Space` | `core:class:Space` ✗ | **core** package | **FIX** | STRONG — Space base class trong core/class block. Document/Teamspace extends TypedSpace |
| `chunter:class:ChatMessage` | `chunter:class:ChatMessage` ✓ | chunter class block | **KEEP** | MEDIUM |
| `attachment:class:Attachment` | `attachment:class:Attachment` ✓ | attachment class block | **KEEP** | MEDIUM |
| `tags:class:Tag` | `tags:class:TagElement` ✗ | tags class block | **FIX** | STRONG — class tên `TagElement`, KHÔNG `Tag`. TagElement là entity thật |
| `tags:class:TagCategory` | `tags:class:TagCategory` ✓ | tags class block | **KEEP** | STRONG |
| `view:class:Label` | ? | ? | **MISSING** — Label KHÔNG có trong view class/mixin. Có thể thuộc package khác hoặc KHÔNG tồn tại | WEAK |
| `activity:class:TimeSpendReport` | `tracker:class:TimeSpendReport`? | **tracker** pkg? | **VERIFY** runtime — interface define trong tracker source, nhưng pi-huly dùng activity pkg. Cần verify runtime truth (plugin install?) | MEDIUM |
| `core:class:TsRelation` | ? | ? | **MISSING** — TsRelation KHÔNG tồn tại trong core. Có `Relation`, `RelationMetadata`, `TypeRelatedDocument` nhưng không TsRelation | WEAK |
| `task:class:Todo` | `time:class:ToDo` ✗ | **time** package, chữ `ToDo` (viết hoa D) | **FIX** | STRONG — ToDo interface define trong `@hcengineering/time` |

### Pattern analysis (T-43 §Pattern lạ)

Root cause thật KHÔNG phải plugin thiếu / package typo. Mỗi case broken có 1 lý do riêng:

1. **`Employee` là mixin, không class** (`contact:mixin:Employee`). Huly runtime lookup
   mixin khác class → "domain not found" khi query như class. Pattern `contact:class:Person`
   ✓ (Person là class) NHƯNG `contact:class:Employee` ✗ (Employee là mixin) — sibling
   work vì Person là class thật.

2. **Cross-package class imports** (`task:class:TaskType`, `task:class:ProjectType`,
   `time:class:ToDo`). Huly tách domain logic: `task` package define Task/TaskType/
   ProjectType (generic task model), `tracker` package extends cho Issue (extends Task).
   Pi-huly hardcode sai package → query sai domain.

3. **Class đổi tên/quản lý khác** (`tags:class:Tag` → `tags:class:TagElement`). Huly
   rename hoặc thiết kế entity tên `TagElement` (TagElement = tag entity, TagReference =
   ref trong doc). Pi-huly đoán `Tag` (ngắn) → sai.

4. **Base class ở core** (`core:class:Space`). Space là base abstract class, không
   thuộc package document. Pi-huly đoán `document:class:Space` → sai domain.

5. **Document thực ra trong tracker** (`tracker:class:Document`). Document entity
   (markdown doc) defined trong tracker source, KHÔNG có package `document` active.
   Pi-huly đoán `document:class:Document` → sai.

6. **Label/TsRelation cần investigate thêm** — không có trong class/mixin block
   của view/core audited. Có thể:
   - Label thuộc package khác chưa audit (search packages chưa kiểm tra).
   - Huly dùng `TagElement` thay Label (deprecated Label).
   - TsRelation: Huly dùng `RelatedDocument` field trong Issue (array) thay class
     riêng — issue relations stored inline, không query class riêng.

## 2. Description storage model (T-41 input)

**STRONG evidence** — từ tracker TypeScript source (Issue interface):

```typescript
export interface Issue extends Task {
  title: string
  description: MarkupBlobRef | null    // ← document REF, KHÔNG phải inline markup
  // ...
}
```

Issue `description` là `MarkupBlobRef | null`:
- **KHÔNG phải** inline markup JSON string (pi-huly đang parse sai)
- **Là** reference tới một Document/blob object riêng (MarkupBlobRef)
- Có thể `null` (issue không có description)

`MarkupBlobRef` là branded type → runtime value là string ref `<issue-_id>-description-<epoch>`.
Pi-huly fallback hiện trả nguyên ref string → LLM thấy id vô nghĩa (#23).

### Fix path cho T-41

api-client có methods xử lý markup:
- `fetchMarkup(objectClass, objectId, objectAttr, markup, format)` — fetch markup content
  từ blob, return markdown/text theo format.
- `processMarkup(_class, id, data)` — process markup fields.
- `uploadMarkup(...)` — upload markup content.

→ `get_issue` sau khi fetch issue, **gọi `client.fetchMarkup(ISSUE_CLASS, issue._id, "description", issue.description, "markdown")`**
để lấy markdown content. Nếu fail (ref không tồn tại / markup rỗng) → return
`description: null` + field `descriptionRef: <ref>` (fallback rõ ràng cho LLM).

## 3. Search operator (T-42 input)

**STRONG evidence** — `core/lib/predicate.js`:

```javascript
$like: (query, propertyKey) => {
  const searchString = query.split("%").map(escapeLikeForRegexp).join(".*");
  const regex = RegExp(`^${searchString}$`, "i");  // case-insensitive
  return (docs) => execPredicate(docs, propertyKey, (value) => regex.test(value));
}
```

`$like` là **client-side predicate** (regex matching):
- `%` wildcard → `.*` regex
- Case-insensitive
- Anchored (`^...$`) — **phải match full value**, không substring!

→ Pi-huly syntax `{ title: { $like: "%search%" } }` **đúng** cho substring match
(dạng `^.*search.*$`). Nhưng nếu exact value (vd title = "Critical Runtime Wiring"):
- `{ title: { $like: "%Critical%" } }` → match `^.*Critical.*$` → ✓
- `{ title: { $like: "Critical" } }` → match `^Critical$` → ✗ (cần % wildcard)

Pi-huly `escapeLikePattern` (escape `%`, `_`, `\`) đúng. Vấn đề có thể:
1. **Server-side** có thể KHÔNG support `$like` (client predicate). Nếu findAll
   forward query lên server → server reject `$like`. Cần verify runtime.
2. **Search chỉ title** — bỏ description/document/message. Description là
   MarkupBlobRef → KHÔNG search được qua `Issue.description` (ref string, không
   content). Cần search qua Document class riêng.

### Fix path cho T-42

- **$like trên title**: syntax đúng, nhưng cần verify server support (test runtime).
  Nếu fail → fallback client-side load all + filter regex (chậm, risk OOM).
- **Search description/document/message**: KHÔNG thể qua Issue.description (ref).
  Cần search Document riêng (`findAll(tracker:class:Document, { content: {$like} })`).
  Nhưng content cũng có thể là MarkupBlobRef → cần fetchMarkup trước.
- **Honest fallback**: nếu server không expose fulltext, đổi tool description thành
  "Title substring search only" để LLM không overclaim.

## 4. Label ref shape (T-45 input)

**STRONG evidence** — tracker TypeScript source (IssueDraft interface):

```typescript
export interface IssueDraft {
  // ...
  labels: TagReference[]    // ← array of TagReference objects, KHÔNG string _id
}

// tags package:
export interface TagReference {
  // (cần audit tags package source map chi tiết hơn — TagReference shape)
  // pattern: { _id: Ref<TagElement>, ... }
}
```

Issue `labels` field là `TagReference[]`:
- **KHÔNG phải** array of `string _id` (pi-huly push raw string)
- **Là** array of `TagReference` object

### Fix path cho T-45

`add_issue_label` hiện push `idRef(params.label)` (raw string) → sai shape.
Fix:
1. Lookup TagElement by title/id: `findOne(TAG_ELEMENT_CLASS, { title: params.label })`
2. Push object đúng shape: `{ _id: tagElement._id }` (cần audit TagReference shape
   chính xác trong tags package — T-45 implementation verify).
3. Validate tồn tại trước push — return isError nếu không tìm thấy.

Note: Issue.labels (`TagReference[]`) cho IssueDraft; runtime Issue có thể store
`labels?: number` (count). Cần verify runtime shape thật khi implement T-45.

## 5. Todo storage + addCollection (T-46 input)

**STRONG evidence** — time TypeScript source (ToDo interface):

```typescript
export interface ToDo extends AttachedDoc {
  attachedTo: Ref<Doc>
  attachedToClass: Ref<Class<Doc>>
  workslots: number
  title: string
  description: Markup
  dueDate?: Timestamp | null
  priority: ToDoPriority        // ← number enum, KHÔNG string
  visibility: Visibility        // ← required
  doneOn: Timestamp | null
  user: Ref<Employee>           // ← required
  attachedSpace?: Ref<Space>
  labels?: number
  rank: Rank                    // ← required
}

// Issue có:
export interface Issue extends Task {
  // ...
  todos?: CollectionSize<ToDo>   // ← collection
}
```

### addCollection signature (api-client)

```javascript
async addCollection(_class, space, attachedTo, attachedToClass, collection, attributes, id)
```

Pi-huly hiện gọi:

```typescript
addCollection("task:class:Todo", space, issueId, ISSUE_CLASS, "todos", {title, description, dueDate})
```

**4 lỗi**:
1. `_class` = `task:class:Todo` → **phải là `time:class:ToDo`** (package time, chữ ToDo).
2. Thiếu `attachedToClass` field trong attributes (đúng param `ISSUE_CLASS` nhưng
   attribute `attachedToClass` cũng phải set trong doc).
3. Thiếu required fields: `user`, `visibility`, `rank`, `priority`, `workslots`.
4. `priority` là number enum (`ToDoPriority` 0-4), KHÔNG string.

### Fix path cho T-46

```typescript
const id = await tctx.client.addCollection(
  TODO_CLASS,        // "time:class:ToDo"
  issue.space,
  issue._id,
  ISSUE_CLASS,
  "todos",
  {
    title: params.title,
    description: JSON.stringify(mdToMarkup(params.description ?? "")),
    attachedTo: issue._id,
    attachedToClass: ISSUE_CLASS,
    attachedSpace: issue.space,
    user: tctx.currentUser.id,        // Ref<Employee>
    priority: 1,                       // ToDoPriority.Medium = 1
    visibility: "Public",              // hoặc default Visibility enum
    rank: "",                          // hoặc generate Rank
    workslots: 0,
    dueDate: params.dueDate ?? null,
  },
);
```

Cần audit thêm `Visibility` enum + `Rank` format từ `@hcengineering/calendar` +
`@hcengineering/rank` (chưa audited, T-46 implementation verify).

## 6. Action summary cho downstream tasks

| Task | Fix chính | Source từ audit |
|---|---|---|
| **T-43** (class refs) | Update `_class-refs.ts`: Employee→mixin, TaskType/ProjectType→task pkg, Document→tracker pkg, Space→core, Tag→TagElement, TimeSpendReport→tracker, Todo→time:ToDo | §1 truth table |
| **T-41** (get_issue desc) | `client.fetchMarkup(ISSUE_CLASS, _id, "description", ref, "markdown")` thay parseMarkupSafe | §2 description storage |
| **T-42** (search) | Verify $like server support; expand search Document riêng; honest fallback | §3 search operator |
| **T-45** (label) | Lookup TagElement by title + push TagReference object shape | §4 label ref |
| **T-46** (create_todo) | Class `time:class:ToDo`, fill required fields (user/visibility/rank/priority/workslots) | §5 Todo storage |

## 7. Unverified items (cần runtime server hoặc audit sâu hơn)

> **T-58 UPDATE (2026-07-28)**: DEEP-AUDIT 12 packages @0.7.423 — scan plugin()
> class block registration (KHÔNG chỉ interface existence). Resolve 4/5
> previously UNVERIFIED items. Chỉ 1 còn lại (Document class — interface orphan).

### RESOLVED by T-58 (STRONG evidence — plugin class block scan)

| Item | Verdict | Evidence | Action |
|---|---|---|---|
| **Label** (`view:class:Label`) | **DEPRECATED** — 0 match toàn 12 packages (interface + class) | plugin() class block scan: core/tracker/task/contact/chunter/tags/attachment/drive/view/platform/calendar/templates — 0 match | T-58: labels tools honest-unavailable (redirect tag tools) |
| **TsRelation** (`core:class:TsRelation`) | **KHÔNG TỒN TẠI** — 0 match. Issue relations **INLINE** (`Issue.relations?: RelatedDocument[]` + `Issue.blockedBy?: RelatedDocument[]`) | tracker/src/index.ts:195-196 + core/classes.ts:777 `RelatedDocument = Pick<Doc, '_id' \| '_class'>` | T-59: refactor $push/$pull inline, xóa TS_RELATION_CLASS dead code |
| **DocumentSnapshot** (`document:class:DocumentSnapshot`) | **DEPRECATED** — 0 match toàn 12 packages | plugin() class block scan: 0 match | T-58: snapshots tools honest-unavailable |
| **Space/Teamspace** (`core:class:Space`) | **base abstract** — KHÔNG có SpaceTypeDescriptor. Documents Teamspace thật = `drive:class:Drive` (extends TypedSpace, registered drive plugin:31) | core SpaceTypeDescriptor.baseClass + drive plugin class block | T-54: create_teamspace honest-unavailable (SpaceType ref inaccessible) |

### STILL UNVERIFIED (1 item — interface orphan)

- **Document class** (`tracker:class:Document`) — interface exists trong tracker
  source (src/index.ts:338 `interface Document extends Doc`) NHƯNG **KHÔNG register**
  trong tracker plugin() class block (chỉ Project/Issue/IssueTemplate/Component/
  IssueStatus/Milestone/TimeSpendReport). → runtime fail "domain not found"
  (interface orphan). T-60: Document search honest remove domain. Class thật
  (nếu có) cần runtime verify hoặc audit packages chưa check (candidates:
  `chunter:class:Doc` — hypothesis, chưa verify).

### Key methodology insight (T-58)

Audit T-44 trước chỉ check **interface existence** trong source map — KHÔNG đủ.
`tracker:class:Document` interface exists NHƯNG runtime KHÔNG register → fail.
T-58 audit check **plugin() class block** (registration truth) — đây mới là
runtime contract. Huly packages publish interface + plugin IDs; runtime lookup
dựa vào class registration trong plugin() block.

### Remaining items (deferred — không block user)

- **Visibility enum** (time package) — cần audit `@hcengineering/calendar`.
- **Rank format** — cần audit `@hcengineering/rank`.
- **TagReference shape chính xác** — cần audit tags source map chi tiết.
- **Server-side $like support** — cần runtime test (self-host).

## 8. Version compatibility note

Audited version: `@hcengineering/*@0.7.423` (2026-05-10 publish).
Pi-huly deps: `@hcengineering/*@0.7.423` (match). Class refs audit đúng cho
version này. Huly có thể rename class giữa versions — re-audit nếu upgrade.

---

_Generated bởi T-44 audit (slash goal complete-milestone M6, 2026-07-27)._
_Method: npm tarball source map extraction — KHÔNG runtime server._
_Audit packages: contact, tracker, task, tags, view, chunter, attachment, activity, time, core._
