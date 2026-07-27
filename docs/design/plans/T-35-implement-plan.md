# T-35 — Implement Plan: R7 subagent smoke test (rescoped)

> **Task**: [T-35] [S] medium priority — R7 subagent smoke test.
> **Milestone**: M4 Skills. **Blocked-by**: T-33 (✅ done). **Blocks**: T-36.
> **Risk**: R7 (subagent process model — UNVERIFIED).

## 1. Mục tiêu (rescoped)

Verify **precondition** cho D14 (module-level pool shares in-process callers) +
**flag honestly** R7 vẫn open (pi-subagent dispatch runtime chưa verifiable trong
CI). Spec gốc (08-non-functional §"Subagent Smoke R7") nói "dispatch pi-subagent"
nhưng audit T-35 xác nhận:

- `pi-subagents` KHÔNG trong peerDependencies.
- KHÔNG có package pi-subagents trong node_modules (chỉ pi-agent-core/ai/coding-agent/tui).
- `pi-agent-core@0.82.1` + `pi-coding-agent@0.82.1` KHÔNG export `dispatchSubagent`/
  `spawn`/`createSubagent` API.
- UC-04 line 66 hypothesis: "subagent tool = in-process AgentSession → likely
  same process, D14 probably holds" — R7 conditional language "[IF same-process verified]".

→ **Rescope T-35** (spec/API mismatch, self-resolvable — KHÔNG phải design conflict):
- **In-scope CI**: pool-sharing precondition unit test (verify module singleton
  shares across logical callers trong cùng process — precondition cho D14 nếu
  AgentSession in-process hypothesis đúng).
- **Out-of-scope CI (deferred)**: actual pi-subagent dispatch smoke — cần
  pi-subagents package confirmed available (add peerDep + install + verify export)
  HOẶC manual runtime smoke. Defer tới T-36 e2e HOẶC task mới.

## 2. Implementation

### Phase 1: Extend pool.test.ts với R7 precondition test

Thêm `describe("R7 subagent smoke (in-process precondition)")` block:

1. **Test "main + subagent same-process share pool"**: simulate 2 logical
   callers (main agent + subagent callback) trong cùng module scope — cả 2 gọi
   `getClient(sameWorkspace)`. Assert:
   - `__poolSizeForTests() === 1` (1 connection).
   - `createHulyClient` called exactly 1 lần (no reconnect).
   - Cả 2 caller nhận cùng client instance (===).
2. **Test "concurrent dispatch does NOT double-connect"**: 2 caller concurrent
   (Promise.all) — assert pool size 1 + 1 createHulyClient (race-safe đủ cho
   precondition; pool.ts hiện sequential-safe vi Map.get-then-set, KHÔNG có
   dedup pending — document limitation nếu fail).
3. **Comment header rõ**: explain R7 status (UNVERIFIED), hypothesis (AgentSession
   in-process), what this test verifies (precondition) vs NOT verify (actual
   runtime dispatch), defer real smoke to T-36.

### Phase 2: Update TASKS.md + risk register

4. TASKS.md T-35 done note: "precondition unit test added; R7 dispatch smoke
   deferred to T-36 (pi-subagents API unavailable in CI)".
5. (Optional, nếu design doc editable) Update 08-non-functional §R7 + UC-04:
   note R7 status = "precondition verified in-process; dispatch smoke deferred".

### Phase 3: Verify + commit + PR

6. `pnpm run test:run` pass (349 + 2-3 new tests).
7. `pnpm run fmt:check && lint && typecheck && build && lint:md` pass.
8. Commit + push + PR + chờ CI + merge.

## 3. Verification checklist (DoD T-35 rescoped)

- [ ] pool.test.ts có R7 precondition test (1-3 test cases)
- [ ] Test verify: same-process callers share pool (size 1, 1 createHulyClient)
- [ ] Comment header rõ R7 status (UNVERIFIED dispatch, precondition only)
- [ ] test:run pass (351-352 tests total)
- [ ] CI green
- [ ] PR merged
- [ ] TASKS.md T-35 done + R7 deferred note

## 4. Risk / Out of scope

- **R7 dispatch runtime**: KHÔNG verify được trong CI (pi-subagents unavailable).
  Flag honestly. Defer tới T-36 HOẶC task mới sau pi-subagents confirmed.
- **Race condition**: pool.ts hiện sequential-safe (Map.get→set KHÔNG atomic).
  Nếu concurrent test fail → document limitation, KHÔNG fix pool.ts (out of
  scope T-35, size S). Test concurrent chỉ verify "happy path precondition".
- **KHÔNG** add pi-subagents peerDep (unverified package, scope creep).
- **KHÔNG** change pool.ts implementation (T-35 test-only).
