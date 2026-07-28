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

// T-61 fix: storage pattern KHỚP Huly thật (RelationsPopup.svelte + updateIssueRelation
// + relations.spec.ts). Mapping đúng:
//   - blocks         → target.blockedBy push source   (A blocks B → B.blockedBy.push(A))
//   - is-blocked-by  → source.blockedBy push target   (A blocked-by B → A.blockedBy.push(B))
//   - relates-to     → BIDIRECTIONAL A.relations.push(B) + B.relations.push(A)
// T-59 #63 refactor trước đây ĐẢO ngược blocks/is-blocked-by + thiếu chiều relates-to.
describe("T-61: add_issue_relation — khớp Huly UI RelationsPopup", () => {
  it("blocks → $push target.blockedBy[] { _id: source } (A blocks B → B.blockedBy.push(A))", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1", blockedBy: [] });
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
    // T-61: push lên TARGET (i2).blockedBy, KHÔNG phải source (i1).relations
    expect(call[2]).toBe("i2");
    expect(call[3]).toMatchObject({
      $push: { blockedBy: { _id: "i1", _class: "tracker:class:Issue" } },
    });
  });

  it("is-blocked-by → $push source.blockedBy[] { _id: target } (A blocked-by B → A.blockedBy.push(B))", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", blockedBy: [] })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" });
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
    // T-61: push trên SOURCE (i1).blockedBy, KHÔNG phải target (i2).blockedBy
    expect(call[2]).toBe("i1");
    expect(call[3]).toMatchObject({
      $push: { blockedBy: { _id: "i2", _class: "tracker:class:Issue" } },
    });
  });

  it("relates-to → BIDIRECTIONAL: $push cả A.relations + B.relations (2 updateDoc)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", relations: [] })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1", relations: [] });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "relates-to" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // T-61: 2 updateDoc — forward (A.relations.push(B)) + reverse (B.relations.push(A))
    expect(client.updateDoc).toHaveBeenCalledTimes(2);
    const forwardCall = client.updateDoc.mock.calls[0]!;
    const reverseCall = client.updateDoc.mock.calls[1]!;
    expect(forwardCall[2]).toBe("i1");
    expect(forwardCall[3]).toMatchObject({
      $push: { relations: { _id: "i2", _class: "tracker:class:Issue" } },
    });
    expect(reverseCall[2]).toBe("i2");
    expect(reverseCall[3]).toMatchObject({
      $push: { relations: { _id: "i1", _class: "tracker:class:Issue" } },
    });
  });

  it("blocks đã tồn tại (target.blockedBy có source) → idempotent, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({
        _id: "i2",
        identifier: "PD-2",
        space: "sp1",
        blockedBy: [{ _id: "i1", _class: "tracker:class:Issue" }], // đã có
      });
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

  it("relates-to đã tồn tại cả 2 chiều → idempotent, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        relations: [{ _id: "i2", _class: "tracker:class:Issue" }],
      })
      .mockResolvedValueOnce({
        _id: "i2",
        identifier: "PD-2",
        space: "sp1",
        relations: [{ _id: "i1", _class: "tracker:class:Issue" }],
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "relates-to" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-61: remove_issue_relation — đối xứng add", () => {
  it("blocks → $pull target.blockedBy[] { _id: source } (A blocks B → pull A khỏi B.blockedBy)", async () => {
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
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "blocks" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    expect(result.isError).toBeUndefined();
    expect(client.removeDoc).not.toHaveBeenCalled();
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const call = client.updateDoc.mock.calls[0]!;
    // T-61: pull trên TARGET (i2).blockedBy
    expect(call[2]).toBe("i2");
    expect(call[3]).toMatchObject({ $pull: { blockedBy: { _id: "i1" } } });
  });

  it("is-blocked-by → $pull source.blockedBy[] { _id: target } (A blocked-by B → pull B khỏi A.blockedBy)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        blockedBy: [{ _id: "i2", _class: "tracker:class:Issue" }],
      })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_remove_issue_relation");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "is-blocked-by" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const call = client.updateDoc.mock.calls[0]!;
    // T-61: pull trên SOURCE (i1).blockedBy
    expect(call[2]).toBe("i1");
    expect(call[3]).toMatchObject({ $pull: { blockedBy: { _id: "i2" } } });
  });

  it("relates-to → $pull cả 2 chiều A.relations + B.relations", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        relations: [{ _id: "i2", _class: "tracker:class:Issue" }],
      })
      .mockResolvedValueOnce({
        _id: "i2",
        identifier: "PD-2",
        space: "sp1",
        relations: [{ _id: "i1", _class: "tracker:class:Issue" }],
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_remove_issue_relation");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", targetIssue: "PD-2", relationType: "relates-to" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    expect(client.updateDoc).toHaveBeenCalledTimes(2);
    const forwardCall = client.updateDoc.mock.calls[0]!;
    const reverseCall = client.updateDoc.mock.calls[1]!;
    expect(forwardCall[2]).toBe("i1");
    expect(forwardCall[3]).toMatchObject({ $pull: { relations: { _id: "i2" } } });
    expect(reverseCall[2]).toBe("i2");
    expect(reverseCall[3]).toMatchObject({ $pull: { relations: { _id: "i1" } } });
  });

  it("relation KHÔNG tồn tại → no-op idempotent (KHÔNG throw, KHÔNG updateDoc)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "i2", identifier: "PD-2", space: "sp1", blockedBy: [] });
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
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-61: list_issue_relations — 3 hướng rõ ràng + reverse query cho blocks", () => {
  it("blocks = reverse query findAll { 'blockedBy._id': issue._id }", async () => {
    // Kịch bản thực: PD-19 blocks PD-22 → data lưu ở PD-22.blockedBy = [PD-19]
    // list_issue_relations(PD-19) phải tìm thấy PD-22 qua reverse query.
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i19",
      space: "sp1",
      identifier: "PD-19",
    });
    // findAll trả về các issues có blockedBy._id === "i19" → PD-22 (i22)
    client.findAll = vi
      .fn()
      .mockResolvedValue([{ _id: "i22", _class: "tracker:class:Issue", identifier: "PD-22" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    const result = await tool.execute("tc1", { identifier: "PD-19" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    // T-61: gọi findAll với reverse query 'blockedBy._id' === issue._id
    expect(client.findAll).toHaveBeenCalledWith("tracker:class:Issue", {
      "blockedBy._id": "i19",
    });
    const details = result.details as {
      count: number;
      relations: Array<{ direction: string; targetIssueId: string }>;
    };
    expect(details.count).toBe(1);
    expect(details.relations).toHaveLength(1);
    expect(details.relations[0]).toMatchObject({
      direction: "blocks",
      targetIssueId: "i22",
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1 blocks");
  });

  it("is-blocked-by đọc issue.blockedBy trực tiếp (KHÔNG findAll cho hướng này)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      blockedBy: [{ _id: "i4", _class: "tracker:class:Issue" }],
    });
    client.findAll = vi.fn().mockResolvedValue([]); // blocks rỗng
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const details = result.details as {
      count: number;
      relations: Array<{ direction: string }>;
    };
    expect(details.count).toBe(1);
    const blockedByRels = details.relations.filter((r) => r.direction === "is-blocked-by");
    expect(blockedByRels).toHaveLength(1);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1 is-blocked-by");
  });

  it("relates-to đọc issue.relations trực tiếp (bidirectional)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      relations: [
        { _id: "i2", _class: "tracker:class:Issue" },
        { _id: "i3", _class: "tracker:class:Issue" },
      ],
    });
    client.findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const details = result.details as {
      relations: Array<{ direction: string }>;
    };
    const relatesTo = details.relations.filter((r) => r.direction === "relates-to");
    expect(relatesTo).toHaveLength(2);
  });

  it("3 hướng cùng tồn tại → count tổng + message đúng format", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      blockedBy: [{ _id: "i4", _class: "tracker:class:Issue" }], // 1 is-blocked-by
      relations: [{ _id: "i2", _class: "tracker:class:Issue" }], // 1 relates-to
    });
    client.findAll = vi.fn().mockResolvedValue([
      { _id: "i5", _class: "tracker:class:Issue" }, // 1 blocks (reverse)
    ]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ count: 3 });
    const text = result.content[0]?.text ?? "";
    // Format: "3 relation(s) on PD-1 (1 blocks, 1 is-blocked-by, 1 relates-to)"
    expect(text).toContain("3 relation");
    expect(text).toMatch(/1 blocks.*1 is-blocked-by.*1 relates-to/);
  });

  it("issue KHÔNG có relations + findAll rỗng → count 0", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
    });
    client.findAll = vi.fn().mockResolvedValue([]);
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
