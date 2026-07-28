// T-70: comments domain — field `message` (inline Markup), KHÔNG `body`.
// reality-checker CONFIRMED: trusted comments.ts:150 `message: markdownToMarkupString(body)`.
// ChatMessage.message = inline Markup = JSON.stringify(mdToMarkup(md)). KHÔNG MarkupBlobRef.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../../config/resolver.js", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
  resolveProject: vi.fn().mockResolvedValue("PD"),
  NeedsInitError: class extends Error {},
  NeedsDisambiguationError: class extends Error {},
}));
vi.mock("../../../client/errors.js", () => ({
  HulyError: class extends Error {
    readonly class: string;
    constructor(c: string, m: string) {
      super(m);
      this.class = c;
    }
  },
  mapError: vi.fn((e: unknown) => ({ class: "Internal", message: String(e) })),
  sanitize: vi.fn((s: string) => s),
  LEAK_PATTERNS: [],
}));
vi.mock("../../../markup/markup.js", () => ({
  mdToMarkup: vi.fn((s: string) => ({ type: "text", text: s })),
  markupToMd: vi.fn((m: unknown) => `md(${JSON.stringify(m).slice(0, 20)})`),
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../comments.js";
import { CHAT_MESSAGE_CLASS, ISSUE_CLASS } from "../_class-refs.js";
import { mdToMarkup } from "../../../markup/markup.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    addCollection: vi.fn().mockResolvedValue("comment-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-70: add_comment dùng field `message` (inline Markup)", () => {
  it("add_comment → addCollection với attributes.message = JSON.stringify(mdToMarkup(body))", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "i1", space: "sp1", identifier: "PD-1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_comment");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", body: "hello world" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(mdToMarkup).toHaveBeenCalledWith("hello world");
    const call = client.addCollection.mock.calls[0];
    expect(call?.[0]).toBe(CHAT_MESSAGE_CLASS);
    expect(call?.[3]).toBe(ISSUE_CLASS); // attachedToClass
    expect(call?.[4]).toBe("comments"); // collection
    const attrs = call?.[5] as Record<string, unknown>;
    // message = JSON.stringify(mdToMarkup(body)) — KHÔNG body
    expect(attrs.message).toBe(JSON.stringify({ type: "text", text: "hello world" }));
    expect(attrs.body).toBeUndefined();
  });

  it("issue not found → isError + addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_comment");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-999", body: "x" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.addCollection).not.toHaveBeenCalled();
  });
});

describe("T-70: update_comment dùng field `message` + editedOn", () => {
  it("update_comment → updateDoc với message + editedOn", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "c1",
      space: "sp1",
      _class: CHAT_MESSAGE_CLASS,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_comment");
    const result = await tool.execute(
      "tc1",
      { comment: "c1", body: "updated" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.message).toBe(JSON.stringify({ type: "text", text: "updated" }));
    expect(ops.body).toBeUndefined();
    expect(ops.editedOn).toEqual(expect.any(Number));
  });

  it("comment not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_comment");
    const result = await tool.execute(
      "tc1",
      { comment: "x", body: "y" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-70: list_comments filter attachedToClass + read field `message`", () => {
  it("list_comments → findAll với attachedTo + attachedToClass: ISSUE_CLASS", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "i1", space: "sp1", identifier: "PD-1" });
    client.findAll = vi.fn().mockResolvedValue([
      {
        _id: "c1",
        message: JSON.stringify({ type: "text", text: "hi" }),
        createdOn: 1000,
        modifiedBy: "u1",
      },
    ]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_comments");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const query = client.findAll.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(query.attachedTo).toBe("i1");
    expect(query.attachedToClass).toBe(ISSUE_CLASS); // T-70: thêm filter
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1 comment");
  });

  it("list read field `message` (KHÔNG body)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "i1", space: "sp1", identifier: "PD-1" });
    client.findAll = vi
      .fn()
      .mockResolvedValue([{ _id: "c1", message: JSON.stringify({ type: "text", text: "hi" }) }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_comments");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    const comments = (result.details as { comments: Array<Record<string, unknown>> }).comments;
    expect(comments[0]?.message).toBeDefined();
    expect(comments[0]?.body).toBeUndefined();
  });

  it("issue not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_comments");
    const result = await tool.execute("tc1", { identifier: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.findAll).not.toHaveBeenCalled();
  });
});
