# T-39 — Release Plan (prep only, deferred to maintainer)

> **Task**: [T-39] [M] high priority — release (Bước 10).
> **Milestone**: M5. **Blocked-by**: T-38 (✅).
> **STATUS**: PREP ONLY — KHÔNG execute `npm publish` / `git tag` tự động.
> Maintainer runs commands sau khi verify prep pass.

## 1. Rationale for deferred execution

T-39 là task outward-facing + **irreversible** (`npm publish` нельзя unpublish
sau 72h, `git tag` push khó undo). Theo nguyên tắc agent: KHÔNG tự thực hiện
thao tác outward-facing khi chưa có auth/confirmation rõ ràng.

Audit context (slash goal mode, 2026-07-27):
- User KHÔNG confirm có npm publish access (`npm whoami` fail — chưa login).
- User KHÔNG confirm sẵn sàng release v1.0.0 ngay.
- Slash goal mode = tự chủ implementation, NHƯNG release = distribution action
  beyond implementation scope.

→ T-39 làm **prep only**: pre-release audit checklist + runbook commands +
post-deploy verify checklist. Maintainer executes khi ready.

## 2. Pre-Release Audit (gate cứng — verify tất cả trước publish)

### 2.1 Milestones closed

- [x] M0 Foundation ✅ (TASKS.md confirmed)
- [x] M1 Client core ✅
- [x] M2 Tools layer ✅
- [x] M3 Commands + render + factory ✅
- [x] M4 Skills ✅
- [x] M5 Hardening + release — T-36, T-37, T-38 done; T-39 prep only (this)

### 2.2 Code hygiene

- [x] **TODO/FIXME/HACK scan** (2026-07-27): 1 TODO thật trong
      `src/tools/domains/search.ts:24` — documented ("replace bằng real search
      API khi Huly expose"), KHÔNG fix được (upstream gap). Accept.
- [x] **console.log/debug scan**: 0 trong src (KHÔNG tính test files).
- [x] **Secret scan** (git log + src): 0 real secret. Chỉ test fixtures
      (`supersecret123abc` = fake test value trong e2e-smoke.test.ts no-leak test).

### 2.3 Build + test

- [x] `pnpm run fmt:check` ✅
- [x] `pnpm run lint` ✅ (0 warnings, 0 errors)
- [x] `pnpm run typecheck` ✅
- [x] `pnpm run test:run` ✅ (365 tests)
- [x] `pnpm run build` ✅ (dist/index.mjs 150.33 kB)
- [x] `pnpm run lint:md` ✅ (0 issues, 22 files)
- [x] CI green (ubuntu + macos, node 24)

### 2.4 Dependencies

- [x] `@hcengineering/*` EPL-2.0 (5 packages) — npm public, KHÔNG token needed
      (verified T-37 via publishConfig access public).
- [x] `ws` MIT, `typebox` MIT, `@earendil-works/*` MIT.
- [x] R1 license audit done (NOTICE.md).
- [x] R4 build scripts: KHÔNG có postinstall scripts nguy hiểm (KHÔNG @hcengineering
      build scripts, chỉ dist).

### 2.5 Risks

- [x] R1 (license) — accept (NOTICE.md attribution + source availability).
- [x] R2 (ws native deps) — fallback pure-JS verified (T-05/T-06 integration).
- [x] R3 (rolldown externals) — external config correct, bundle 150 kB (T-38).
- [x] R4 (build scripts) — no dangerous scripts.
- [x] R6 (TS 7) — typecheck pass, R6 rollback doc trong README.
- [x] R7 (subagent) — precondition verified (T-35), dispatch deferred (documented).
- [x] R8 (markup round-trip) — lossless verified (T-08b, 25 tests).

### 2.6 Version + manifest

- [x] package.json version = 1.0.0
- [x] src/version.ts HULY_VERSION = 1.0.0
- [x] pi manifest: extensions + skills intact
- [x] files field: dist, skills, README, LICENSE, NOTICE, CHANGELOG
- [x] .npmignore defense-in-depth

### 2.7 Tarball inspection

- [x] `pnpm pack --dry-run` clean (T-38 verified):
  - CHANGELOG.md, LICENSE, NOTICE.md, README.md, package.json
  - dist/index.mjs + .map
  - skills/huly-docs/* + skills/huly-tasks/*
  - KHÔNG src/, docs/, TASKS.md, tests, dev config

**Pre-release audit PASS.** Ready for maintainer to execute publish.

## 3. Release Runbook (maintainer executes)

### 3.1 Pre-publish final check

```bash
# 1. Verify on main, clean
git checkout main
git pull
git status  # clean

# 2. Final build + test
pnpm install --frozen-lockfile
pnpm run fmt:check && pnpm run lint && pnpm run typecheck
pnpm run test:run
pnpm run build
pnpm run lint:md

# 3. Inspect tarball
pnpm pack --dry-run
# Verify: dist + skills + 4 docs + package.json only

# 4. Login npm (if not already)
npm login
npm whoami  # confirm account với publish quyền cho 'pi-huly'
```

### 3.2 Publish (canary first — 10-release §B strategy)

```bash
# Option A: Canary pre-release (recommended — early adopter test)
npm version 1.0.0-beta.1 --no-git-tag-version
git add -A && git commit -m "chore: bump 1.0.0-beta.1 (canary)"
git tag v1.0.0-beta.1
npm publish --tag beta
git push origin main --tags

# Verify canary install
pi install npm:pi-huly@beta
/huly status  # smoke

# Option B: Stable (after canary feedback positive)
npm version 1.0.0 --no-git-tag-version  # already 1.0.0, skip nếu đã set
git tag -a v1.0.0 -m "pi-huly v1.0.0: native Huly support cho pi-coding-agent"
npm publish --access public
git push origin main --tags
```

### 3.3 Post-publish verification

```bash
# 1. Fresh env install (no GitHub token needed)
cd /tmp && mkdir pi-huly-verify && cd pi-huly-verify
pi install npm:pi-huly
pi list  # confirm pi-huly appears

# 2. /huly init + status
/huly init  # interactive — chọn workspace + project
/huly status  # expect: connected as <user>, version 1.0.0

# 3. Smoke ~10 critical tools trên self-host thật
#    (create_issue, list_issues, get_issue, create_document, edit_document,
#     create_milestone, set_issue_milestone, add_comment, fulltext_search)
#    Deferred runtime e2e (T-36) — thực hiện ở đây

# 4. Transport both: ws + rest (config.json toggle)
# 5. Auth both: token + email/password
# 6. Markup round-trip (native ref link)
```

### 3.4 Tag + release notes

```bash
# GitHub release
gh release create v1.0.0 --title "pi-huly v1.0.0" --notes-file CHANGELOG.md
```

Release notes (human summary, KHÔNG copy full changelog):

> Native Huly tools (~102, full CRUD / 19 domain), huly-docs + huly-tasks
> skills, multi-workspace credentials, ws | rest transport, unified /huly
> command, pi-subagents compatible. Self-host Huly only. Node 24, TS 7,
> oxc toolchain.

## 4. Rollback Plan (10-release §C)

| Trigger | Action | RTO |
|---|---|---|
| Smoke fail post-publish | `npm dist-tag` latest → old version; HOẶC `npm unpublish` (<72h) | <1h |
| Error spike (user reports) | `npm dist-tag` rollback + investigate | <4h |
| Breaking bug | patch `1.0.1` fix-forward | <24h |

User-side rollback: pin `npm:pi-huly@<old>` trong settings.json (pi supports
versioned specs).

## 5. Post-Release Monitoring (10-release §F)

| Window | Action |
|---|---|
| 0-1h | watch npm install success rate, GitHub issues |
| 1-24h | watch user reports (errors, markup, transport); respond |
| 1-7d | postmortem nếu incident; update Risk Register; patch 1.0.1 nếu cần |
| 7d+ | close M5; retro; plan next minor |

## 6. T-39 deliverable (this PR)

- This plan doc (`docs/design/plans/T-39-implement-plan.md`) — runbook.
- KHÔNG change code (T-39 = procedural, KHÔNG implementation).
- KHÔNG execute publish/tag (deferred).

## 7. Status flag

**T-39 = prep done, execution deferred to maintainer.** Khi maintainer runs
runbook §3 + post-publish verify §3.3 pass → mark T-39 done + close M5.

## 8. Verification checklist (DoD T-39 prep)

- [x] Pre-release audit pass (§2)
- [x] Release runbook documented (§3)
- [x] Post-publish verify checklist (§3.3)
- [x] Rollback plan (§4)
- [x] Monitoring plan (§5)
- [ ] **Maintainer executes publish** (deferred — KHÔNG this PR)
- [ ] **Post-publish verify pass** (deferred)
- [ ] **git tag v1.0.0 created** (deferred)
- [ ] **M5 closed** (after maintainer sign-off)
