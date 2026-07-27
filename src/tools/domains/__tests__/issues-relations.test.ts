// Test T-52 #42 cho issues-relations domain — FK ref validate.
// Cover: add_issue_relation targetIssue validate (resolve identifier),
// link_document_to_issue message tách (issue vs document),
// unlink_document_to_issue (skip validate per spec §Phương án 3 idempotent).

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

import { getClient } from "../../../client/pool.js";
import { tools } from "../issues-relations.js";

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
    createDoc: vi.fn().mockResolvedValue("rel-id-1"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-52 #42: add_issue_relation targetIssue validate", () => {
  it("targetIssue KHÔNG tồn tại → isError + addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    // findOne: issue (1, found), target (2, not found)
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce(undefined); // target not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-999", relationType: "blocks" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/target.*not found/i);
    expect(client.addCollection).not.toHaveBeenCalled();
  });

  it("targetIssue tồn tại → addCollection với _id resolved (KHÔNG raw idRef)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" }); // target
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "blocks" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.addCollection).toHaveBeenCalledTimes(1);
    const call = client.addCollection.mock.calls[0];
    // attribute targetIssue = target._id (resolved), KHÔNG raw idRef("PD-2")
    const attr = call?.[5] as { targetIssue: string };
    expect(attr.targetIssue).toBe("i2");
    expect(attr.targetIssue).not.toBe("PD-2");
  });

  it("cross-project targetIssue (FOO-123) → query trực tiếp (KHÔNG resolveIdentifier throw)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "f1", identifier: "FOO-123", space: "sp-foo" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "FOO-123", relationType: "relates-to" },
      undefined,
      undefined,
      ctx,
    );

    // KHÔNG throw cross-project (resolveIdentifier bypassed)
    expect(result.isError).toBeUndefined();
    // findOne lần 2 query by identifier trực tiếp (cross-project OK)
    const secondCall = client.findOne.mock.calls[1];
    expect(secondCall?.[1]).toMatchObject({ identifier: "FOO-123" });
  });
});

describe("T-52 #42: link_document_to_issue message tách (issue vs document)", () => {
  it("issue KHÔNG tồn tại → isError message 'Issue ... not found' (KHÔNG gộp)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined); // issue not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_link_document_to_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", document: "doc-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/issue.*not found/i);
    expect(text).not.toMatch(/or document/i); // KHÔNG gộp message cũ
  });

  it("issue OK + document KHÔNG tồn tại → isError message 'Document ... not found'", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" }) // issue
      .mockResolvedValueOnce(undefined); // document not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_link_document_to_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", document: "doc-missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/document.*not found/i);
  });

  it("issue + document tồn tại → $push documents với idRef(document)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", documents: [] })
      .mockResolvedValueOnce({ _id: "doc-1", title: "Spec" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_link_document_to_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", document: "doc-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const call = client.updateDoc.mock.calls[0];
    const ops = call?.[3] as { $push: { documents: string } };
    expect(ops.$push.documents).toBe("doc-1");
  });

  it("document đã link (idempotent) → no-op, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        documents: ["doc-1"], // đã link
      })
      .mockResolvedValueOnce({ _id: "doc-1", title: "Spec" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_link_document_to_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", document: "doc-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/already|no-op|idempotent/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});
