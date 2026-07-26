# pi-huly

> Native Huly support cho pi-coding-agent — ~102 tools + skills + subagent (KHÔNG MCP, gọi thẳng WebSocket API).

**Status:** M0 Foundation (in-progress). Design docs: [`docs/design/`](./docs/design/). Tasks: [`TASKS.md`](./TASKS.md).

## Build requirements

- **Node.js 24** (LTS) — pin via `.node-version`. Consumer runtime floor `>=22.19.0` (pi engine).
- **pnpm** — package manager (CI dùng pnpm; dev có thể dùng `nub` thay thế — pnpm-compat).
- **`NPM_AUTH_TOKEN`** — GitHub Packages read token cho `@hcengineering/*` deps (registry `npm.pkg.github.com`).
  - Tạo token: <https://github.com/settings/tokens> (Classic PAT, scope `read:packages`)
  - Set env: `export NPM_AUTH_TOKEN=ghp_xxx` (hoặc lưu `~/.npmrc` ngoài repo scope)
  - `.npmrc` (commit, repo root) reference env var — KHÔNG commit token thật.

## Install & develop

```bash
# 1. Set token
export NPM_AUTH_TOKEN=ghp_xxx

# 2. Install deps
pnpm install   # hoặc: nub install
nub approve-builds   # nếu dùng nub — approve @hcengineering build scripts (R4)

# 3. Verify toolchain
pnpm run typecheck
pnpm run lint
pnpm run lint:md
pnpm run test:run
pnpm run build    # → dist/index.mjs
```

## R6 rollback procedure (TS 7 vs pi types)

If `pnpm run typecheck` fails with TS 7 incompatibility against `@earendil-works/*` types:

```bash
# Rollback to TS 6.x (known-good) + re-typecheck
pnpm install -D typescript@~6.1
pnpm run typecheck
# Nếu pass → ghi known-good TS version + mở issue tag maintainer
# Nếu fail → investigate root cause (có thể pi types bug, KHÔNG phải TS 7)
```

> TS 7 (native Go compiler, 2026-07-08) is mostly backward-compat. R6 likelihood 🟢 per design `03-tech-stack.md` §8.

## Project structure

```text
pi-huly/
├── docs/design/          # Design docs (10 steps, project-design skill)
├── src/                  # TypeScript source
│   └── __tests__/        # Unit tests (vitest)
├── .github/workflows/    # CI (GitHub Actions)
├── package.json          # pi manifest + scripts + deps
├── tsconfig.json         # TS 7 strict
├── rolldown.config.ts    # Bundler (R3: externals pi-*+ws+@hcengineering)
├── vitest.config.ts      # Test runner
└── .npmrc                # @hcengineering registry (GitHub Packages)
```

## License

MIT © naicoi92 — see [LICENSE](./LICENSE).
