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
    fetchMarkup: vi.fn(),
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

describe("T-40 bonus: create_issue surface identifier (#26)", () => {
  it("create_issue → lookup issue sau createDoc để lấy identifier", async () => {
    const client = makeClient();
    // findOne: lần 1 = project lookup, lần 2 = issue lookup sau createDoc
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", space: "sp1" }) // project
      .mockResolvedValueOnce({ _id: "internal-id-abc", identifier: "PD-42", title: "Test" }); // issue sau tạo
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue");
    const result = await tool.execute(
      "tc1",
      { title: "Test", priority: "high" },
      undefined,
      undefined,
      ctx,
    );

    // createDoc được gọi
    expect(client.createDoc).toHaveBeenCalledTimes(1);
    // findOne gọi 2 lần: project + issue lookup
    expect(client.findOne).toHaveBeenCalledTimes(2);
    // Lần 2 query bằng _id internal (để lấy identifier server-assigned)
    const secondCallArgs = client.findOne.mock.calls[1];
    expect(secondCallArgs?.[1]).toMatchObject({ _id: "internal-id-abc" });
    // details có cả id + identifier + title
    expect(result.details).toMatchObject({
      id: "internal-id-abc",
      identifier: "PD-42",
      title: "Test",
    });
    // non-TUI: content phải có identifier (LLM cần)
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PD-42");
  });

  it("create_issue lookup fail (server chưa gán identifier) → vẫn return id, identifier=undefined", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", space: "sp1" }) // project
      .mockResolvedValueOnce(undefined); // issue lookup fail (chưa index)
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue");
    const result = await tool.execute("tc1", { title: "Test" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({ id: "internal-id-abc", title: "Test" });
    // identifier undefined (server async assign, có thể cần retry sau) — không crash
    expect((result.details as { identifier?: string }).identifier).toBeUndefined();
    // Content hint cho LLM biết retry path (tránh stuck với _id internal)
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Identifier pending");
    expect(text).toContain("huly_list_issues");
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
  it("label KHÔNG tồn tại → isError + suggest create_label trước", async () => {
    const client = makeClient();
    // findOne: lần 1 = issue lookup, lần 2 = label lookup (not found)
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", labels: [] }) // issue
      .mockResolvedValue(undefined); // label not found (cả 2 lần lookup)
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
    expect(text).toMatch(/create_label/i);
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

  it("update_issue với status hợp lệ → resolve short name → full ref trước khi gửi", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue(ISSUE_STATUSES);
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      status: "tracker:status:Todo",
    });
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
    // findAll được gọi để load valid statuses
    expect(client.findAll).toHaveBeenCalledWith("tracker:class:IssueStatus", {}, {});
    // ops.status = full ref (KHÔNG phải raw "Done")
    const updateCall = client.updateDoc.mock.calls[0];
    const ops = updateCall?.[3] as Record<string, unknown>;
    expect(ops.status).toBe("tracker:status:Done");
  });

  it("update_issue với status SAI → isError + suggest valid statuses", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue(ISSUE_STATUSES);
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      status: "tracker:status:Todo",
    });
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
    // Message list valid statuses để LLM biết chọn
    expect(text).toMatch(/Done|Todo|Backlog/i);
    expect(text).toMatch(/InvalidStatus/i);
    // updateDoc KHÔNG gọi (validation failed)
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("update_issue với status dạng full ref ('tracker:status:Done') → accept as-is", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue(ISSUE_STATUSES);
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
      status: "tracker:status:Todo",
    });
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
    const updateCall = client.updateDoc.mock.calls[0];
    const ops = updateCall?.[3] as Record<string, unknown>;
    expect(ops.status).toBe("tracker:status:Done");
  });

  it("update_issue KHÔNG truyền status → KHÔNG gọi findAll status (skip validation)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "i1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    await tool.execute("tc1", { identifier: "PD-1", title: "New" }, undefined, undefined, ctx);

    // findAll KHÔNG gọi (status không phải field update)
    const statusCalls = client.findAll.mock.calls.filter(
      (c) => c[0] === "tracker:class:IssueStatus",
    );
    expect(statusCalls).toHaveLength(0);
  });
});
