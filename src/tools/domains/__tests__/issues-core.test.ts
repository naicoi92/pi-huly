// Test T-40 bonus + T-41 + T-45 + T-47 cho issues-core domain (8 tools).
// Cover: create_issue identifier lookup sau createDoc (T-40 bonus #26),
// get_issue description ref resolution (T-41 #23 — khi T-44 xong),
// add_issue_label validation (T-45 #27 — khi T-44 xong),
// update_issue status persist + assignee leak (T-47 #36).

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
  mdToMarkup: vi.fn((s: string) => `markup(${s})`),
  markupToMd: vi.fn((s: unknown) => `md(${JSON.stringify(s).slice(0, 20)})`),
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../issues-core.js";
import { ISSUE_CLASS, PROJECT_CLASS, ISSUE_KIND_REF } from "../_class-refs.js";

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
    createDoc: vi.fn().mockResolvedValue("internal-id-abc"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn().mockResolvedValue("internal-id-abc"),
    fetchMarkup: vi.fn(),
    uploadMarkup: vi.fn().mockResolvedValue({ blob: "ref" }),
    updateMarkup: vi.fn().mockResolvedValue(undefined),
  };
}

// IssueStatus fixture cho T-47 status validation. Huly trả status dạng
// full ref (vd "tracker:status:Done"); IssueStatus.name = short ("Done").
const ISSUE_STATUSES = [
  { name: "Backlog", _id: "tracker:status:Backlog", category: "UnStarted" },
  { name: "Todo", _id: "tracker:status:Todo", category: "ToDo" },
  { name: "In Progress", _id: "tracker:status:InProgress", category: "Active" },
  { name: "Done", _id: "tracker:status:Done", category: "Won" },
];

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-67: create_issue $inc sequence + addCollection + local identifier (#75)", () => {
  it("create_issue → $inc sequence trên Project + addCollection + identifier format", async () => {
    const client = makeClient();
    // findOne: project lookup. updateDoc: $inc sequence → trả txResult với sequence.
    client.findOne = vi.fn().mockResolvedValue({
      _id: "proj-1",
      space: "sp1",
      identifier: "PD",
      sequence: 5,
    });
    client.updateDoc = vi.fn().mockResolvedValue({ object: { sequence: 6 } });
    client.addCollection = vi.fn().mockResolvedValue("issue-id-1");
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue");
    const result = await tool.execute(
      "tc1",
      { title: "Test", priority: "high" },
      undefined,
      undefined,
      ctx,
    );

    // T-67: createDoc KHÔNG gọi — addCollection thay (Issue = AttachedDoc)
    expect(client.createDoc).not.toHaveBeenCalled();
    expect(client.addCollection).toHaveBeenCalledTimes(1);
    // $inc sequence trên Project
    expect(client.updateDoc).toHaveBeenCalledWith(
      PROJECT_CLASS,
      "core:space:Space",
      "proj-1",
      { $inc: { sequence: 1 } },
      true,
    );
    // identifier computed locally = PD-6 (sequence từ txResult)
    expect(result.details).toMatchObject({
      identifier: "PD-6",
      number: 6,
      title: "Test",
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PD-6");
  });

  it("create_issue fallback sequence khi txResult thiếu object.sequence (dùng project.sequence+1)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "proj-1",
      identifier: "PD",
      sequence: 10,
    });
    // txResult không có object.sequence (một số transport)
    client.updateDoc = vi.fn().mockResolvedValue({});
    client.addCollection = vi.fn().mockResolvedValue("id");
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue");
    const result = await tool.execute("tc1", { title: "X" }, undefined, undefined, ctx);

    // fallback: project.sequence(10) + 1 = 11 → identifier PD-11
    expect(result.details).toMatchObject({ identifier: "PD-11", number: 11 });
  });

  it("create_issue addCollection gọi với NoParent + subIssues collection + kind", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "proj-1",
      identifier: "PD",
      sequence: 0,
    });
    client.updateDoc = vi.fn().mockResolvedValue({ object: { sequence: 1 } });
    client.addCollection = vi.fn().mockResolvedValue("id");
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue");
    await tool.execute("tc1", { title: "Y" }, undefined, undefined, ctx);

    const callArgs = client.addCollection.mock.calls[0];
    // attachedTo = "" (NoParent sentinel), collection = "subIssues"
    expect(callArgs?.[0]).toBe(ISSUE_CLASS); // _class
    expect(callArgs?.[1]).toBe("proj-1"); // space
    expect(callArgs?.[2]).toBe(""); // attachedTo = NoParent ""
    expect(callArgs?.[3]).toBe(ISSUE_CLASS); // attachedToClass
    expect(callArgs?.[4]).toBe("subIssues"); // collection
    const attrs = callArgs?.[5] as Record<string, unknown>;
    expect(attrs.kind).toBe(ISSUE_KIND_REF);
    expect(attrs.number).toBe(1);
    expect(attrs.identifier).toBe("PD-1");
    expect(attrs.parents).toEqual([]);
  });
});

// T-41: get_issue resolve description document ref → markdown content (#23)
describe("T-41: get_issue description ref → markdown (#23)", () => {
  it("description là MarkupBlobRef → fetchMarkup resolve markdown content", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
      title: "Test issue",
      description: "issue-1-description-1700000000000", // MarkupBlobRef string
      status: "InProgress",
      priority: "high",
    });
    client.fetchMarkup = vi.fn().mockResolvedValue("# Heading\n\nDescription content");
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_issue");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    // fetchMarkup được gọi đúng signature
    expect(client.fetchMarkup).toHaveBeenCalledWith(
      "tracker:class:Issue",
      "issue-1",
      "description",
      "issue-1-description-1700000000000",
      "markdown",
    );
    // details.description = markdown content (không phải ref string)
    expect(result.details).toMatchObject({
      description: "# Heading\n\nDescription content",
      identifier: "PD-1",
    });
    // Content text cho LLM chứa markdown, KHÔNG chứa ref vô nghĩa
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Description content");
    expect(text).not.toContain("issue-1-description-1700000000000");
  });

  it("description null → fetchMarkup KHÔNG gọi, description=undefined", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-2",
      space: "sp1",
      identifier: "PD-2",
      title: "No desc",
      description: null,
      status: "Todo",
    });
    client.fetchMarkup = vi.fn();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_issue");
    const result = await tool.execute("tc1", { identifier: "PD-2" }, undefined, undefined, ctx);

    expect(client.fetchMarkup).not.toHaveBeenCalled();
    expect((result.details as { description?: string }).description).toBeUndefined();
  });

  it("fetchMarkup fail (ref không tồn tại) → fallback descriptionRef, không crash", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-3",
      space: "sp1",
      identifier: "PD-3",
      title: "Broken ref",
      description: "stale-ref-123",
      status: "Todo",
    });
    client.fetchMarkup = vi.fn().mockRejectedValue(new Error("markup not found"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_issue");
    const result = await tool.execute("tc1", { identifier: "PD-3" }, undefined, undefined, ctx);

    // Fallback: description undefined + descriptionRef field rõ ràng cho LLM
    expect(result.isError).toBeUndefined(); // không crash, vẫn success
    const details = result.details as { description?: string; descriptionRef?: string };
    expect(details.description).toBeUndefined();
    expect(details.descriptionRef).toBe("stale-ref-123");
  });
});

// T-45: add_issue_label validate tồn tại + TagReference object shape (#27)
describe("T-45: add_issue_label validation + TagReference shape (#27)", () => {
  it("label KHÔNG tồn tại → isError + suggest create_tag trước (T-58 redirect)", async () => {
    const client = makeClient();
    // findOne: lần 1 = issue lookup, lần 2 = tag lookup (not found)
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", labels: [] }) // issue
      .mockResolvedValue(undefined); // tag not found (cả 2 lần lookup)
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_label");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", label: "nonexistent-label" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
    // T-58: redirect sang create_tag (Label deprecated — dùng TagElement)
    expect(text).toMatch(/create_tag/i);
    expect(text).not.toMatch(/create_label/i);
    // updateDoc KHÔNG gọi (validate failed)
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("label tồn tại → push TagReference object shape { tag, title, color }", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", labels: [] }) // issue
      .mockResolvedValueOnce({ _id: "label-1", title: "bug", color: 5 }); // label found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_label");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", label: "bug" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // updateDoc được gọi với $push object (KHÔNG phải raw string)
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const updateCall = client.updateDoc.mock.calls[0];
    const ops = updateCall?.[3];
    expect(ops).toMatchObject({
      $push: {
        labels: {
          tag: "label-1", // Ref<TagElement> — KHÔNG phải title string
          title: "bug",
          color: 5,
        },
      },
    });
  });

  it("label đã có trên issue (idempotent) → no-op, không duplicate", async () => {
    const client = makeClient();
    // findOne calls: issue lookup (1) + label lookup by title (2) → found.
    // Code skip _id fallback khi title lookup thành công.
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        labels: [{ tag: "label-1", title: "bug", color: 5 }], // đã có
      })
      .mockResolvedValueOnce({ _id: "label-1", title: "bug", color: 5 }); // label found by title
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_label");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", label: "bug" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/already|no-op|idempotent/i);
    // updateDoc KHÔNG gọi
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("label param là _id (raw ref) → fallback lookup by _id khi title miss", async () => {
    const client = makeClient();
    // findOne: issue (1), label by title miss (2), label by _id found (3).
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", labels: [] })
      .mockResolvedValueOnce(undefined) // title lookup miss
      .mockResolvedValueOnce({ _id: "label-1", title: "bug", color: 5 }); // _id lookup hit
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_add_issue_label");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", label: "label-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // findOne lần 3 query bằng _id (fallback sau title miss)
    const thirdCall = client.findOne.mock.calls[2];
    expect(thirdCall?.[1]).toMatchObject({ _id: "label-1" });
  });
});

// T-47: update_issue status persist + assignee leak (#36)
// Root cause 1: needsAssignee=true leak từ create → update auto-fill assignee.
// Root cause 2: ops.status push raw string ("Done") — Huly cần full ref
// ("tracker:status:Done"). Status không verify enum → server reject silent.
describe("T-47: update_issue status persist + assignee leak (#36)", () => {
  it("update_issue KHÔNG auto-fill assignee khi caller KHÔNG truyền (D15 chỉ cho create)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      title: "Old",
      assignee: "existing@x.com", // assignee cũ
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    // Caller CHỈ update title, KHÔNG truyền assignee
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "New title" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // ops KHÔNG chứa assignee → server giữ assignee cũ
    const updateCall = client.updateDoc.mock.calls[0];
    const ops = updateCall?.[3] as Record<string, unknown>;
    expect(ops.assignee).toBeUndefined();
    // assignee cũ KHÔNG bị override thành current user email
    expect(ops.assignee).not.toBe("u@x.com");
  });

  // T-72: status resolve scope theo project (getProjectStatuses ProjectType
  // traversal) — KHÔNG findAll global. Helper mock chain: Issue → Project →
  // ProjectType → IssueStatus per ref.
  function seedStatusChain(
    client: ReturnType<typeof makeClient>,
    statuses: Array<{ _id: string; name: string; category?: string }>,
  ) {
    let chain = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        status: "tracker:status:Todo",
      }) // issue
      .mockResolvedValueOnce({
        _id: "sp1",
        identifier: "PD",
        type: "pt-1",
        defaultIssueStatus: statuses[0]?._id ?? "",
      }) // Project
      .mockResolvedValueOnce({ statuses: statuses.map((s) => ({ _id: s._id })) }); // ProjectType
    // IssueStatus per ref — mockResolvedValueOnce each.
    for (const s of statuses) {
      chain = chain.mockResolvedValueOnce(s);
    }
    client.findOne = chain;
    return client;
  }

  it("update_issue status hợp lệ → resolve short name → full ref (scope project)", async () => {
    const client = seedStatusChain(makeClient(), ISSUE_STATUSES);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", status: "Done" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.status).toBe("tracker:status:Done"); // full ref (KHÔNG raw "Done")
  });

  it("update_issue status SAI → isError + suggest valid statuses", async () => {
    const client = seedStatusChain(makeClient(), ISSUE_STATUSES);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", status: "InvalidStatus" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/Done|Todo|Backlog/i);
    expect(text).toMatch(/InvalidStatus/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("update_issue status dạng full ref → accept as-is (match by _id)", async () => {
    const client = seedStatusChain(makeClient(), ISSUE_STATUSES);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", status: "tracker:status:Done" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.status).toBe("tracker:status:Done");
  });

  it("update_issue KHÔNG truyền status → KHÔNG gọi getProjectStatuses (skip validation)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    await tool.execute("tc1", { identifier: "PD-1", title: "New" }, undefined, undefined, ctx);

    // findOne chỉ gọi 1 lần (issue lookup) — KHÔNG ProjectType chain
    expect(client.findOne).toHaveBeenCalledTimes(1);
  });

  it("project không có type (fresh) → isError noStatusesConfigured", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" }) // issue
      .mockResolvedValueOnce({ _id: "sp1", identifier: "PD" }); // Project no type
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", status: "Done" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/no workflow statuses/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("status có whitespace ' Done ' → trim rồi match name", async () => {
    const client = seedStatusChain(makeClient(), ISSUE_STATUSES);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", status: "  Done  " },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.status).toBe("tracker:status:Done");
  });

  it("project not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" }) // issue
      .mockResolvedValueOnce(undefined); // Project not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", status: "Done" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-72: update_issue description MarkupBlobRef (uploadMarkup/updateMarkup)", () => {
  it("description mới (issue chưa có description) → uploadMarkup + ops.description = ref", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", description: null });
    client.uploadMarkup = vi.fn().mockResolvedValue({ blob: "new-ref" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", description: "# new desc" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.uploadMarkup).toHaveBeenCalledWith(
      ISSUE_CLASS,
      "i1",
      "description",
      "# new desc",
      "markdown",
    );
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.description).toEqual({ blob: "new-ref" });
  });

  it("description update (issue đã có description) → updateMarkup overwrite (KHÔNG uploadMarkup)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      description: { blob: "existing-ref" },
    });
    client.updateMarkup = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", description: "# updated" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // T-72 review: response success (KHÔNG "No fields to update"), updateDoc KHÔNG gọi
    expect(result.details).toMatchObject({ updated: true });
    expect((result.details as { fields: string[] }).fields).toContain("description");
    expect(client.updateMarkup).toHaveBeenCalledWith(
      ISSUE_CLASS,
      "i1",
      "description",
      "# updated",
      "markdown",
    );
    expect(client.uploadMarkup).not.toHaveBeenCalled();
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

// T-68: move_issue dùng AttachedDoc hierarchy fields (attachedTo/attachedToClass/
// collection/parents/subIssues). Field `parentIssue` KHÔNG tồn tại runtime.
describe("T-68: move_issue AttachedDoc hierarchy (topLevel/childIssue helpers)", () => {
  it("top-level promotion (was top-level) → 1 updateDoc với topLevelIssueParent fields, NO dec", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      attachedTo: "",
      attachedToClass: ISSUE_CLASS,
      subIssues: 0,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_move_issue");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.attachedTo).toBe(""); // NoParent sentinel
    expect(ops.collection).toBe("subIssues");
    expect(ops.parents).toEqual([]);
  });

  it("top-level promotion (was child) → 2 updateDoc (issue fields + dec old parent -1)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      attachedTo: "old-parent-id",
      attachedToClass: ISSUE_CLASS,
      subIssues: 0,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_move_issue");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(2);
    // 2nd call = dec old parent subIssues -1
    const decCall = client.updateDoc.mock.calls[1];
    expect(decCall?.[1]).toBe("sp1"); // space
    expect(decCall?.[2]).toBe("old-parent-id"); // old parent _id
    expect(decCall?.[3]).toEqual({ $inc: { subIssues: -1 } });
  });

  it("top-level promotion với descendants → updateDescendantParents recursive clear breadcrumb", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      attachedTo: "",
      attachedToClass: ISSUE_CLASS,
      subIssues: 2,
    });
    client.findAll = vi
      .fn()
      .mockResolvedValue([{ _id: "child-1", attachedTo: "i1", space: "sp1", subIssues: 0 }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_move_issue");
    await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    // findAll descendants + updateDoc each child parents=[]
    expect(client.findAll).toHaveBeenCalledWith(ISSUE_CLASS, { attachedTo: "i1", space: "sp1" });
    // 2 updateDoc: issue itself + child descendant
    expect(client.updateDoc).toHaveBeenCalledTimes(2);
  });

  it("move to child (was top-level) → 2 updateDoc (attachIssueChild: child fields + inc new parent +1)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        attachedTo: "",
        attachedToClass: ISSUE_CLASS,
        subIssues: 0,
      })
      .mockResolvedValueOnce({
        _id: "epic-1",
        identifier: "PD-2",
        space: "sp1",
        parents: [],
        title: "Epic",
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_move_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", parentIssue: "PD-2" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(2);
    // 1st: child fields (attachedTo=epic-1, parents breadcrumb)
    const childOps = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(childOps.attachedTo).toBe("epic-1");
    expect(childOps.collection).toBe("subIssues");
    // 2nd: inc new parent +1
    const incCall = client.updateDoc.mock.calls[1];
    expect(incCall?.[2]).toBe("epic-1");
    expect(incCall?.[3]).toEqual({ $inc: { subIssues: 1 } });
  });

  it("move to child (was child, different parent) → 3 updateDoc (child fields + inc new +1 + dec old -1)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        attachedTo: "old-parent-id",
        attachedToClass: ISSUE_CLASS,
        subIssues: 0,
      })
      .mockResolvedValueOnce({
        _id: "new-parent-id",
        identifier: "PD-2",
        space: "sp1",
        parents: [],
        title: "New Epic",
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_move_issue");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", parentIssue: "PD-2" },
      undefined,
      undefined,
      ctx,
    );

    expect(client.updateDoc).toHaveBeenCalledTimes(3);
    // call[1] = inc new +1, call[2] = dec old -1
    expect(client.updateDoc.mock.calls[1]?.[3]).toEqual({ $inc: { subIssues: 1 } });
    expect(client.updateDoc.mock.calls[2]?.[2]).toBe("old-parent-id");
    expect(client.updateDoc.mock.calls[2]?.[3]).toEqual({ $inc: { subIssues: -1 } });
  });

  it("parentIssue KHÔNG tồn tại → isError + updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", attachedTo: "" })
      .mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_move_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", parentIssue: "PD-999" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/parent.*not found/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("issue KHÔNG tồn tại → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_move_issue");
    const result = await tool.execute("tc1", { identifier: "PD-999" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

// T-68: list_issues filter parentIssue → query.attachedTo (KHÔNG parentIssue field)
describe("T-68: list_issues parentIssue filter → query.attachedTo", () => {
  it("parentIssue filter → resolve identifier → _id, query.attachedTo", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "sp1", identifier: "PD" }) // T-71: getProjectSpace
      .mockResolvedValueOnce({ _id: "parent-id", identifier: "PD-2", space: "sp1" }); // resolve parent
    client.findAll = vi.fn().mockResolvedValue([{ _id: "c1", identifier: "PD-1", title: "Child" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issues");
    const result = await tool.execute("tc1", { parentIssue: "PD-2" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    // findAll query contains attachedTo: parent-id (NOT parentIssue) + space scoping
    const findAllCall = client.findAll.mock.calls[0];
    const query = findAllCall?.[1] as Record<string, unknown>;
    expect(query.attachedTo).toBe("parent-id");
    expect(query.space).toBe("sp1");
    expect(query.parentIssue).toBeUndefined();
  });

  it("parentIssue filter not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "sp1", identifier: "PD" }) // T-71: getProjectSpace
      .mockResolvedValueOnce(undefined); // parent not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issues");
    const result = await tool.execute("tc1", { parentIssue: "PD-999" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.findAll).not.toHaveBeenCalled();
  });
});

// T-71: list_issues space scoping + assignee resolve + titleSearch no-leak
describe("T-71: list_issues space scoping + assignee resolve", () => {
  it("findAll query chứa space: project._id (KHÔNG identifier $like)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "sp1", identifier: "PD" });
    client.findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issues");
    await tool.execute("tc1", {}, undefined, undefined, ctx);

    const query = client.findAll.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(query.space).toBe("sp1");
    expect(query.identifier).toBeUndefined(); // T-71: bỏ identifier $like
  });

  it("project not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined); // getProjectSpace
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issues");
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.findAll).not.toHaveBeenCalled();
  });

  it("titleSearch KHÔNG xóa space filter (no cross-project leak)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "sp1", identifier: "PD" });
    client.findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issues");
    await tool.execute("tc1", { titleSearch: "bug" }, undefined, undefined, ctx);

    const query = client.findAll.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(query.space).toBe("sp1"); // KHÔNG bị xóa
    expect(query.title).toEqual({ $like: "%bug%" });
  });
});
