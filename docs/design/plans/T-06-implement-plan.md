# T-06: client/pool.ts — ConnectionPool

> Implement plan. T-06 = logic mới → TDD. Spec 04 §6 client/pool.ts.

## Issue reference
- Issue: T-06 (TASKS.md dòng 23): `[T-06] [M] client/pool.ts (transport-aware getClient, LRU evict ≤8 ws, auto-reconnect backoff, closeAll session_shutdown, health) + integration — high | blocked-by: T-05 | blocks: T-09 | risks: R2`
- Design: 04 §6 pool.ts (dòng 185-195), 01 §B.3 D3 transport, §B.14 D14 shared pool, 08 §A NFR-11 maxSize 8, NFR-03 reconnect
- Blocked by: T-05 (✅ done)
- Blocks: T-09 (builder)

## Approach

T-06 = **logic mới** → TDD red-green-refactor. Key design:
1. **Module singleton pool** (Map<workspace_id, HulyClient>) — shared subagent (D14)
2. **getClient(workspace)**: lookup → cache hit return; cache miss → resolve creds via credentials.getWorkspace + config transport → createHulyClient → store → return. WS pool LRU ≤8 (NFR-11), REST cached instance no LRU
3. **LRU evict**: khi pool ws đạt maxSize, evict oldest (close + delete). Track access time via Map insertion order
4. **auto-reconnect**: lazy — getClient check client healthy, nếu close/error → recreate. Backoff defer tới actual reconnect logic (simplified: recreate on next getClient call)
5. **closeAll**: iterate pool, close each, clear Map. session_shutdown hook (T-33 factory wires)
6. **health(workspace?)**: nếu workspace given → check specific; else aggregate. Return {connected, transport, user?}

## Steps

### Step 1: Types + module singleton
- `src/client/pool.ts`: types (PoolEntry, HealthStatus) + Map singleton + constants (MAX_WS_POOL=8)
### Step 2: getClient — TDD (mock createHulyClient + credentials/config)
- Test: cache hit/miss, LRU evict khi >8, ws vs rest behavior, getCurrentUser pre-fetch
### Step 3: closeAll — TDD
- Test: close all entries, clear pool, idempotent
### Step 4: health — TDD
- Test: single workspace health, all-pool health, unknown workspace
### Step 5: reconnect — TDD
- Test: getClient với closed client → recreate
### Step 6: Integration smoke

## Verify checklist
- [ ] fmt/lint/typecheck/test pass
- [ ] coverage ≥80%
- [ ] LRU evict ≤8 ws đúng
- [ ] closeAll cleanup đầy đủ
- [ ] health trả đúng shape
- [ ] spec coverage 04 §6 pool.ts API

## Out of scope
- KHÔNG implement builder (T-09)
- KHÔNG wire session_shutdown hook (T-33 factory)
- KHÔNG test real Huly reconnect (mock-only, real e2e T-36)
- KHÔNG implement backoff timing chính xác (simplified: recreate on next call)
