# T-05: client/client.ts — HulyClient wrapper

> Implement plan. T-05 = task-type logic mới → TDD red-green-refactor.
> Evidence: api-client real API verified từ installed packages (evidence-collector).

## Issue reference
- Issue: T-05 (local-tasks, TASKS.md dòng 22)
- Spec: client/client.ts (connect ws/rest, generic CRUD, getCurrentUser) + integration mock
- Design docs:
  - [04 - System](../04-system.md) §6 client/client.ts (dòng 187-198) — NB: spec chữ ký `createHulyClient(creds, transport)` sẽ reconcile với evidence thật
  - [01 - Vision](../01-vision.md) §B.3 D3 (transport ws/rest toggle), §B.10 D10 (reimplement thin)
  - [09 - Roadmap](../09-roadmap.md) topology order 5
- Blocked by: T-04 (✅ done)
- Blocks: T-06, T-07
- Priority: high | Size: M | Milestone: M1

## Doc reconciliation needed
04-system.md §6 dòng 191 ghi `createHulyClient(creds: AuthCreds, transport: 'ws'|'rest')` — KHÔNG khớp evidence thật:
- Real: `connect(url, options)` / `connectRest(url, options)` — url tách riêng, KHÔNG trong creds object
- Real: `getCurrentUser` KHÔNG tồn tại → dùng `client.getAccount(): Promise<Account>`
- Real: types từ `@hcengineering/core`, KHÔNG `@hcengineering/platform`

HOW-level fix (KHÔNG design conflict — interface-level detail). Update 04 §6 reconcile.

## Evidence: api-client real API (evidence-collector)

```ts
// @hcengineering/api-client
connect(url: string, options: ConnectOptions): Promise<PlatformClient>
connectRest(url: string, options: AuthOptions): Promise<RestClient>
createRestTxOperations(endpoint, workspaceId, token): Promise<TxOperations>  // cho REST write ops
getWorkspaceToken(url, options): Promise<{endpoint, workspaceId, token}>     // resolve token từ creds

// ConnectOptions = ConnectSocketOptions & AuthOptions
// AuthOptions = { workspace: string } & ({ token: string } | { email: string, password: string })

// PlatformClient methods (ws — full CRUD):
findOne<T>(_class, query, options?): Promise<WithLookup<T> | undefined>
findAll<T>(_class, query, options?): Promise<FindResult<T>>
createDoc<T>(_class, space, attributes, id?): Promise<Ref<T>>
updateDoc<T>(_class, space, objectId, operations, retrieve?): Promise<TxResult>
removeDoc<T>(_class, space, objectId): Promise<TxResult>
addCollection<T,P>(_class, space, attachedTo, attachedToClass, collection, attributes): Promise<Ref<P>>
createMixin<D,M>(objectId, objectClass, objectSpace, mixin, attributes): Promise<TxResult>
getAccount(): Promise<Account>
close(): Promise<void>

// RestClient (rest — read-only + cần createRestTxOperations cho write):
findOne/findAll/getAccount same as ws
// createDoc/updateDoc/removeDoc/addCollection/createMixin KHÔNG có → phải dùng TxOperations

// Account type:
interface Account { uuid: AccountUuid, role, primarySocialId: PersonId, socialIds, fullSocialIds }
```

## Approach

T-05 = **logic mới** (HulyClient wrapper + integration mock test) → **TDD red-green-refactor**.

Key design decisions (từ evidence):
1. **`createHulyClient(creds, transport)`** chọn `connect` (ws) hoặc `connectRest` (rest) + `createRestTxOperations` cho REST write
2. **Unified HulyClient interface**: expose `findOne/findAll/createDoc/updateDoc/removeDoc/addCollection/createMixin` cho cả 2 transport (ws dùng PlatformClient trực tiếp, rest ủy quyền TxOperations)
3. **`getCurrentUser()`**: wrap `client.getAccount()`, cache sau connect (D15 FR-18 assignee default)
4. **`close()`**: ws → `client.close()`, rest → no-op (stateless)
5. **Types**: import từ `@hcengineering/api-client` (PlatformClient, RestClient, AuthOptions) + `@hcengineering/core` (Ref, Doc, Account, TxOperations)
6. **Integration mock**: test với mock PlatformClient/RestClient (KHÔNG cần Huly server thật) — verify createHulyClient gọi connect/connectRest đúng + methods ủy quyền đúng

## Task-type dispatch
- Skill: `superpowers:test-driven-development` (red-green-refactor)
- Subagent impl: no (task M, main agent TDD đủ — integration mock test)

## Steps

### Step 1: Doc reconciliation + types
- Files:
  - `docs/design/04-system.md` §6 dòng 187-198 — reconcile signatures với evidence thật
  - `src/client/client.ts` — types only (red phase)
    - `type Transport = 'ws' | 'rest'`
    - `type HulyCredentials = { url: string } & AuthOptions` (url tách + auth union từ credentials.ts)
    - `interface HulyClient` — unified methods (findOne/findAll/createDoc/updateDoc/removeDoc/addCollection/createMixin + getAccount/getCurrentUser/close)
- Verify: `tsc --noEmit` pass

### Step 2: createHulyClient — TDD (mock connect/connectRest)
- Files: `src/client/client.ts` (impl), `src/client/__tests__/client.test.ts` (tests)
- Mock strategy: `vi.mock('@hcengineering/api-client')` — mock connect/connectRest/createRestTxOperations/getWorkspaceToken
- Test cases:
  1. createHulyClient(creds, 'ws') → gọi connect(url, options) → return HulyClient
  2. createHulyClient(creds, 'rest') → gọi connectRest + createRestTxOperations → return HulyClient
  3. createHulyClient default transport='ws'
  4. ws HulyClient.findOne → delegates to PlatformClient.findOne
  5. ws HulyClient.createDoc → delegates to PlatformClient.createDoc
  6. ws HulyClient.getAccount → delegates to PlatformClient.getAccount
  7. ws HulyClient.close → calls PlatformClient.close
  8. rest HulyClient.findOne → delegates to RestClient.findOne
  9. rest HulyClient.createDoc → delegates to TxOperations.createDoc (from createRestTxOperations)
  10. rest HulyClient.close → no-op (stateless, KHÔNG throw)
- Verify: vitest green

### Step 3: getCurrentUser cache — TDD
- Test cases:
  1. getCurrentUser() lần đầu → gọi getAccount() → cache
  2. getCurrentUser() lần 2 → KHÔNG gọi getAccount() nữa (dùng cache)
  3. getCurrentUser() trả { id, name, email } shape (map từ Account)
- Verify: vitest green

### Step 4: Error mapping integration
- Files: same
- Test cases:
  1. connect throw PlatformError → createHulyClient throw mapped HulyError (use mapError từ T-04)
  2. createDoc throw network Error → mapped ConnectionError
- Verify: vitest green

### Step 5: Integration smoke + finalize
- Test cases:
  1. Full flow: createHulyClient(ws) → findAll → createDoc → close (mock end-to-end)
  2. Full flow: createHulyClient(rest) → findOne → updateDoc → close
- Verify: full suite green, coverage ≥80%

## Verify checklist (tổng)
- [ ] `oxfmt --check` pass
- [ ] `oxlint .` pass
- [ ] `markdownlint-cli2` pass (04-system.md updated clean)
- [ ] `tsc --noEmit` pass
- [ ] `vitest run` green — client tests pass
- [ ] coverage client.ts ≥ 80%
- [ ] createHulyClient chọn đúng connect/connectRest theo transport
- [ ] unified HulyClient interface (findOne/findAll/createDoc/.../getCurrentUser/close)
- [ ] getCurrentUser cache (gọi getAccount 1 lần)
- [ ] error mapping (PlatformError/network → HulyError)
- [ ] spec coverage: 04 §6 client.ts API (reconciled với evidence)

## Risk / side-effect
- **Mock vs real**: tests dùng vi.mock — KHÔNG test real Huly server (M1 DoD yêu cầu "mock Huly WS+REST integration pass" — mock đủ per 08 §C)
- **REST write complexity**: RestClient read-only + cần createRestTxOperations riêng. Mitigation: HulyClient interface ủy quyền thống nhất (caller KHÔNG cần biết transport).
- **getCurrentUser caching**: cache lifetime = client lifetime (close → invalidate). KHÔNG refresh (user đổi name trên Huly → stale cho tới reconnect).
- **Node WebSocket**: connect() cần socketFactory Node-compatible. Mitigation: import từ `@hcengineering/api-client/socket` (Node factory). Verify ở integration test.

## Out of scope
- KHÔNG implement connection pool/LRU (T-06)
- KHÔNG implement auto-reconnect (T-06)
- KHÔNG implement assignee resolution (T-07)
- KHÔNG implement markup integration (T-08a/b — separate module)
- KHÔNG implement domain methods (createIssue, listDocuments — M2 tools layer)
- KHÔNG test với real Huly server (M5 e2e T-36)
