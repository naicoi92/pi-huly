# T-03: config/config.ts + config/resolver.ts

> Implement plan. T-03 = task-type logic mới → TDD red-green-refactor.

## Issue reference
- Issue: T-03 (local-tasks, TASKS.md dòng 17)
- Spec: config/config.ts + resolver.ts (transport ws|rest, projects cwd-map longest-prefix, same-name diff-URL disambiguate) + unit
- Design docs:
  - [04 - System](../04-system.md) §6 `config/config.ts — ConfigStore` (dòng 162-171) + `config/resolver.ts` (dòng 173-178)
  - [01 - Vision](../01-vision.md) §B.3 D3 (transport toggle dòng 161-181) + §B.8 D8 (config.json format dòng 285-345)
  - [09 - Roadmap](../09-roadmap.md) topology order 3
- Blocked by: T-01 (✅ done 6ae59e7)
- Blocks: T-04 (errors), T-31 (/huly command)
- Priority: high | Size: M | Milestone: M0

## Doc gap fix (reality-checker audit)
- `docs/design/04-system.md` §6 dòng 171 `type Config` thiếu field `transport`. Fix: add `transport?: 'ws' | 'rest'` (optional, default 'ws' theo D3).

## Approach

T-03 = task-type **logic mới** (ConfigStore CRUD + WorkspaceResolver/ProjectResolver chain) → **TDD red-green-refactor**.

Strategy: 2 modules độc lập nhưng liên quan (resolver phụ thuộc config):
1. **config.ts** — ConfigStore: load/save/bindProject/unbindProject/resolveByCwd (longest-prefix)
2. **resolver.ts** — WorkspaceResolver + ProjectResolver: chain resolution (explicit > cwd-map > interactive)

Key design decisions:
1. **Longest-prefix match** cho resolveByCwd: cwd `/a/b/c` match binding `/a/b` (KHÔNG phải `/a`). Sort bindings by path depth desc, return first prefix match.
2. **Path normalization**: cwd + binding paths normalize trước compare (resolve `.`, `..`, strip trailing `/` except root). Cross-platform: use `path.resolve()` + `node:os` homedir (`~` expand).
3. **transport default 'ws'**: loadConfig trả `transport: 'ws'` nếu file thiếu field (D3 default).
4. **resolveWorkspace chain**:
   - explicit param → validate exists trong credentials (findByName or getWorkspace), multi-result → throw NeedsDisambiguationError (caller prompt)
   - cwd-map → resolveByCwd(cwd)?.workspace → validate
   - KHÔNG có → throw NeedsInitError (caller run /huly init)
5. **resolveProject chain**:
   - explicit param → return
   - cwd-map → resolveByCwd(cwd)?.project → return
   - KHÔNG có → return undefined (caller prompt list_projects)
6. **Resolver KHÔNG gọi credentials.findByName trực tiếp** — inject `loadCredentials` + `loadConfig` qua ctx param (testability + tránh hard coupling). ctx type: `{ cwd: string, loadCredentials, loadConfig }`.

## Task-type dispatch
- Skill: `superpowers:test-driven-development` (red-green-refactor)
- Subagent impl: no (task M homogeneous, main agent TDD đủ)

## Steps

### Step 1: Doc gap fix + types
- Files:
  - `docs/design/04-system.md` §6 dòng 171 — add `transport?: 'ws' | 'rest'` to Config type
  - `src/config/config.ts` — type defs only (red phase)
    - `type Transport = 'ws' | 'rest'`
    - `type ProjectBinding = { workspace: string, project: string }`
    - `type Config = { version: 1, transport?: Transport, projects: Record<string, ProjectBinding>, pool?: { maxSize?: number } }`
    - `CONFIG_PATH` constant: `~/.pi/agent/huly/config.json`
    - `DEFAULT_CONFIG`: `{ version: 1, transport: 'ws', projects: {} }`
- Verify: `tsc --noEmit` pass

### Step 2: loadConfig + saveConfig — TDD
- Files: `src/config/config.ts` (impl), `src/config/__tests__/config.test.ts` (tests)
- Test cases:
  1. File không tồn tại → return DEFAULT_CONFIG (transport='ws', projects={})
  2. File valid với transport='ws' → parse đúng
  3. File valid với transport='rest' → parse đúng
  4. File valid thiếu transport field → default 'ws'
  5. File valid với projects → parse all
  6. File valid với pool.maxSize → parse
  7. File malformed JSON → throw
  8. File schema invalid (version != 1) → throw
  9. File schema invalid (transport != 'ws'/'rest') → throw
- saveConfig: atomic write (KHÔNG chmod 600 — non-secret file, default perms OK)
- Verify: vitest green

### Step 3: bindProject + unbindProject — TDD
- Test cases:
  1. bindProject cwd → projects[cwd] set
  2. bindProject existing cwd → upsert (update)
  3. unbindProject existing cwd → remove
  4. unbindProject non-existing cwd → no-op
- Verify: vitest green

### Step 4: resolveByCwd — TDD (longest-prefix)
- Test cases:
  1. Exact match: cwd `/a/b` match binding `/a/b` → return binding
  2. Prefix match: cwd `/a/b/c` match binding `/a/b` → return binding (longest-prefix)
  3. Longest-prefix wins: cwd `/a/b/c` + bindings `/a` + `/a/b` → return `/a/b` binding
  4. No match: cwd `/x/y` no binding prefix → undefined
  5. Path normalization: cwd `/a/./b` match binding `/a/b` (normalize trước compare)
  6. Trailing slash: cwd `/a/b/` match binding `/a/b`
  7. Root binding `/`: cwd `/anything` match root → return binding
- Verify: vitest green

### Step 5: WorkspaceResolver — TDD
- Files: `src/config/resolver.ts` (impl), `src/config/__tests__/resolver.test.ts` (tests)
- Test cases:
  1. explicit param + unique name → return workspace id
  2. explicit param + same-name diff-URL (2 results) → throw NeedsDisambiguationError với list
  3. explicit param + non-existent → throw NeedsInitError
  4. KHÔNG explicit + cwd-map match → return workspace id from binding
  5. KHÔNG explicit + KHÔNG cwd-map → throw NeedsInitError
- Verify: vitest green

### Step 6: ProjectResolver — TDD
- Test cases:
  1. explicit param → return project
  2. KHÔNG explicit + cwd-map match → return project from binding
  3. KHÔNG explicit + KHÔNG cwd-map → return undefined (caller prompt)
- Verify: vitest green

### Step 7: Integration smoke + finalize
- Test cases:
  1. Full flow: bindProject(/a/b, {ws, proj}) → resolveWorkspace(undefined, {cwd:/a/b/sub}) → 'ws'
  2. Full flow: resolveProject(undefined, {cwd:/a/b/sub}) → 'proj'
  3. Cross-module: config.saveConfig → loadConfig → resolver.resolveByCwd
- Verify: full suite green, coverage ≥80%

## Verify checklist (tổng)
- [ ] `oxfmt --check` pass
- [ ] `oxlint .` pass
- [ ] `markdownlint-cli2` pass (04-system.md updated, no new issues)
- [ ] `tsc --noEmit` pass
- [ ] `vitest run` green — config + resolver tests pass
- [ ] coverage config.ts + resolver.ts ≥ 80%
- [ ] manual smoke: bind → resolve round-trip works
- [ ] longest-prefix match correctness
- [ ] path normalization (., .., trailing /, ~)
- [ ] transport default 'ws'
- [ ] resolveWorkspace chain: explicit > cwd-map > NeedsInitError
- [ ] resolveProject chain: explicit > cwd-map > undefined
- [ ] spec coverage: 04 §6 ConfigStore API + Resolver API đầy đủ

## Risk / side-effect
- **Path separator cross-platform**: Windows `\` vs Unix `/`. Mitigation: use `path.resolve()` (auto platform) + normalize trước compare. Test dùng POSIX paths (CI linux+macos).
- **Tilde expansion**: binding có thể dùng `~/projects` (shorthand homedir). Mitigation: expand `~` → homedir trước resolve. Test cover.
- **Concurrent access**: same as T-02 — single-writer assumption (pi-huly single process).
- **NeedsDisambiguationError / NeedsInitError**: custom error classes. Caller (/huly command T-31) catch + prompt user. KHÔNG throw generic Error.

## Out of scope
- KHÔNG implement /huly init interactive flow (T-31)
- KHÔNG implement pool.maxSize enforcement (T-06 pool)
- KHÔNG implement transport switch runtime (ws/rest connect — T-05 client)
- KHÔNG implement credentials validation trong resolver (chỉ lookup, validate là client job)
- KHÔNG implement list_projects prompt (T-31 /huly)
- KHÔNG chmod 600 config.json (non-secret, default perms OK — khác credentials.json)
