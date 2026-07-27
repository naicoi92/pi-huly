// Native-ref transform — browse-URL ↔ md link với _class/_id/_label query params.
// Design: 04-system.md §6 markup.ts, 01 §B.10 D10, 08 §A R8 risk.
//
// Evidence (T-08b): @hcengineering/text-markdown ĐÃ handle native-ref transform
// qua `refUrl` option trong MarkdownOptions:
//   - Parser: href.startsWith(refUrl) → ReferenceMarkupNode {id, label, objectclass}
//   - Serializer: ReferenceMarkupNode → [label](refUrl?_class=&_id=&label=)
//
// T-08b wrap mdToMarkup/markupToMd với refUrl + expose transformBrowseUrl.
// KHÔNG reimplement parser (text-markdown proven, MIT-compatible EPL).

import type { MarkupNode } from "./markup.js";
import { markupToMd, mdToMarkup } from "./markup.js";

/**
 * Convert markdown → Huly markup với native-ref transform (browse-URL → reference).
 * Links bắt đầu bằng `refUrl` → ReferenceMarkupNode.
 *
 * @param md Markdown source
 * @param refUrl Browse-URL base (vd 'https://huly.io/browse') — links matching trở thành native refs
 */
export function mdToMarkupWithRefs(md: string, refUrl: string): MarkupNode {
  return mdToMarkup(md, { refUrl });
}

/**
 * Convert Huly markup → markdown với native-ref transform (reference → browse-URL).
 * ReferenceMarkupNode → [label](refUrl?_class=&_id=&label=).
 *
 * @param markup Huly markup node tree
 * @param refUrl Browse-URL base (must match parser refUrl cho round-trip fidelity)
 */
export function markupToMdWithRefs(markup: MarkupNode, refUrl: string): string {
  return markupToMd(markup, { refUrl });
}

/**
 * Round-trip markdown with native-ref transform.
 * R8 fidelity test: md → markup → md (lossless cho native refs).
 *
 * @param md Markdown source
 * @param refUrl Browse-URL base
 * @returns Round-tripped markdown
 */
export function roundTripWithRefs(md: string, refUrl: string): string {
  return markupToMdWithRefs(mdToMarkupWithRefs(md, refUrl), refUrl);
}

/**
 * Build browse-URL từ reference params (cho manual construct khi cần).
 */
export function buildBrowseUrl(
  refUrl: string,
  params: { _class: string; _id: string; label: string },
): string {
  const sep = refUrl.includes("?") ? "&" : "?";
  const query = new URLSearchParams({
    _class: params._class,
    _id: params._id,
    label: params.label,
  });
  return `${refUrl}${sep}${query.toString()}`;
}

/**
 * Parse browse-URL → reference params (cho manual inspect).
 * Returns undefined nếu url không phải browse-URL hợp lệ.
 */
export function parseBrowseUrl(
  url: string,
  refUrl: string,
): { _class: string; _id: string; label: string } | undefined {
  if (!url.startsWith(refUrl)) return undefined;
  try {
    const parsed = new URL(url);
    const _class = parsed.searchParams.get("_class");
    const _id = parsed.searchParams.get("_id");
    const label = parsed.searchParams.get("label");
    if (!_class || !_id || !label) return undefined;
    return { _class, _id, label };
  } catch {
    return undefined;
  }
}
