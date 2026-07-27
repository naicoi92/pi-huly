import { describe, expect, it } from "vitest";

import {
  buildBrowseUrl,
  markupToMdWithRefs,
  mdToMarkupWithRefs,
  parseBrowseUrl,
  roundTripWithRefs,
} from "../native-ref.js";
import { mdToMarkup } from "../markup.js";

const REF_URL = "https://huly.io/browse";

describe("buildBrowseUrl", () => {
  it("builds URL với ? separator khi refUrl KHÔNG có ?", () => {
    const url = buildBrowseUrl(REF_URL, {
      _class: "tracker:class:Issue",
      _id: "abc123",
      label: "ISSUE-1",
    });
    expect(url).toContain(`${REF_URL}?`);
    expect(url).toContain("_class=tracker%3Aclass%3AIssue");
    expect(url).toContain("_id=abc123");
    expect(url).toContain("label=ISSUE-1");
  });

  it("builds URL với & separator khi refUrl có ?", () => {
    const url = buildBrowseUrl(`${REF_URL}?workspace=foo`, {
      _class: "tracker:class:Issue",
      _id: "abc",
      label: "L",
    });
    expect(url).toContain("&_class=");
  });
});

describe("parseBrowseUrl", () => {
  it("parses valid browse-URL", () => {
    const url = buildBrowseUrl(REF_URL, {
      _class: "tracker:class:Issue",
      _id: "abc123",
      label: "ISSUE-1",
    });
    const parsed = parseBrowseUrl(url, REF_URL);
    expect(parsed).toEqual({
      _class: "tracker:class:Issue",
      _id: "abc123",
      label: "ISSUE-1",
    });
  });

  it("returns undefined cho non-browse URL", () => {
    const parsed = parseBrowseUrl("https://other.com/path", REF_URL);
    expect(parsed).toBeUndefined();
  });

  it("returns undefined khi thiếu params", () => {
    const parsed = parseBrowseUrl(`${REF_URL}?_class=foo`, REF_URL);
    expect(parsed).toBeUndefined();
  });

  it("returns undefined cho malformed URL", () => {
    const parsed = parseBrowseUrl("not-a-url", REF_URL);
    expect(parsed).toBeUndefined();
  });
});

describe("mdToMarkupWithRefs — native-ref transform", () => {
  it("converts browse-URL link → reference node", () => {
    const browseUrl = buildBrowseUrl(REF_URL, {
      _class: "tracker:class:Issue",
      _id: "issue-1",
      label: "ISSUE-1",
    });
    const md = `[ISSUE-1](${browseUrl})`;
    const markup = mdToMarkupWithRefs(md, REF_URL);
    expect(markup).toBeDefined();
    // Verify markup structure contains reference node (type=reference)
    const markupStr = JSON.stringify(markup);
    expect(markupStr).toContain("reference");
  });

  it("KHÔNG convert external link (KHÔNG startsWith refUrl)", () => {
    const md = "[example](https://example.com)";
    const markup = mdToMarkupWithRefs(md, REF_URL);
    const markupStr = JSON.stringify(markup);
    expect(markupStr).not.toContain("tracker:class:Issue");
  });
});

describe("markupToMdWithRefs — reference → browse-URL", () => {
  it("converts reference node → md link", () => {
    const browseUrl = buildBrowseUrl(REF_URL, {
      _class: "tracker:class:Issue",
      _id: "issue-1",
      label: "ISSUE-1",
    });
    const md = `[ISSUE-1](${browseUrl})`;
    const markup = mdToMarkupWithRefs(md, REF_URL);
    const result = markupToMdWithRefs(markup, REF_URL);
    expect(result).toContain("ISSUE-1");
    expect(result).toContain(REF_URL);
  });
});

describe("roundTripWithRefs — R8 fidelity", () => {
  it("round-trips native-ref link", () => {
    const browseUrl = buildBrowseUrl(REF_URL, {
      _class: "tracker:class:Issue",
      _id: "issue-1",
      label: "ISSUE-1",
    });
    const md = `[ISSUE-1](${browseUrl})`;
    const result = roundTripWithRefs(md, REF_URL);
    expect(result).toContain("ISSUE-1");
    // Round-trip should preserve refUrl + params (order may vary)
    expect(result).toContain(REF_URL);
    expect(result).toContain("_id=issue-1");
  });

  it("round-trips plain text (no native refs)", () => {
    const result = roundTripWithRefs("Hello world", REF_URL);
    expect(result.toLowerCase()).toContain("hello");
  });

  it("round-trips mixed content (text + native-ref + external link)", () => {
    const browseUrl = buildBrowseUrl(REF_URL, {
      _class: "tracker:class:Issue",
      _id: "i1",
      label: "ISSUE-1",
    });
    const md = `See [ISSUE-1](${browseUrl}) and [docs](https://docs.example.com).`;
    const result = roundTripWithRefs(md, REF_URL);
    expect(result).toContain("ISSUE-1");
    expect(result).toContain("docs");
  });
});

describe("R8 fixture matrix — markdown edge cases", () => {
  const fixtures = [
    { name: "headings", md: "# H1\n## H2\n### H3" },
    { name: "ordered list", md: "1. first\n2. second\n3. third" },
    { name: "unordered list", md: "- alpha\n- beta\n- gamma" },
    { name: "nested list", md: "- top\n  - nested\n- back" },
    { name: "code block js", md: "```js\nconst x = () => 42\n```" },
    { name: "inline code", md: "Use `npm install` to setup" },
    { name: "blockquote", md: "> quoted text\n> more" },
    { name: "bold italic", md: "**bold** *italic* ***both***" },
    { name: "external link", md: "[example](https://example.com)" },
    { name: "image", md: "![alt](https://img.example.com/x.png)" },
    { name: "horizontal rule", md: "a\n\n---\n\nb" },
    { name: "paragraphs", md: "para 1\n\npara 2\n\npara 3" },
  ];

  for (const { name, md } of fixtures) {
    it(`round-trips fixture: ${name}`, () => {
      const markup = mdToMarkup(md);
      expect(markup).toBeDefined();
      // Should not throw on round-trip
      const result = roundTripWithRefs(md, REF_URL);
      expect(typeof result).toBe("string");
    });
  }

  it("native-ref fixtures round-trip với refUrl", () => {
    const refs = [
      { _class: "tracker:class:Issue", _id: "issue-1", label: "ISSUE-1" },
      { _class: "tracker:class:Document", _id: "doc-2", label: "DOC-2" },
      { _class: "contact:class:Person", _id: "person-3", label: "John Doe" },
    ];
    for (const ref of refs) {
      const url = buildBrowseUrl(REF_URL, ref);
      const md = `[${ref.label}](${url})`;
      const result = roundTripWithRefs(md, REF_URL);
      expect(result).toContain(ref.label);
      expect(result).toContain(ref._id);
    }
  });
});
