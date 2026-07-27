# T-52: fix(*): validate foreign-key ref tồn tại trước write (7 tool)

> Implement plan. Reference từ issue #42. Task L-size critical.

## Issue reference

- Issue: #42 (tool nhận entity ref rồi cast `idRef` KHÔNG validate → ref rác, TxUpdateDoc skip)
- Spec: [`docs/tasks/T-52.md`](../tasks/T-52.md)
- Audit: reality-checker 5/5 claim confirmed. 6/7 tool có lỗổng validate, 1 tool (link_document) đã OK.
- User chốt: Option A (KHÔNG truyền parentIssue = top-level) + fix attach_tag shape luôn.

## Approach

Apply pattern `findOne(TARGET_CLASS) → if null → isError → KHÔNG write` cho 6 tool còn thiếu. Giữ inline per tool (KHÔNG extract helper — spec optional, risk thấp hơn khi fix đồng loạt). Bonus fix `attach_tag` idempotent shape (raw string vs ref array) giống T-45.

## User chốt THIẾT KẾ conflict

- **`move_issue` parentIssue semantic = Option A**: Giữ schema `Type.Optional(Type.String())`. Convention: KHÔNG truyền field = top-level promotion. Code check `=== undefined`. Update tool description bỏ mention "null" để tránh nhầm (description hiện tại nói "null = top-level" sai).
- **`attach_tag` shape fix included**: idempotent check `existing.includes(params.tag)` so sánh raw string → luôn false → re-push duplicate. Fix cùng FK validate: findOne(TAG_CLASS) resolve → dùng ref resolved cho cả idempotent + $push.

## Task-type dispatch

- Skill: `superpowers:test-driven-development` (alias `tdd`) — light TDD (fix-then-test cho pattern có sẵn).
- Subagent impl: no (L-size nhưng pattern lặp, 7 tool similar).

## Steps

### Step 1: Fix 6 tool FK validate (per-tool approach)

- Files: `issues-relations.ts`, `components.ts`, `milestones.ts`, `issues-core.ts`, `tags.ts`

| Tool | FK ref | Class | Approach |
|---|---|---|---|
| `add_issue_relation` | `targetIssue` (identifier!) | ISSUE_CLASS | **ĐẶC BIỆT**: KHÔNG route qua resolveIdentifier (cross-project OK — design §3 line 145 DAG native cross-project, resolveIdentifier throw). Query trực tiếp: `findOne(ISSUE_CLASS, { identifier: params.targetIssue })` → if null isError → addCollection với `target._id as never` (KHÔNG `idRef(params.targetIssue)` raw). Hiện code double bug: no validate + identifier cast thành _id. |
| `set_issue_component` | `component` (_id) | COMPONENT_CLASS | findOne({_id: params.component}) → if null isError |
| `set_issue_milestone` | `milestone` (_id) | MILESTONE_CLASS | findOne({_id: params.milestone}) → if null isError |
| `move_issue` | `parentIssue` (skip khi undefined) | ISSUE_CLASS | if parentIssue !== undefined → findOne(identifier resolve) → if null isError |
| `link_document_to_issue` | `document` (_id) | DOCUMENT_CLASS | ĐÃ CÓ check. **IMPROVE**: tách message — check issue first (return "Issue X not found"), then doc (return "Document Y not found"). Khi cả 2 null, issue error wins. |
| `attach_tag` | `tag` (_id) + **shape fix** | TAG_CLASS | findOne({_id}) → if null isError. **Bonus shape**: TagReference cho tags dùng `color: string` (KHÔNG number như labels T-45 — verify schema Tag.color). Idempotent check dùng ref resolved (KHÔNG raw string), $push TagReference object `{tag, title, color}`. |
| `unlink_document_to_issue` | `document` (_id) | DOCUMENT_CLASS | **Spec §Phương án 3 nói optional skip (idempotent $pull)**. Defer validate — $pull safe no-op. KHÔNG thêm round-trip findOne. |

- Verify: typecheck pass + grep confirm không còn `idRef(params.xxx)` raw cho FK field
- Effort: M (7 tool, pattern lặp)

### Step 2: Update move_issue descriptions (THIẾT KẾ conflict fix — CẢ 2)

- Files: `src/tools/domains/issues-core.ts` (move_issue description line 314 + param description line 321)
- Trước (description): `"Move issue to new parent (epic). parentIssue=null → promote top-level."`
- Sau (description): `"Move issue to new parent (epic). KHÔNG truyền parentIssue → promote top-level."`
- Trước (param): `"New parent issue identifier. null = top-level."`
- Sau (param): `"New parent issue identifier. KHÔNG truyền = top-level promotion."`
- Verify: grep `parentIssue` description, KHÔNG mention "null = top-level"
- Effort: S

### Step 3: TDD test — issues-relations.test.ts (new)

- Files: `src/tools/domains/__tests__/issues-relations.test.ts` (new)
- Test cases (4 tools × 2-3 cases mỗi tool):
  - `add_issue_relation`: targetIssue not found → isError; exists → addCollection với _id resolved
  - `link_document_to_issue`: document not found → isError message riêng (KHÔNG gộp); issue not found → isError message riêng
  - `unlink_document_to_issue`: document not found → isError
- Verify: test pass
- Effort: M

### Step 4: TDD test — components.test.ts + milestones.test.ts (extend T-51 files)

- Files: extend `components.test.ts`, `milestones.test.ts` (created ở T-51 PR #48, đã merged hoặc pending)
- **Note**: nếu T-51 chưa merged, tạo new files (mirror boilerplate từ issues-core.test.ts). Plan T-51 đã tạo 2 files này.
- Test cases:
  - `set_issue_component`: component not found → isError; exists → updateDoc với _id resolved
  - `set_issue_milestone`: milestone not found → isError; exists → updateDoc với _id resolved
- Verify: test pass
- Effort: S

### Step 5: TDD test — issues-core.test.ts (extend for move_issue)

- Files: extend `issues-core.test.ts`
- Test cases:
  - `move_issue`: parentIssue not found → isError; exists → updateDoc; undefined → top-level (KHÔNG validate)
- Verify: test pass
- Effort: S

### Step 6: TDD test — tags.test.ts (new, include shape fix)

- Files: `src/tools/domains/__tests__/tags.test.ts` (new)
- Test cases:
  - `attach_tag`: tag not found → isError; exists → $push ref resolved (KHÔNG raw); idempotent dùng ref resolved (KHÔNG raw string)
- Verify: test pass
- Effort: S

## Verify checklist (tổng)

- [ ] fmt pass
- [ ] lint pass
- [ ] typecheck pass
- [ ] test pass (+~11 tests across 2 new + 3 extend)
- [ ] spec coverage: 6/7 tool fix (link_document đã OK chỉ improve message; unlink_document skip per spec §Phương án 3 idempotent) + attach_tag shape bonus
- [ ] grep: KHÔNG còn `idRef(params.targetIssue)`, `idRef(params.component)`, `idRef(params.milestone)`, `idRef(params.tag)` (parentIssue/document giữ idRef vì đã validated hoặc $pull idempotent)

## Risk / side-effect

- **Risk**: `add_issue_relation` semantic đổi — trước cast raw `idRef(targetIssue)` (identifier thành _id), giờ resolve identifier → _id thật. Behavior breaking cho caller cũ truyền raw _id. **Mitigation**: spec §Phương án 2 đã note resolve identifier. Caller LLM nên truyền identifier (PD-123), KHÔNG _id raw.
- **Risk**: `move_issue` description đổi có thể confuse caller cũ quen "null = top-level". **Mitigation**: message rõ "KHÔNG truyền parentIssue".
- **Risk**: Helper KHÔNG extract → 6 tool duplicate pattern ~5 dòng/tool. **Mitigation**: spec optional, defer extraction sang follow-up khi pattern exceed 10 sites.

## Out of scope

- KHÔNG extract helper `assertEntityExists` (spec optional, defer follow-up).
- KHÔNG fix `attach_tag` $push shape if server dedup (chỉ fix idempotent check + FK validate).
- KHÔNG change `add_issue_relation` schema (identifier input OK).

## Review trail

- reality-checker audit: 5/5 claim confirmed. 6/7 tool bug. Recommend extract helper (defer per plan).
- User chốt: Option A (move_issue) + attach_tag shape fix included.
- code-review-mentor plan review: (pending)
