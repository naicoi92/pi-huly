// Test T-40 bonus + T-41 + T-45 cho issues-core domain (8 tools).
// Cover: create_issue identifier lookup sau createDoc (T-40 bonus #26),
// get_issue description ref resolution (T-41 #23 — khi T-44 xong),
// add_issue_label validation (T-45 #27 — khi T-44 xong).

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
