# T-38 — Implement Plan: npm publish prep

> **Task**: [T-38] [S] high priority — npm publish prep.
> **Milestone**: M5. **Blocked-by**: T-36 (✅), T-37 (✅). **Blocks**: T-39.

## 1. Mục tiêu

Chuẩn bị package cho `npm publish` (KHÔNG publish thực — T-39 release deferred
to maintainer). Spec gốc (TASKS.md T-38): "prepack build, version, pi-package
keyword, pi manifest final".

## 2. Doc-code conflict phát hiện (audit T-38, self-resolvable)

Audit T-38 (2026-07-27) xác nhận **mismatch giữa docs và code**:

- **Design docs + NOTICE.md + README** claim: "@hcengineering/* **bundled** vào
  dist/index.mjs → consumer KHÔNG cần GitHub token" (NFR-06).
- **rolldown.config.ts** thực tế: `external: [/^@hcengineering\//]` → KHÔNG
  bundled. dist/index.mjs `import { connect } from "@hcengineering/api-client"`.
- **package.json**: `@hcengineering/*` là `dependencies` → consumer install
  chúng từ npm public (publishConfig access public, verified T-37) → KHÔNG cần
  token.

**Resolution** (doc-code mismatch, self-resolvable — KHÔNG design conflict):
- NFR-06 thực claim = "consumer KHÔNG cần GitHub Packages token" → **ĐÚNG**
  (@hcengineering public trên npmjs.org).
- Nhưng mechanism KHÔNG phải "bundle vào dist" — mà là "npm public dependency".
- **Fix**: update NOTICE.md + README + design 03 §3 cho khớp code: external
  dep, KHÔNG bundled. EPL-2.0 attribution vẫn apply (consumer install
  @hcengineering từ npm, license inherit).

**Hệ quả**: dist nhỏ hơn (150 kB vs nếu bundle ~MB). Consumer install
@hcengineering/* riêng (npm auto-resolve từ dependencies field).

## 3. Deliverables

| # | File | Action | Content |
|---|---|---|---|
| 1 | `package.json` | update | version 0.1.0 → 1.0.0; add `prepack` script; verify `pi` manifest; verify `files` field includes NOTICE.md; add `CHANGELOG.md` ref |
| 2 | `CHANGELOG.md` | **new** | v1.0.0 entry (initial stable release) |
| 3 | `.npmignore` | **new** | exclude src/, docs/, TASKS.md, tests, dev config — chỉ ship dist + skills + README + LICENSE + NOTICE + package.json |
| 4 | `NOTICE.md` | fix | "bundled" → "npm public dependency" (doc-code sync) |
| 5 | `README.md` | minor fix | "bundled" wording → "npm dependency" |
| 6 | `docs/design/03-tech-stack.md` | fix | §1 + §3 + §4 row clarify: external, not bundled |
| 7 | `docs/design/plans/T-38-implement-plan.md` | new | This plan |

## 4. Implementation

### Phase 1: package.json prep

- Bump `version`: `0.1.0` → `1.0.0`.
- Add `prepack` script: `"prepack": "pnpm run build"` (npm auto-run trước
  publish, đảm bảo dist fresh).
- Verify `pi` manifest:
  - `pi.extensions: ["./dist/index.mjs"]` ✅ (đã có)
  - `pi.skills: ["./skills"]` ✅ (đã có)
- Verify `files` field: `["dist", "skills", "README.md", "LICENSE", "NOTICE.md"]`
  → add NOTICE.md.
- Verify `keywords` has `pi-package`.
- Verify `engines.node`: `>=22.19.0` (pi engine floor).

### Phase 2: CHANGELOG.md

Standard Keep-a-Changelog format:

```markdown
# Changelog

## [1.0.0] - 2026-07-27

### Added
- Native Huly support: 102 tools across 19 domains (full CRUD).
- Skills: huly-docs + huly-tasks (bundled, adapted huly_ prefix).
- Unified /huly command (init/status/workspace/link/unlink).
- Multi-workspace credentials (token + email/password auth union).
- Transport toggle: WebSocket (pool) + REST (stateless).
- TUI render: huly_get_issue card, huly_list_issues table, huly_get_document.
- Confirm gate for destructive ops (FR-09).
- Markdown round-trip lossless (R8).

### Documentation
- Full README user-facing guide.
- NOTICE.md with R1 license audit (@hcengineering EPL-2.0 attribution).
- Design docs (10-step project-design).

### Tested
- 365 tests pass (unit + integration + e2e smoke).
- CI green (ubuntu + macos, node 24).
```

### Phase 3: .npmignore

Exclude everything không cần runtime:

```gitignore
# Source + tests (KHÔNG ship)
src/
docs/
.github/
.pi/
*.test.ts
vitest.config.ts
tsconfig.json
rolldown.config.ts
oxlint.config.json
.oxfmtrc.json
.markdownlint-cli2.jsonc
.node-version
TASKS.md
pnpm-lock.yaml
pnpm-workspace.yaml
```

Giữ: dist/, skills/, README.md, LICENSE, NOTICE.md, CHANGELOG.md, package.json.

### Phase 4: Fix doc-code mismatch

- `NOTICE.md`: section "Bundled dependencies (EPL-2.0)" → rename "Runtime
  dependencies (EPL-2.0, npm public)". Update wording: KHÔNG bundled, consumer
  install từ npm. EPL-2.0 attribution vẫn apply.
- `README.md`: License section "Bundled @hcengineering" → "Runtime dependency
  @hcengineering".
- `docs/design/03-tech-stack.md` §1 table row @hcengineering: "bundled" →
  "external dep, npm public".
- §3 + §4 rows similar.

### Phase 5: Verify + commit + PR

- `pnpm pack --dry-run` → inspect tarball contents (chỉ dist + skills + docs
  user-facing + LICENSE + NOTICE + CHANGELOG + package.json).
- `pnpm run fmt:check && lint && typecheck && test:run && build && lint:md` pass.
- Branch `t-38-publish-prep` + commit + push + PR + chờ CI + merge.

## 5. Verification checklist (DoD T-38)

- [ ] package.json version 1.0.0
- [ ] `prepack` script present
- [ ] `files` includes NOTICE.md
- [ ] CHANGELOG.md created with v1.0.0 entry
- [ ] .npmignore excludes src/docs/tests
- [ ] `pnpm pack --dry-run` shows clean tarball
- [ ] NOTICE/README/03-tech-stack doc-code sync (no "bundled" overclaim)
- [ ] lint:md pass
- [ ] CI green
- [ ] PR merged
- [ ] TASKS.md T-38 done

## 6. Risk / Out of scope

- **KHÔNG publish thực** (T-39 deferred). T-38 chỉ prep.
- **Doc-code mismatch**: fix docs cho khớp code (external dep). KHÔNG change
  rolldown config (external is correct — bundle would bloat dist + cause
  version drift when @hcengineering updates).
- **npm auth**: KHÔNG login/npm whoami trong CI (maintainer responsibility).
- **Version 1.0.0**: stable marker. Maintainer có thể chọn 0.x cho pre-release
  (10-release §B canary strategy). T-38 default 1.0.0 per design.
