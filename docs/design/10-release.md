# pi-huly — Release & Deploy Plan

> Bước 10/10. pi-huly = **npm package (local pi extension)**, KHÔNG server
> deploy. Distribution = `npm publish` + user `pi install`. Trace T-39, D1
> (native package).

## A. Pre-Release Audit (gate cứng)

- [ ] Mọi milestone M0-M5 closed, DoD green (build+typecheck+lint+test, CI green)
- [ ] KHÔNG TODO/FIXME/HACK/console.log/debug trong src
- [ ] KHÔNG secret hardcode (git log scan: token/password/email)
- [ ] Dependency CVE clean (`nub audit`) + license clean (R1: @hcengineering
  EPL/MPL compat MIT verify)
- [ ] R1-R8 tất cả mitigated/accept (R7 subagent verified, R8 markup round-trip
  green)
- [ ] `@hcengineering` bundled → consumer KHÔNG cần GitHub token (NFR-06 verify)
- [ ] rolldown bundle smoke (R3 externals), nub install smoke (R4 build scripts)
- [ ] Version bump semver (1.0.0 stable) + CHANGELOG
- [ ] e2e self-host smoke (T-36) pass

> Audit FAIL → KHÔNG publish.

## B. Deployment Strategy

| Strategy | Chosen? | Lý do |
|---|---|---|
| Recreate | | N/A (không server) |
| Rolling | | N/A |
| Blue-Green | | N/A |
| Canary | ✅ (npm pre-release) | `1.0.0-beta`/`-rc` tag → early user test → stable `1.0.0` |
| Shadow | | N/A |

**Chosen: npm publish + semver + pre-release canary**. Trace D1 (native
package).

- Dev: `0.x` tags (unstable).
- Pre-release: `1.0.0-beta.1` → early adopters `pi install npm:pi-huly@beta`.
- Stable: `1.0.0` → `pi install npm:pi-huly` (latest).
- User update: `pi update npm:pi-huly` (opt-in, KHÔNG forced).

## C. Rollback Plan

| Trigger | Action | Owner | RTO |
|---|---|---|---|
| smoke fail (post-publish) | `npm dist-tag` latest → old version; hoặc `npm unpublish` (<72h) | maintainer | <1h |
| error spike (user reports) | `npm dist-tag` rollback + investigate | maintainer | <4h |
| data corruption (N/A) | pi-huly KHÔNG owns data → Huly side | — | — |
| breaking bug | patch `1.0.1` fix-forward (KHÔNG revert user data) | maintainer | <24h |

> User-side rollback: pin `npm:pi-huly@<old>` trong settings.json (pi supports
> versioned specs, skipped by `pi update`). KHÔNG migration (config forward-
> compat via `version` field, 05 §6).

## D. Post-Deploy Prod Verification

- [ ] Fresh env: `pi install npm:pi-huly@1.0.0` clean (no GitHub token needed)
- [ ] `/huly init` → bind cwd → status "connected as X"
- [ ] Smoke ~10 critical tools trên self-host thật (create_issue, list_issues,
  get_issue, create_document, edit_document round-trip, create_milestone,
  set_issue_milestone, add_comment, fulltext_search)
- [ ] Transport both: ws + rest (config.json toggle) verify
- [ ] Auth both: token + email/password verify
- [ ] Markup round-trip (native ref link) verify
- [ ] Subagent dispatch (R7) verify single connection
- [ ] Bundle size reasonable (no @hcengineering leak — R3)

## E. Tag + Release Notes

```bash
git tag -a v1.0.0 -m "pi-huly v1.0.0: native Huly support cho pi-coding-agent"
git push origin v1.0.0
npm publish --access public
```

Release notes = human summary (KHÔNG copy toàn changelog): "Native Huly tools
(~102, full CRUD/19 domain), huly-docs+huly-tasks skills, multi-workspace
credentials, ws|rest transport, unified /huly command, pi-subagents compatible.
Self-host Huly only. Node 24, TS 7, oxc toolchain."

## F. Post-Release Monitoring

| Window | Action |
|---|---|
| 0-1h | watch npm install success rate, GitHub issue reports |
| 1-24h | watch user reports (errors, markup round-trip, transport); respond |
| 1-7d | postmortem nếu incident; update Risk Register (R mới); patch 1.0.1 nếu cần |
| 7d+ | close milestone M5; retro; plan next minor (skip-toolset expansions?) |

## G. Skill HOÀN THÀNH criteria

Pre-release audit pass + npm publish chạy + post-deploy verify pass + tag v1.0.0
created + monitoring started + audit clean → **pi-huly v1.0.0 released**. (Thực
thi ở phase implement T-36..T-39.)

## Trace

| Section | Requirement/ADR/Task |
|---|---|
| A pre-release | NFR-07, R1-R8, T-36, T-37 |
| B strategy | D1, FR-01, NFR-06 |
| C rollback | NFR-09 (forward-compat config) |
| D verify | FR-01..18, D3 (transport), D8 (auth union) |
| E tag | T-38, T-39 |
| F monitor | NFR-08 |

---

_Exit criteria Bước 10: deployment strategy chốt (npm canary) + tested ✓;
rollback plan có step + smoke ✓; pre-release audit pass (gate) ✓; tag v1.0.0 +
release created ✓; post-deploy prod verify pass ✓; post-release monitoring
started ✓._
