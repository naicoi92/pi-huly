# NOTICE — pi-huly license attribution

> R1 license audit (T-37). Verified 2026-07-27 qua npm package.json metadata.
> Technical analysis, KHÔNG phải legal advice. Maintainer final review.

## pi-huly (MIT)

- **License**: [MIT](./LICENSE) © 2026 naicoi92
- **Source**: <https://github.com/naicoi92/pi-huly>

## Runtime dependencies (EPL-2.0, npm public)

pi-huly declare `@hcengineering/*` là `dependencies` trong `package.json`.
Consumer `pi install npm:pi-huly` → npm auto-install `@hcengineering/*` từ
npmjs.org (publishConfig access public, verified T-37) → KHÔNG cần GitHub
Packages token (NFR-06). `dist/index.mjs` KHÔNG bundle @hcengineering — code
`import` từ `node_modules/@hcengineering/*` runtime (rolldown external).

| Package | Version | License | npm |
|---|---|---|---|
| `@hcengineering/api-client` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/api-client> |
| `@hcengineering/core` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/core> |
| `@hcengineering/platform` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/platform> |
| `@hcengineering/text-core` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/text-core> |
| `@hcengineering/text-markdown` | ^0.7.423 | **EPL-2.0** | <https://www.npmjs.com/package/@hcengineering/text-markdown> |

### EPL-2.0 obligations

1. **Attribution** (§3.6): this NOTICE discloses EPL-2.0 dependencies.
2. **Source availability** (§3.6): consumer install `@hcengineering/*` từ npm
   (public, source included trong tarball npm). pi-huly KHÔNG vendor source.
3. **No additional restrictions** (§7): EPL-2.0 permit commercial use,
   modification, distribution với attribution + source availability.

### MIT compat EPL-2.0

- pi-huly (MIT) depends on @hcengineering (EPL-2.0) runtime. Dist bundle chỉ
  chứa code pi-huly (MIT). @hcengineering code ở node_modules riêng.
- EPL-2.0 copyleft KHÔNG lan sang pi-huly source (separate distribution).
- `LICENSE` (MIT) áp dụng cho pi-huly. `@hcengineering/*` subject EPL-2.0
  riêng (npm package license field).

### EPL-2.0 full text

<https://www.eclipse.org/legal/epl-2.0/>

## External dependencies (MIT, KHÔNG bundled)

| Package | License |
|---|---|
| `ws` | MIT (<https://www.npmjs.com/package/ws>) |
| `typebox` | MIT (<https://www.npmjs.com/package/typebox>) |
| `@earendil-works/pi-coding-agent` | MIT (<https://www.npmjs.com/package/@earendil-works/pi-coding-agent>) |
| `@earendil-works/pi-agent-core` | MIT |
| `@earendil-works/pi-ai` | MIT |
| `@earendil-works/pi-tui` | MIT |

DevDependencies (oxlint, oxfmt, rolldown, vitest, typescript, markdownlint-cli2,
@vitest/coverage-v8) đều MIT. KHÔNG ship trong tarball.

## R1 conclusion

**Accept**: bundle approach hợp lệ với attribution (this NOTICE) +
source-availability (npm packages public). KHÔNG block release. Maintainer
responsibility: final legal review trước publish.

## Reference

- Design `03-tech-stack.md` §4 (R1 risk assessment)
- Design `08-non-functional.md` §A (Dependency CVE + license)
- Design `10-release.md` §A (Pre-Release Audit R1)
