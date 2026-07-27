# T-49: fix(fulltext_search): Document class sai runtime + defensive per-domain catch

> Implement plan. Tạo ở todo state, reference từ issue #38.

## Issue reference

- Issue: #38 (`huly_fulltext_search` fail với `domain not found: tracker:class:Document`)
- Spec: [`docs/tasks/T-49.md`](../tasks/T-49.md)
- Design docs: [`docs/design/11-runtime-audit.md`](../design/11-runtime-audit.md) §7 Known limitations
- Blocked by: (none — defensive fix không cần runtime verify root cause)
- Audit: reality-checker 5/5 claim confirmed, 1 unclear (runtime Document class deferred)

## Approach

Defensive fix: `Promise.all` → `Promise.allSettled` để 1 domain fail không kéo cả search fail. Per-domain filter fulfilled, log warning rejected. Honest tool description + content. KHÔNG fix root cause Document class (deferred T-53 runtime verify) — defensive fix đủ cho T-49 acceptance.

TDD: viết test single-domain-fail trước (red), implement Promise.allSettled (green), refactor.

## Task-type dispatch

- Skill: `test-driven-development` (logic mới — defensive error handling)
- Subagent impl: no (S-size, 1 file logic + 1 test file)

## Steps

### Step 1: TDD test single-domain-fail (red)

- Files: `src/tools/domains/__tests__/search.test.ts`
- Approach: Add 2 test cases cover acceptance: (a) 1 domain reject → other domains vẫn return + warning; (b) tất cả domain reject → honest error (KHÔNG fake 0 results).
- Test cases (mock explicit — copy-ready):
  - **(a) Single-domain fail**: `findAll` mock thứ tự theo thứ tự gọi (Issue, Document, ChatMessage):
    - `mockResolvedValueOnce([{_id:"i1", identifier:"PD-1", title:"Critical bug"}])` — Issue OK
    - `mockRejectedValueOnce(new Error("domain not found: tracker:class:Document"))` — Document fail
    - `mockResolvedValueOnce([{_id:"m1", content:"bug msg"}])` — ChatMessage OK
    - Assert: `isError=false`, `details.results.length=2` (issue+message), content match `/document.*fail/i`
  - **(b) All-domain fail**: `findAll.mockRejectedValue(new Error("connection refused"))` (default cho tất cả).
    - Assert: `isError=true`, content match `/all.*domain.*fail/i` hoặc `/search failed/i`
- Verify: `pnpm test:run search.test.ts` fail (logic chưa có Promise.allSettled)
- Effort: S

### Step 2: Implement Promise.allSettled (green)

- Files: `src/tools/domains/search.ts`
- Approach:
  - Replace `Promise.all([searchDomain, searchDomain, searchDomain])` → `Promise.allSettled([...])`
  - Filter fulfilled: `fulfilled = settled.filter(s => s.status === "fulfilled").flatMap(s => s.value)` (KHÔNG cần helper phức tạp — searchDomain đã tag type sẵn).
  - Collect rejected: `rejected = settled.map((s, i) => s.status === "rejected" ? {domain: DOMAIN_NAMES[i], reason: (s.reason instanceof Error ? s.reason.message : String(s.reason))} : null).filter(Boolean)`.
  - **Critical branch**: `if (fulfilled.length === 0)` → return isError=true "All search domains failed: <reasons>" (KHÔNG fake 0 results). Test (b) verify.
  - **Outer try/catch role đổi**: giờ là safety net cho **unexpected programming errors** (vd `.map` throw trên doc shape bất thường, sync bug) — KHÔNG phải domain/network error nữa (Promise.allSettled không throw). Update comment line 96 cho đúng new role, tránh misleading.
  - Return content honest: "Found N results. Document search failed: <msg>." (warning append chỉ khi có rejected domains, KHÔNG khi all OK).
- Verify: `pnpm test:run search.test.ts` pass
- Effort: S

### Step 3: Honest tool description + refactor

- Files: `src/tools/domains/search.ts`
- Approach: Update description: "Substring search across issue titles, document titles (if available), message content. Some domains may be unavailable — results show which succeeded."
- **Invariant**: Description mới phải GIỮ ít nhất 1 trong các từ `substring`/`title`/`content` để test hiện có (line 139-143) pass. Optional: thêm test mới assert description mention "(if available)" partial-capability phrasing.
- Verify: test description check pass (cả cũ + mới nếu add)
- Effort: S

## Verify checklist (tổng)

- [ ] fmt pass
- [ ] lint pass
- [ ] typecheck pass
- [ ] test pass (+2 tests)
- [ ] spec coverage: **4/5 in-scope + 1 deferred**:
  - [x] `fulltext_search` không còn fail `domain not found` (defensive Promise.allSettled — in-scope)
  - [x] 1 domain fail không kéo cả search fail (Promise.allSettled — in-scope)
  - [ ] Document class đúng update `_class-refs.ts` + audit truth table — **deferred T-53** (cần runtime verify self-host)
  - [x] Test: search issue title vẫn work ngay cả khi Document domain lỗi (test (a) — in-scope)
  - [x] Tool description reflects actual capability (in-scope)

## Risk / side-effect

- **Risk**: Promise.allSettled có thể hide lỗi thật (vd Document class sai runtime) vì vẫn return partial result → user không biết Document search fail. **Mitigation**: warning log rõ trong content text "Document search failed: <msg>".
- **Risk**: Content text phình khi nhiều domain fail + error message dài. **Mitigation**: chỉ log 1 dòng per failed domain, truncate message.
- **Risk**: `Promise.allSettled` KHÔNG add per-domain timeout — 1 domain slow (vd Document query stuck 30s) vẫn kéo cả search chờ 30s dù allSettled không reject. Defensive ≠ responsive. **Mitigation**: defer timeout wrapping sang task khác nếu cần (out of scope T-49).
- **Side-effect**: Search behavior đổi — trước fail hoàn toàn, giờ partial result. LLM cần đọc warning để biết domain nào failed. OK vì có warning text.

## Out of scope

- KHÔNG fix Document class root cause (deferred T-53 runtime verify — cần self-host).
- KHÔNG add new search domain (vd Person name, Tag).
- KHÔNG đổi `$like` query pattern (T-42 đã fix escape + honest error).

## Review trail

- reality-checker audit: 5/5 claim confirmed, 1 unclear deferred. Approve approach.
- code-review-mentor plan review round 1: NEEDS_FIXES (3 🟡 issues). Fixed: all-rejected branch explicit, outer-catch role re-defined, checklist 4/5 + 1 deferred.
