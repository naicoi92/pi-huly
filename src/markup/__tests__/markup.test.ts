import { describe, expect, it } from "vitest";

import { markupToMd, mdToMarkup, roundTripMd } from "../markup.js";

describe("mdToMarkup", () => {
  it("converts simple text to markup node", () => {
    const markup = mdToMarkup("Hello world");
    expect(markup).toBeDefined();
    expect(markup.type).toBeDefined();
  });

  it("converts heading", () => {
    const markup = mdToMarkup("# Heading 1");
    expect(markup).toBeDefined();
  });

  it("converts bold text", () => {
    const markup = mdToMarkup("**bold text**");
    expect(markup).toBeDefined();
  });

  it("converts list", () => {
    const markup = mdToMarkup("- item 1\n- item 2");
    expect(markup).toBeDefined();
  });

  it("converts code block", () => {
    const markup = mdToMarkup("```js\nconst x = 1\n```");
    expect(markup).toBeDefined();
  });

  it("handles empty string", () => {
    const markup = mdToMarkup("");
    expect(markup).toBeDefined();
  });

  it("passes options through", () => {
    const markup = mdToMarkup("text", { refUrl: "https://huly.io" });
    expect(markup).toBeDefined();
  });
});

describe("markupToMd", () => {
  it("converts simple markup back to markdown", () => {
    const markup = mdToMarkup("Hello world");
    const md = markupToMd(markup);
    expect(typeof md).toBe("string");
    expect(md.toLowerCase()).toContain("hello");
  });

  it("round-trips heading", () => {
    const markup = mdToMarkup("# Title");
    const md = markupToMd(markup);
    expect(md).toContain("Title");
  });
});

describe("roundTripMd", () => {
  it("preserves plain text content", () => {
    const result = roundTripMd("Hello world");
    expect(result.toLowerCase()).toContain("hello");
    expect(result.toLowerCase()).toContain("world");
  });

  it("preserves heading content", () => {
    const result = roundTripMd("# My Heading");
    expect(result).toContain("My Heading");
  });

  it("preserves list items", () => {
    const result = roundTripMd("- alpha\n- beta");
    expect(result).toContain("alpha");
    expect(result).toContain("beta");
  });

  it("preserves code block content", () => {
    const result = roundTripMd("```\nconst x = 42\n```");
    expect(result).toContain("42");
  });

  it("preserves bold content", () => {
    const result = roundTripMd("**important**");
    expect(result).toContain("important");
  });
});

describe("integration: markdown fixtures", () => {
  const fixtures = [
    "plain text",
    "# Heading",
    "## Subheading",
    "**bold** and *italic*",
    "- list item 1\n- list item 2\n- list item 3",
    "1. ordered\n2. list",
    "> blockquote",
    "[link text](https://example.com)",
    "`inline code`",
    '```js\nfunction hello() { return "world" }\n```',
    "| col1 | col2 |\n| --- | --- |\n| a | b |",
    "paragraph one\n\nparagraph two",
  ];

  for (const md of fixtures) {
    it(`round-trips: "${md.slice(0, 30)}${md.length > 30 ? "..." : ""}"`, () => {
      const markup = mdToMarkup(md);
      expect(markup).toBeDefined();
      // Round-trip should not throw
      const result = markupToMd(markup);
      expect(typeof result).toBe("string");
    });
  }
});
