# T-01: Skeleton + tooling

> Implement plan. Tạo ở todo state, reference từ TASKS.md (local-tasks).
> Plan v1.1 — fix review major #1-4 + minor #5-20 (code-review-mentor).

## Issue reference
- Issue: T-01 (local-tasks, TASKS.md dòng 15)
- Spec: Skeleton + tooling (package.json pi-manifest, tsconfig TS7, rolldown bundle, oxlint/oxfmt, vitest, CI workflow, .node-version=24)
- Design docs:
  - [03 - Tech Stack & Architecture](../03-tech-stack.md) §1 (stack table), §2 (version verify), §3 (compat matrix), §8 (R3/R4/R6 mitigation)
  - [04 - System & Component Design](../04-system.md) §7 (package manifest)
  - [08 - Non-Functional](../08-non-functional.md) §C (CI matrix), §A (dep CVE/license + R4)
  - [09 - Roadmap](../09-roadmap.md) topology order 1
- Blocked by: — (đã verified unblocked ở PREFLIGHT)
- Blocks: T-02, T-03
- Risks: R3 (rolldown externals), R4 (nub build scripts), R6 (TS 7 types)
- Priority: high | Size: M | Milestone: M0

## Approach

T-01 = task-type **config/skeleton** → classic code (no TDD). Mục tiêu: setup toolchain + CI green KHÔNG logic business. Verify bằng smoke (build bundle rỗng + lint pass + test placeholder green).

Strategy: build từ dưới lên theo dependency order:
1. Base meta files (`.node-version`, `package.json` pi-manifest)
2. TS + lint config (`tsconfig.json`, `oxlint.config.json`, `.oxfmtrc.json`, `.markdownlint-cli2.jsonc`)
3. Source skeleton (`src/index.ts` minimal factory consume pi types + 1 trivial unit test)
4. Build config (`rolldown.config.ts` cho `dist/index.mjs`)
5. CI workflow (`.github/workflows/ci.yml` — fmt+lint+typecheck+test+bundle, Node×OS matrix; Transport×Auth×pi-version DEFER M1)
6. `.npmrc` cho GitHub Packages registry (R1 mitigation: maintainer build cần token; document `NPM_AUTH_TOKEN` env)
7. nub config (`trustedDependencies` whitelist R4 mitigation)
8. Smoke verify: typecheck + lint + test + build chạy pass local

## Task-type dispatch
- Skill: classic (config/skeleton — KHÔNG TDD, chỉ 1 trivial test để verify vitest wire-up)
- Subagent impl: no (task M homogeneous, main agent đủ)

## Versions (verified via npm 2026-07-27)
| Dep | Version | Pin | Bucket |
|---|---|---|---|
| typescript | 7.0.2 | ^7.0.2 | devDep |
| rolldown | 1.2.0 | ^1.2.0 | devDep |
| oxlint | 1.75.0 | ^1.75.0 | devDep |
| oxfmt | 0.60.0 | ^0.60.0 | devDep |
| vitest | 4.1.10 | ^4.1.10 | devDep |
| ws | 8.21.1 | ^8.21.1 | dependency (runtime, R2) |
| typebox | 1.3.8 | ^1.3.8 | peerDep `*` + devDep `^1.3.8` (peer consumer + dev typecheck) |
| markdownlint-cli2 | 0.23.1 | ^0.23.1 | devDep |
| @hcengineering/api-client | 0.7.423 | ^0.7.423 | dependency (R1: GitHub Packages token, bundled) |
| @hcengineering/{platform,text-markdown,tracker} | 0.7.423 | ^0.7.423 | dependency (bundled — class refs/markup; chỉ install các pkg M0 cần) |
| @earendil-works/{pi-coding-agent,pi-ai,pi-tui,pi-agent-core} | 0.82.1 | peerDep `*` + devDep `^0.82.1` (peer consumer + dev typecheck, fix #16) |

> **Version skew note (fix #6)**: Plan dùng version mới hơn đã verify npm 2026-07-27 (vd ws 8.21.1 vs design 03 §1 ghi `^8.18`, typebox 1.3.8 vs `1.1.38`, api-client 0.7.423 vs `^0.7.413`). Design 03 sẽ sync ở T-37 (docs task) — KHÔNG block T-01. Plan versions precedence cho implement.
>
> **pi peer `*` convention (fix #12)**: Version 0.82.1 = target/verify local; pin `*` = pi extension convention (pi bundles core peers, extension declare widest range). Per design 03 §1 + pi packaging guide.
>
> **typebox bucket (fix #1)**: design 03 §1 dòng 29 chỉ ra `peerDep *` cho consumer (pi runtime cung cấp); nhưng dev cần typecheck typebox → duplicate vào devDep `^1.3.8` (peer + dev overlap là pattern chuẩn).

## Steps

### Step 1: Base meta files
- Files:
  - `.node-version` = `24` (dev/CI pin LTS mới nhất; consumer runtime floor tách biệt qua engines)
  - `package.json`:
    - `name`: "pi-huly"
    - `type`: "module"
    - `version`: "0.1.0"
    - `keywords`: ["pi-package"]
    - `engines.node`: ">=22.19.0" (fix #8 — pi engine floor; consumer compat)
    - `pi` manifest: `{ "extensions": ["./dist/index.mjs"], "skills": ["./skills"] }`
    - `exports`: `{ ".": "./dist/index.mjs" }`
    - `main`: "./dist/index.mjs"
    - `module`: "./dist/index.mjs"
    - `files`: ["dist", "skills", "README.md", "LICENSE"] (fix #15 — publish-safe; .npmrc/.env KHÔNG list)
    - `scripts`: { `fmt`, `fmt:check`, `lint`, `lint:fix`, `lint:md`, `typecheck`, `test`, `test:run`, `build` } (fix #19 — `lint:md` riêng)
    - `dependencies`: { ws }
    - `devDependencies`: { typescript, rolldown, oxlint, oxfmt, vitest, @hcengineering/api-client, @hcengineering/platform, @hcengineering/text-markdown, @hcengineering/tracker, typebox, markdownlint-cli2, @earendil-works/pi-coding-agent, @earendil-works/pi-ai, @earendil-works/pi-tui, @earendil-works/pi-agent-core }
    - `peerDependencies`: { typebox: `*`, @earendil-works/pi-coding-agent: `*`, @earendil-works/pi-ai: `*`, @earendil-works/pi-tui: `*`, @earendil-works/pi-agent-core: `*` }
    - `trustedDependencies`: [@hcengineering/api-client, @hcengineering/platform, @hcengineering/text-markdown, @hcengineering/tracker] (R4 mitigation — nub approve-builds whitelist)
  - `.gitignore` append: `.task-implement-config.json`, `.pi/agent/` (fix #7 — `dist` đã có dòng 83, KHÔNG append lại)
- Note (fix #8): engines.node=floor pi (`>=22.19.0`, FR-01 consumer compat); `.node-version=24` = dev/CI pin (LTS mới nhất, design 03 §1). CI chỉ test 24 vì pi runtime chính thức là 24; nếu user chạy 22.19 engine vẫn OK (no syntax 24-only).
- Note (fix #13): LICENSE đã tồn tại (MIT), giữ nguyên. README.md đã có 1 dòng, chỉ append section "Build requirements" (Step 6).
- Verify: `node --version` matches `.node-version`; `cat package.json | jq .` valid JSON; `git ls-files .gitignore` đã có

### Step 2: TS + lint config
- Files:
  - `tsconfig.json`:
    - `compilerOptions`: target ES2023, module Node16, moduleResolution Node16, strict true, noEmit true (tsc chỉ typecheck; rolldown emit), skipLibCheck true, esModuleInterop true, isolatedModules true, resolveJsonModule true, types []
    - `include`: ["src/**/*", "vitest.config.ts", "rolldown.config.ts"] (fix #11 — typecheck build config files)
  - `oxlint.config.json` — rules recommended, ignore ["dist", "node_modules", "coverage"]
  - `.oxfmtrc.json` — style config (quoteStyle single, semi true, printWidth 100) (fix #14 — pre-1.0; monitor breaking changes; pin exact version nếu churn cao)
  - `.markdownlint-cli2.jsonc` (fix #3):
    ```jsonc
    {
      "config": { "default": true, "line-length": { "line_length": 120 } },
      "globs": ["docs/**/*.md", "README.md", "TASKS.md"],
      "ignores": ["node_modules", "dist", "CHANGELOG.md"]
    }
    ```
- Verify: `cat tsconfig.json | jq .` valid; `cat .markdownlint-cli2.jsonc | jq .` valid (cho phép comment jsonc)

### Step 3: Source skeleton (fix #2 — R6 verify thật)
- Files:
  - `src/index.ts`:
    ```typescript
    // pi-huly extension entry — placeholder factory (impl real ở T-33)
    import type {} from '@earendil-works/pi-coding-agent' // type-only import verify R6 (TS 7 vs pi types)
    
    export const HULY_VERSION = '0.1.0'
    
    export default function setup(_pi: unknown): void {
      // placeholder — T-33 factory sẽ registerTools + registerCommand + session_shutdown hook
    }
    ```
    > `_pi: unknown` (KHÔNG ExtensionAPI) vì avoid coupling cứng tới pi type ngay khi setup rỗng; nhưng `import type {}` force pi types load → R6 verify typecheck. Nếu pi types break TS 7 → typecheck fail → catch R6.
  - `src/__tests__/smoke.test.ts`: 1 trivial test `expect(HULY_VERSION).toBe('0.1.0')` (verify vitest wire-up)
- Verify: `nub run typecheck` pass (R6 verified), `nub run test` green

### Step 4: Build config (rolldown — R3, R2)
- Files:
  - `rolldown.config.ts`:
    - input: src/index.ts
    - output: { dir: "dist", entryFileNames: "index.mjs", format: "esm" }
    - external: ['ws', 'bufferutil', 'utf-8-validate', /^node:/, /^@earendil-works\//, /^@hcengineering\//, /^typebox$/] (fix #5 — explicit ws optional native addons)
    - treeshake: { moduleSideEffects: "no-external" }
  - `vitest.config.ts`:
    - environment: "node"
    - include: ["src/**/__tests__/**"]
- Verify:
  - `nub run build` → `dist/index.mjs` tồn tại
  - `wc -c dist/index.mjs` > 0
  - **Size bound (fix #18)**: `wc -c dist/index.mjs` < 50000 bytes (50KB threshold — skeleton chỉ có HULY_VERSION const → bundle phải rất nhỏ; >50KB = dấu hiệu inline dep)
  - **R3 externals smoke**: `grep -cE 'require\(|from .(ws|@hcengineering|@earendil-works|typebox)' dist/index.mjs` ≥ 0 (import statements OK — chỉ external); `grep -E 'bufferutil|utf-8-validate' dist/index.mjs` = 0 (R2 fix #5 — KHÔNG inline native addons)

### Step 5: CI workflow (R6 verify) — Node×OS matrix only, Transport×Auth×pi-version DEFER M1
- Files:
  - `.github/workflows/ci.yml`:
    - `strategy.matrix`: { `os`: [ubuntu-latest, macos-latest], `node-version`: [24] }
    - `steps`:
      1. checkout
      2. setup-node@v4 với node-version matrix + registry-url: https://npm.pkg.github.com (scope @hcengineering)
      3. setup pnpm/nub cache
      4. `nub install --frozen-lockfile` (env NPM_AUTH_TOKEN từ secret — cho maintainer build; consumer KHÔNG cần)
      5. `nub run fmt:check`
      6. `nub run lint`
      7. `nub run lint:md`
      8. `nub run typecheck`
      9. `nub run test:run`
      10. `nub run build`
      11. upload `dist/` artifact
- Note (fix #4 — explicit deferral): T-01 chỉ verify toolchain gate (Node×OS). Transport (ws/rest) × Auth (token/email-pass) × pi-coding-agent matrix DEFER tới M1 (T-05/T-06 khi có pool/client + integration mock test). Ghi carry-forward vào TASKS.md T-05/T-06 note "expand CI matrix".
- Verify: YAML valid (`npx --yes actionlint .github/workflows/ci.yml` nếu có, hoặc `cat ci.yml | python3 -c 'import sys,yaml; yaml.safe_load(sys.stdin)'`); steps khớp NFR-07 quality gate

### Step 6: Registry + nub config + docs (R1, R4)
- Files:
  - `.npmrc` (fix #17 — COMMIT, không ignore):
    ```
    @hcengineering:registry=https://npm.pkg.github.com
    //npm.pkg.github.com/:_authToken=${NPM_AUTH_TOKEN}
    ```
    > `.npmrc` commit (chỉ env var ref, KHÔNG token thật). KHÔNG thêm `.npmrc` vào .gitignore. User-level `~/.npmrc` chứa token thật (ngoài repo scope).
  - `README.md` append "Build requirements" section (fix #10 — R6 rollback procedure documented ở đây):
    - Yêu cầu: Node 24 (LTS), nub 0.4+, `NPM_AUTH_TOKEN` env var (GitHub Packages read token cho `@hcengineering/*`)
    - Install: `nub install` (resolve deps); `nub approve-builds` cho @hcengineering (R4)
    - R6 rollback: nếu TS 7 typecheck fail với pi types → `nub install typescript@~6.1` (ghi known-good TS version table) + re-typecheck; mở issue + tag maintainer
- Verify:
  - `.npmrc` parse OK
  - **(fix #9)** token-not-committed check: `grep -E '_authToken=\$\{NPM_AUTH_TOKEN\}' .npmrc` match (env var ref, KHÔNG token hex); `git ls-files -z | xargs -0 grep -lE 'npm_[A-Za-z0-9]{36,}|ghp_[A-Za-z0-9]{36,}'` returns empty (no real tokens anywhere in tracked files)

### Step 7: Smoke verify toàn bộ
- Run: `nub install` (resolve deps; nub approve-builds nếu prompt) → `nub run typecheck && nub run lint && nub run lint:md && nub run test:run && nub run build`
- Verify: tất cả green, `dist/index.mjs` tồn tại
- Manual: `node -e "import('./dist/index.mjs').then(m => console.log(m.HULY_VERSION))"` → in "0.1.0"

## Verify checklist (tổng)
- [ ] `nub run fmt:check` pass
- [ ] `nub run lint` pass
- [ ] `nub run lint:md` pass (markdownlint-cli2 với .markdownlint-cli2.jsonc config)
- [ ] `nub run typecheck` pass (R6 verified — pi types load qua `import type {}`)
- [ ] `nub run test:run` green (1 test)
- [ ] `nub run build` → `dist/index.mjs` tồn tại, >0 bytes, <50KB (fix #18)
- [ ] smoke: `node -e "import dist"` works → "0.1.0"
- [ ] R3 verify: bundle externals đúng — ws/@hcengineering/@earendil-works/typebox KHÔNG inline
- [ ] R2 verify: `grep -E 'bufferutil|utf-8-validate' dist/index.mjs` = 0 (no native addon inline)
- [ ] R6 verify: TS 7 typecheck pi types OK (`import type {}` force load)
- [ ] `.github/workflows/ci.yml` valid YAML, matrix [ubuntu, macos]×[node 24]
- [ ] CI matrix deferral noted: Transport×Auth×pi-version → M1 (T-05/T-06)
- [ ] `.npmrc` commit-safe (env var ref, no real token)
- [ ] token-not-committed check pass
- [ ] spec coverage: package manifest (04 §7), tech stack (03 §1), CI matrix (08 §C — Node×OS), risk register (R3/R4/R6 mitigation code path)

## Risk / side-effect
- R3 (rolldown externals): mitigation — explicit external array (ws + addons + node + @earendil-works + @hcengineering + typebox) + moduleSideEffects no-external + bundle size smoke <50KB
- R4 (nub build scripts): mitigation — trustedDependencies whitelist @hcengineering, document `nub approve-builds` README
- R6 (TS 7 types): mitigation — typecheck gate trong CI; `import type {}` force load pi types ở src/index.ts → catch R6 thật (KHÔNG nominal). Rollback procedure documented README (TS 7 → 6.1)
- R1 (@hcengineering GitHub Packages): mitigation — .npmrc registry + NPM_AUTH_TOKEN env var (commit-safe); consumer KHÔNG cần vì bundled
- R2 (ws native deps): deferred tới T-05/06 — T-01 chỉ externalize ws+addons, fallback pure-JS test ở pool impl. R2 verify build-time: `grep -E 'bufferutil|utf-8-validate' dist/index.mjs` = 0
- R5 (oxlint thiếu rule): carry-forward từ design 03 §8 — monitor rule gaps; oxlint 1.75 recommended đủ cho M0
- oxfmt 0.60.0 pre-1.0 (fix #14): monitor breaking format changes; nếu churn cao → pin exact (bỏ `^`). Mitigation: `fmt:check` gate + commit formatted output

## Out of scope
- KHÔNG implement config/credentials logic (T-02)
- KHÔNG implement config/resolver (T-03)
- KHÔNG implement client/pool/client/errors (M1)
- KHÔNG implement tools layer (M2)
- KHÔNG implement commands/render (M3)
- KHÔNG setup skills/ dir (T-34) — KHÔNG tạo placeholder (pi manifest reference but skills/ dir chưa tồn tại OK cho M0 skeleton)
- KHÔNG install @hcengineering cross-package ngoài api-client/platform/text-markdown/tracker (các pkg khác thêm ở task cần — vd document, contact, tags khi implement domain tools M2)
- KHÔNG expand CI matrix Transport×Auth (DEFER M1 T-05/T-06)
- src/index.ts chỉ placeholder factory (impl real ở T-33)
- markdownlint scope = `docs/**/*.md` + README + TASKS (design docs) (fix #20); KHÔNG lint src/*.ts docstrings (oxlint handles)
