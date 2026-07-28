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

// ctx cho destructive tool (remove_issue_relation) — hasUI=true + confirm=yes
// để bypass auto-deny gate (confirm.ts auto-deny khi hasUI !== true).
const ctxConfirmed = {
  hasUI: true,
  cwd: "/proj",
  ui: { confirm: vi.fn().mockResolvedValue(true) },
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
  it("targetIssue KHÔNG tồn tại → isError + updateDoc KHÔNG gọi", async () => {
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
    expect(client.updateDoc).not.toHaveBeenCalled();
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

// T-59 #63: Issue relations inline refactor — $push/$pull trên Issue.relations
// (blocks/relates-to) + Issue.blockedBy (is-blocked-by reverse direction).
// TS_RELATION_CLASS KHÔNG tồn tại runtime → xóa addCollection, dùng updateDoc.
describe("T-59 #63: add_issue_relation inline $push (KHÔNG addCollection)", () => {
  it("blocks → $push Issue.relations[] với RelatedDocument {_id, _class}", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", relations: [] })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" });
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
    expect(client.addCollection).not.toHaveBeenCalled(); // KHÔNG addCollection (dead class)
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const call = client.updateDoc.mock.calls[0]!;
    // $push trên ISSUE_CLASS, issue.space, issue._id
    expect(call[3]).toMatchObject({
      $push: {
        relations: { _id: "i2", _class: "tracker:class:Issue" },
      },
    });
    // Push trên source issue (i1), KHÔNG phải target
    expect(call[2]).toBe("i1");
  });

  it("relates-to → cũng $push Issue.relations[] (KHÔNG phân biệt blocks — Huly data model)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", relations: [] })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_relation");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "relates-to" },
      undefined,
      undefined,
      ctx,
    );

    const call = client.updateDoc.mock.calls[0]!;
    // relates-to cũng push vào relations[] (giống blocks — Huly không phân biệt)
    expect(call[3]).toMatchObject({ $push: { relations: { _id: "i2" } } });
  });

  it("is-blocked-by → $push target.blockedBy[] (REVERSE direction — push lên đích)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1", blockedBy: [] });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "is-blocked-by" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const call = client.updateDoc.mock.calls[0]!;
    // Push lên TARGET (i2), KHÔNG source (i1)
    expect(call[2]).toBe("i2");
    expect(call[3]).toMatchObject({
      $push: {
        blockedBy: { _id: "i1", _class: "tracker:class:Issue" },
      },
    });
  });

  it("relation đã tồn tại (idempotent) → no-op, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        relations: [{ _id: "i2", _class: "tracker:class:Issue" }], // đã có
      })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" });
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
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/already exists|no-op|idempotent/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-59 #63: remove_issue_relation inline $pull", () => {
  it("blocks → $pull Issue.relations[] theo { _id: target }", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        relations: [{ _id: "i2", _class: "tracker:class:Issue" }],
      })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_remove_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "blocks" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    expect(result.isError).toBeUndefined();
    expect(client.removeDoc).not.toHaveBeenCalled(); // KHÔNG removeDoc (dead class)
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const call = client.updateDoc.mock.calls[0]!;
    expect(call[3]).toMatchObject({
      $pull: { relations: { _id: "i2", _class: "tracker:class:Issue" } },
    });
  });

  it("is-blocked-by → $pull target.blockedBy[] (REVERSE)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({
        _id: "i2",
        identifier: "PD-2",
        space: "sp1",
        blockedBy: [{ _id: "i1", _class: "tracker:class:Issue" }],
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_remove_issue_relation");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "is-blocked-by" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    const call = client.updateDoc.mock.calls[0]!;
    // Pull trên TARGET (i2).blockedBy
    expect(call[2]).toBe("i2");
    expect(call[3]).toMatchObject({ $pull: { blockedBy: { _id: "i1" } } });
  });

  it("relation KHÔNG tồn tại → no-op idempotent (KHÔNG throw)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", relations: [] })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_remove_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "blocks" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/did not exist|no-op|idempotent/i);
    // code-review M2: updateDoc KHÔNG gọi khi relation không tồn tại (early-return)
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-59 #63: list_issue_relations read inline (KHÔNG findAll)", () => {
  it("read Issue.relations + blockedBy trực tiếp — KHÔNG findAll TS_RELATION_CLASS", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      relations: [
        { _id: "i2", _class: "tracker:class:Issue" },
        { _id: "i3", _class: "tracker:class:Issue" },
      ],
      blockedBy: [{ _id: "i4", _class: "tracker:class:Issue" }],
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.findAll).not.toHaveBeenCalled(); // KHÔNG findAll (dead class)
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("3 relation"); // 2 relations + 1 blocked-by
    expect(result.details).toMatchObject({ count: 3 });
    const details = result.details as { relations: Array<{ direction: string }> };
    expect(details.relations).toHaveLength(3);
    // 2 forward + 1 reverse
    const forward = details.relations.filter((r) => r.direction === "blocks-or-relates-to");
    const reverse = details.relations.filter((r) => r.direction === "is-blocked-by");
    expect(forward).toHaveLength(2);
    expect(reverse).toHaveLength(1);
  });

  it("issue KHÔNG có relations → count 0", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ count: 0 });
  });
});

// T-60 #55 #64: link/unlink_document_to_issue honest-unavailable — DOCUMENT_CLASS
// interface orphan (KHÔNG register runtime). Cùng verdict T-60 search domain.
describe("T-60: link/unlink_document_to_issue honest-unavailable (Document orphan)", () => {
  it("link_document_to_issue → isError + KHÔNG gọi findOne/updateDoc", async () => {
    const client = makeClient();
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
    expect(client.findOne).not.toHaveBeenCalled();
    expect(client.updateDoc).not.toHaveBeenCalled();
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/KHÔNG khả dụng|interface orphan/i);
    expect(text).toContain("tracker:class:Document");
  });

  it("unlink_document_to_issue → isError + KHÔNG gọi findOne/updateDoc", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_unlink_document_to_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", document: "doc-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      reason: "interface_orphan",
      useClass: "tracker:class:Document",
    });
  });
});
