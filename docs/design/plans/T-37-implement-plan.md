# T-37 — Implement Plan: docs (README, setup, /huly guide, deploy, R1 license)

> **Task**: [T-37] [M] medium priority — docs.
> **Milestone**: M5 Hardening + release. **Blocked-by**: T-33 (✅ done). **Blocks**: T-38.
> **Risk**: R1 (license audit).

## 1. Mục tiêu

Cập nhật / tạo mới tài liệu end-user cho pi-huly. Spec gốc (TASKS.md T-37):
"docs (README, setup guide, /huly guide, Bước 10 deploy, @hcengineering
GitHub token doc, R1 license audit)".

**Note**: design doc nói "@hcengineering GitHub token doc" — audit T-36/T-37
xác nhận @hcengineering publish **public trên npmjs.org** (license EPL-2.0, KHÔNG
GitHub Packages token). Doc cũ (D10 03-tech-stack §3) đã tự-correct. T-37 doc
chính xác: **no token needed**.

## 2. Deliverables

| # | File | Action | Content |
|---|---|---|---|
| 1 | `README.md` | **rewrite** | Full user-facing intro: features, install, quick start, /huly guide, tool catalog summary, troubleshooting, license (R1 EPL disclosure), links |
| 2 | `LICENSE` | verify | MIT header (đã có) — verify intact |
| 3 | `NOTICE.md` | **new** | R1 license audit: @hcengineering EPL-2.0 bundled attribution + ws/pi/typebox MIT |
| 4 | `docs/design/00-home.md` | fix | Remove duplicate "08 - Non-Functional" line + orphan "| 3-10 | — | pending |" line |
| 5 | `docs/design/03-tech-stack.md` §3 | verify/fix | D10 note đã correct (no GitHub token) — confirm |
| 6 | `docs/design/10-release.md` | verify | Already covers deploy strategy — no change |

## 3. R1 License Audit (KEY deliverable)

Verified actual licenses (npm package.json metadata, 2026-07-27):

| Dependency | License | Bundled in dist? |
|---|---|---|
| `@hcengineering/api-client` | **EPL-2.0** | ✅ yes |
| `@hcengineering/core` | **EPL-2.0** | ✅ yes |
| `@hcengineering/platform` | **EPL-2.0** | ✅ yes |
| `@hcengineering/text-core` | **EPL-2.0** | ✅ yes |
| `@hcengineering/text-markdown` | **EPL-2.0** | ✅ yes |
| `ws` | MIT | external (R3) |
| `typebox` | MIT | peer (external) |
| `@earendil-works/pi-coding-agent` | MIT | peer (external) |
| pi-huly itself | **MIT** | — |

**R1 conclusion**: pi-huly (MIT) **bundles** @hcengineering (EPL-2.0) into
dist/index.mjs. EPL-2.0 copyleft là **file-level** — bundle KHÔNG làm toàn bộ
pi-huly trở thành EPL. Requirements:
1. **Attribution**: NOTICE.md liệt kê @hcengineering EPL-2.0 + source link.
2. **Source availability**: EPL §3.6 yêu cầu source code available. Consumer
   có thể lấy từ npm tarball (src included? KHÔNG — chỉ dist). → Cần hướng dẫn
   consumer lấy source từ `@hcengineering` npm packages trực tiếp (public).
3. **No patent retaliation issue** cho non-commercial use.
4. **MIT compat EPL-2.0**: bundled mix — dist/index.mjs chứa cả MIT (pi-huly
   code) + EPL-2.0 (@hcengineering code). LICENSE file giữ MIT cho phần pi-huly;
   NOTICE.md disclose EPL portion.

→ **Accept R1**: bundle approach hợp lệ với attribution + source-availability
disclosure. KHÔNG block release.

## 4. Implementation

### Phase 1: Rewrite README.md

User-facing, KHÔNG phải internal design doc. Sections:
1. Header: name + tagline + status (post-M5) + badges (CI, license, npm)
2. Features (5-7 bullets, copy từ 01-vision §A.4)
3. Requirements (Node 24, self-host Huly, pi-coding-agent)
4. Install (1-liner `pi install`)
5. Quick start (3-step: install → /huly init → use tool)
6. `/huly` command guide (table subcommands)
7. Tool catalog summary (19 domains, ~102 tools — không list từng tool)
8. Configuration (credentials.json + config.json structure, security note)
9. Transport + auth (ws/rest, token/email-password)
10. Skills (huly-docs + huly-tasks bundled)
11. Troubleshooting (NeedsInit, NeedsDisambiguation, R6 TS 7 rollback)
12. License (MIT + EPL-2.0 bundled, link NOTICE.md)
13. Links (design docs, issues, Huly self-host guide)

### Phase 2: Create NOTICE.md

R1 attribution:
- pi-huly MIT © naicoi92
- Bundled @hcengineering/* EPL-2.0 (5 packages) + source link
- External MIT deps (ws, typebox, pi)
- EPL-2.0 full text reference URL

### Phase 3: Fix 00-home.md + verify 03-tech-stack.md

- Remove duplicate "08 - Non-Functional" entry (line 26).
- Remove orphan table row "| 3-10 | — | pending |" (line 50).

### Phase 4: Verify + commit + PR

- `pnpm run lint:md` pass (0 issues).
- `pnpm run fmt:check && lint && typecheck && test:run && build` pass.
- Branch `t-37-docs` + commit + push + PR + chờ CI + merge.

## 5. Verification checklist (DoD T-37)

- [ ] README.md rewritten user-facing (install + quick start + /huly guide)
- [ ] NOTICE.md created với R1 license audit (EPL-2.0 attribution)
- [ ] 00-home.md duplicate/orphan fixed
- [ ] lint:md pass (0 issues)
- [ ] CI green
- [ ] PR merged
- [ ] TASKS.md T-37 done

## 6. Risk / Out of scope

- **R1 legal review**: audit này là technical analysis, KHÔNG phải legal advice.
  Maintainer responsibility final review. Document assumptions rõ.
- **@hcengineering source availability**: EPL §3.6 yêu cầu source. Tarball
  publish chỉ có dist (bundle). Notice.md hướng dẫn consumer lấy source từ
  npm packages @hcengineering (public) — KHÔNG bundle source vào tarball
  (size bloat, R3).
- **KHÔNG** change LICENSE file (MIT intact cho pi-huly code).
- **KHÔNG** doc internal design (đã có docs/design/).
