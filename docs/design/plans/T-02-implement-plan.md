# T-02: config/credentials.ts — CredentialStore

> Implement plan. Tạo ở todo state. T-02 = task-type logic mới → TDD red-green-refactor.

## Issue reference
- Issue: T-02 (local-tasks, TASKS.md dòng 16)
- Spec: config/credentials.ts (auth union token|email+password, workspace-required, id-handle, findByName) + unit
- Design docs:
  - [04 - System](../04-system.md) §6 `config/credentials.ts — CredentialStore` (public API signatures dòng 144-155)
  - [01 - Vision](../01-vision.md) §B.8 D8 (credentials.json format dòng 285-353)
  - [08 - Non-Functional](../08-non-functional.md) §A STRIDE/Data Sensitivity (token 🔴 secret, chmod 600, atomic write, schema validate)
  - [09 - Roadmap](../09-roadmap.md) topology order 2
- Blocked by: T-01 (✅ done — PR #1 merged 6ae59e7, verified unblocked)
- Blocks: T-04 (client/errors)
- Priority: high | Size: M | Milestone: M0

## Approach

T-02 = task-type **logic mới** (config/credentials.ts có auth union types + load/save/findByName logic) → **TDD red-green-refactor**.

Strategy: build từ type definitions → IO functions (load/save với atomic write + chmod 600) → mutation functions (addWorkspace/removeWorkspace) → lookup functions (getWorkspace/findByName). Mỗi function TDD: test red → impl green → refactor.

Key design decisions (từ audit reality-checker):
1. **XOR union enforcement runtime**: validate `{token}` XOR `{email,password}` — không cho cả 2, không cho thiếu (D8 + 08 §A schema validate)
2. **findByName returns Array**: multi-result cho same-name diff-URL disambiguate (04-system.md:153)
3. **id-handle default = workspace name**: khi user không cung cấp id (addWorkspace contract)
4. **chmod 600 verify on load**: reject nếu file loose perms (08 §A Spoofing mitigation)
5. **Atomic write**: temp file + rename (08 §A Tampering mitigation) — tránh corrupt khi crash giữa write

## Task-type dispatch
- Skill: `superpowers:test-driven-development` (red-green-refactor)
- Subagent impl: no (task M homogeneous, main agent TDD đủ)

## Steps

### Step 1: Types + path constants
- Files:
  - `src/config/credentials.ts` — type defs only (red phase)
    - `WorkspaceCreds = { url: string, workspace: string } & ({ token: string } | { email: string, password: string })`
    - `Credentials = { version: 1, workspaces: Record<string, WorkspaceCreds> }`
    - `CREDENTIALS_PATH` constant: `~/.pi/agent/huly/credentials.json` (cross-platform via `os.homedir()`)
    - `CREDENTIALS_DIR` = dirname
- Test cases: type-level only (compile-time check)
- Verify: `tsc --noEmit` pass

### Step 2: loadCredentials — TDD
- Files: `src/config/credentials.ts` (impl), `src/config/__tests__/credentials.test.ts` (tests)
- Test cases (red → green):
  1. File không tồn tại → trả `{ version: 1, workspaces: {} }` (default empty, KHÔNG throw)
  2. File valid với 1 workspace token → parse đúng
  3. File valid với 1 workspace email+password → parse đúng
  4. File valid với multiple workspaces → parse all
  5. File chmod loose (644) → throw "credentials.json permissions too open (expected 600)"
  6. File malformed JSON → throw "credentials.json malformed: <parse error>"
  7. File schema invalid (thiếu workspace field) → throw "credentials.json schema invalid: workspace required"
  8. File schema invalid (cả token + email/password) → throw "auth union XOR violated"
  9. File schema invalid (không token cũng không email/password) → throw "auth union XOR violated"
- Verify: `vitest run src/config/__tests__/credentials.test.ts` green

### Step 3: saveCredentials — TDD (atomic + chmod 600)
- Files: same
- Test cases:
  1. Save valid Credentials → file exists, JSON correct, chmod 600
  2. Save atomic — temp file + rename (verify no partial write on simulated crash — test via spy/mock)
  3. Save creates dir if not exist (`~/.pi/agent/huly/`)
  4. Save chmod 600 on existing file với loose perms → tightened to 600
- Verify: `vitest run` green; `ls -l <tmp>/credentials.json` shows `-rw-------`

### Step 4: addWorkspace — TDD (upsert + default id)
- Files: same
- Test cases:
  1. Add new workspace với explicit id → entry added
  2. Add new workspace KHÔNG explicit id → default id = workspace name
  3. Add workspace với id đã tồn tại → update (upsert)
  4. Add workspace thiếu `workspace` field → throw "workspace required"
  5. Add workspace cả token + email/password → throw "auth union XOR violated"
  6. Add workspace KHÔNG token cũng không email/password → throw "auth union XOR violated"
- Verify: `vitest run` green

### Step 5: removeWorkspace — TDD
- Files: same
- Test cases:
  1. Remove existing id → entry removed
  2. Remove non-existent id → no-op (KHÔNG throw)
  3. Remove last workspace → workspaces = {} (KHÔNG delete file)
- Verify: `vitest run` green

### Step 6: getWorkspace — TDD
- Files: same
- Test cases:
  1. Get existing id → return WorkspaceCreds
  2. Get non-existent id → return undefined
- Verify: `vitest run` green

### Step 7: findByName — TDD (Array, same-name diff-URL)
- Files: same
- Test cases:
  1. Find unique name → return Array length 1
  2. Find name với same-name diff-URL (2 workspaces cùng `workspace` name, khác url/id) → return Array length 2
  3. Find non-existent name → return Array length 0 (KHÔNG undefined)
- Verify: `vitest run` green

### Step 8: Integration smoke + export
- Files: `src/config/credentials.ts` (finalize exports), `src/config/__tests__/credentials.test.ts`
- Test cases:
  1. Full flow: load empty → addWorkspace(token) → addWorkspace(email/pass) → save → reload → verify both present
  2. Same-name diff-URL: add 2 workspaces cùng workspace name khác url → findByName returns 2
- Verify: full test suite green, coverage ≥80% cho credentials.ts

## Verify checklist (tổng)
- [ ] `oxfmt --check` pass
- [ ] `oxlint .` pass (0 warnings/errors)
- [ ] `tsc --noEmit` pass
- [ ] `vitest run` green — all credentials tests pass
- [ ] coverage credentials.ts ≥ 80% (statements/branches/functions)
- [ ] manual smoke: load → add → save → reload round-trip works
- [ ] chmod 600 enforced (load rejects loose, save tightens)
- [ ] atomic write (temp + rename)
- [ ] XOR union enforced (load + add)
- [ ] findByName returns Array (multi-result same-name)
- [ ] spec coverage: 04 §6 CredentialStore API đầy đủ (loadCredentials, saveCredentials, addWorkspace, removeWorkspace, getWorkspace, findByName, types)

## Risk / side-effect
- **Cross-platform chmod**: Windows KHÔNG support chmod 600 (NTFS khác). Mitigation: skip chmod check trên Windows (process.platform === 'win32'); document "Windows: file perms rely on ACL, KHÔNG chmod 600". Test skip cho Windows.
- **Atomic write trên same-volume**: temp file phải cùng volume với target cho atomic rename. Mitigation: temp file trong cùng dir (dirname(target) + `.credentials.json.tmp.<pid>`) — đảm bảo same-volume.
- **Concurrent write race**: 2 process cùng saveCredentials → last-write-wins (KHÔNG lock). Mitigation: document "single-writer assumption"; pi-huly = single process, KHÔNG concurrent write expected.
- **Secret KHÔNG log**: error messages KHÔNG include token/password values. Mitigation: throw error với field name (vd "token required"), KHÔNG value.

## Out of scope
- KHÔNG implement config/config.ts (T-03)
- KHÔNG implement config/resolver.ts (T-03)
- KHÔNG implement connection evict trong removeWorkspace (T-06 pool — chỉ note TODO)
- KHÔNG implement `/huly init` interactive flow (T-31)
- KHÔNG implement token verify (get_user_profile) — đó là pool/client job (T-05)
- KHÔNG implement encryption at rest (out of MVP scope — chmod 600 đủ per design)
