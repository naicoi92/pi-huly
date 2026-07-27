# T-51: fix(create_*): silent space fallback tạo document mồ côi

> Implement plan. Reference từ issue #41.

## Issue reference

- Issue: #41 (silent space fallback `project?.space ?? tctx.workspace` → orphan document khi project null)
- Spec: [`docs/tasks/T-51.md`](../tasks/T-51.md)
- Blocked by: (none)
- Audit: reality-checker 4/4 call sites confirmed bug, pattern fix rõ (copy từ issues-core.ts:178-184).

## Approach

Apply pattern chuẩn (lookup project → null check → dùng project.space KHÔNG fallback) cho 4 call sites. Tạo test files mới cho 3 domain modules chưa có test (components, milestones, issues-templates) — test mỗi tool: project null → isError, project exists → dùng project.space.

## Task-type dispatch

- Skill: `superpowers:test-driven-development` (alias `tdd`) — **light TDD style**: fix-then-test được dung thứ cho bug có pattern sẵn (issues-core.ts:178-184 copy được). Test regression được thêm sau fix, KHÔNG strict red-green-first vì pattern đã verified.
- Subagent impl: no (M-size, pattern lặp nhưng đơn giản)

> Note: spec `docs/tasks/T-51.md` line refs cũ (`:84` cho `create_issue_from_template` nhưng thực tế là `create_template`). Dùng file:line trong section "Code hiện tại" của plan này (đã verify).

## Steps

### Step 1: Fix 4 call sites (same pattern)

- Files: `src/tools/domains/components.ts:82`, `src/tools/domains/milestones.ts:93`, `src/tools/domains/issues-templates.ts:84` (create_template), `src/tools/domains/issues-templates.ts:121` (create_issue_from_template)
- Approach: Replace `(project?.space ?? tctx.workspace) as never` với null check + `project.space as never`:
  ```ts
  if (!project) {
    return {
      content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
      isError: true,
      details: { project: tctx.project },
    };
  }
  // ...
  createDoc(CLASS, project.space as never, { ... })  // assert project.space (KHÔNG phải ?? fallback)
  ```
- Verify: typecheck pass + grep confirm KHÔNG còn `(project?.space ?? tctx.workspace)` nào
- Effort: S (pattern copy)

### Step 2: Test — components.test.ts (new)

- Files: `src/tools/domains/__tests__/components.test.ts` (new)
- Test cases:
  - create_component: project null → isError, createDoc KHÔNG gọi, content match `/not found/i` + `/huly init/i`
  - create_component: project exists → createDoc dùng project.space (KHÔNG fallback workspace)
- Verify: test pass
- Effort: S

### Step 3: Test — milestones.test.ts (new)

- Files: `src/tools/domains/__tests__/milestones.test.ts` (new)
- Test cases: same pattern (create_milestone null + exists)
- Verify: test pass
- Effort: S

### Step 4: Test — issues-templates.test.ts (new) — 2 lookup paths

- Files: `src/tools/domains/__tests__/issues-templates.test.ts` (new)
- **create_issue_from_template có 2 findOne (template + project) — 2 error paths khác nhau**:
  1. `create_template` project-null → isError + createDoc KHÔNG gọi
  2. `create_template` project-exists → createDoc dùng project.space
  3. `create_issue_from_template` template-not-found → isError hiện có (regression — KHÔNG regress existing behavior)
  4. `create_issue_from_template` project-null (template tồn tại) → isError MỚI + createDoc KHÔNG gọi
  5. `create_issue_from_template` happy path (cả 2 tồn tại) → createDoc dùng project.space
- Verify: test pass (5 tests cho issues-templates)
- Effort: M (2 tools + template lookup)

## Verify checklist (tổng)

- [ ] fmt pass
- [ ] lint pass
- [ ] typecheck pass
- [ ] test pass (+9 tests across 3 new files: 2+2+5)
- [ ] grep confirm KHÔNG còn `(project?.space ?? tctx.workspace)` nào
- [ ] spec coverage: 4/4 call sites fixed + regression test mỗi tool
- [ ] content text match `/not found/i` + `/huly init/i` (consistent message)

## Risk / side-effect

- **Risk**: Tool behavior đổi — trước fallback silent, giờ error nếu project null. LLM caller cần handle isError. **Mitigation**: chỉ 4 tool affect, đều `needsProject: true` — LLM đã được require project; fail-fast intentional, KHÔNG regression. Message rõ "Run /huly init or check binding" (actionable).
- **Risk**: Test files mới có thể conflict naming với test hiện có. **Mitigation**: check `__tests__/` directory trước
  (done — chỉ 5 files hiện có, không conflict).

## Out of scope

- KHÔNG fix các tool create khác (create_project dùng spaceRef trực tiếp — KHÔNG pattern fallback).
- KHÔNG refactor helper (spec mention optional `assertProjectExists` — defer nếu duplication quá nhiều, 4 call sites
  chưa đủ justify).

## Review trail

- reality-checker audit: 4/4 call sites confirmed bug. Pattern fix từ issues-core.ts:178-184.
- code-review-mentor plan review: (pending)
