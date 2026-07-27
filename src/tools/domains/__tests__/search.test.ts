// Test T-42 fulltext_search — expand query + honest capability.
// Cover: search issues (title), documents (title/content), messages; $like
// behavior; fallback khi server không support; tool description honest.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../../config/resolver.js", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
  resolveProject: vi.fn().mockResolvedValue(undefined),
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
import { tools } from "../search.js";

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
    createDoc: vi.fn(),
    updateDoc: vi.fn(),
    removeDoc: vi.fn(),
    addCollection: vi.fn(),
    createMixin: vi.fn(),
    fetchMarkup: vi.fn(),
    getAccount: vi.fn(),
  };
}

function findTool() {
  return tools.find((t) => t.name === "huly_fulltext_search")!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-42 fulltext_search — expand query across domains", () => {
  it("findAll gọi 3 lần: Issue (title), Document (title), ChatMessage (content)", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    await tool.execute("tc1", { query: "critical bug" }, undefined, undefined, ctx);

    // 3 query across domains
    expect(client.findAll).toHaveBeenCalledTimes(3);
    const calls = client.findAll.mock.calls;
    // Verify class refs
    expect(calls[0]?.[0]).toBe("tracker:class:Issue");
    expect(calls[1]?.[0]).toBe("tracker:class:Document");
    expect(calls[2]?.[0]).toBe("chunter:class:ChatMessage");
    // Verify $like pattern with escaped wildcards
    expect(calls[0]?.[1]).toMatchObject({
      title: { $like: "%critical bug%" },
    });
  });

  it("escape $like wildcards trong query (% _ \\) tránh injection", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    await tool.execute("tc1", { query: "50%_off" }, undefined, undefined, ctx);

    const firstCall = client.findAll.mock.calls[0];
    expect(firstCall?.[1]).toMatchObject({
      title: { $like: "%50\\%\\_off%" },
    });
  });

  it("merge results + tag domain type (issue/document/message)", async () => {
    const client = makeClient();
    client.findAll = vi
      .fn()
      .mockResolvedValueOnce([{ _id: "i1", identifier: "PD-1", title: "Critical bug in auth" }])
      .mockResolvedValueOnce([{ _id: "d1", title: "Auth doc", content: "..." }])
      .mockResolvedValueOnce([{ _id: "m1", content: "msg about bug" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "bug" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({ count: 3 });
    const items = (result.details as { results: Array<{ _id: string; type: string }> }).results;
    expect(items.some((i) => i._id === "i1" && i.type === "issue")).toBe(true);
    expect(items.some((i) => i._id === "d1" && i.type === "document")).toBe(true);
    expect(items.some((i) => i._id === "m1" && i.type === "message")).toBe(true);
  });

  it("limit cap applied across all domains", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    await tool.execute("tc1", { query: "x", limit: 10 }, undefined, undefined, ctx);

    // limit passed per-domain query
    for (const call of client.findAll.mock.calls) {
      expect(call?.[2]).toMatchObject({ limit: 10 });
    }
  });

  it("server reject $like (Connection/Internal error) → catch + honest message", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockRejectedValue(new Error("platform:status:BadRequest"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    // Honest message — KHÔNG fake "Found 0 results" mà return error rõ ràng.
    // T-49: message đổi sang "All search domains failed: <reasons>" khi tất cả
    // reject (Promise.allSettled → all rejected branch).
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/all search domains failed|search failed|error/i);
  });

  it("tool description honest về capability (KHÔNG overclaim fulltext)", () => {
    const tool = findTool();
    // Description phải mention substring search (KHÔNG claim "fulltext index")
    expect(tool.description.toLowerCase()).toMatch(/substring|title|content/);
  });
});

// T-49 #38: defensive per-domain catch — 1 domain fail không kéo cả search fail.
// Bug gốc: Promise.all reject nếu 1 domain throw (Document class sai runtime
// → domain not found). Fix: Promise.allSettled → partial result + warning.
describe("T-49 #38: defensive per-domain catch (Promise.allSettled)", () => {
  it("1 domain reject (Document) → Issue + ChatMessage vẫn return + warning", async () => {
    const client = makeClient();
    // findAll mock theo thứ tự gọi: Issue, Document, ChatMessage
    client.findAll = vi
      .fn()
      .mockResolvedValueOnce([{ _id: "i1", identifier: "PD-1", title: "Critical bug" }])
      .mockRejectedValueOnce(new Error("domain not found: tracker:class:Document"))
      .mockResolvedValueOnce([{ _id: "m1", content: "msg about bug" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "bug" }, undefined, undefined, ctx);

    // KHÔNG isError (partial result vẫn success)
    expect(result.isError).toBeUndefined();
    // results = 2 (issue + message), KHÔNG phải 3 (document bị skip)
    const details = result.details as {
      results: Array<{ _id: string; type: string }>;
    };
    expect(details.results).toHaveLength(2);
    expect(details.results.some((r) => r._id === "i1" && r.type === "issue")).toBe(true);
    expect(details.results.some((r) => r._id === "m1" && r.type === "message")).toBe(true);
    expect(details.results.some((r) => r.type === "document")).toBe(false);
    // Content warning mention Document failed
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/document.*fail/i);
  });

  it("TẤT CẢ domain reject → isError + honest message (KHÔNG fake 0 results)", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "x" }, undefined, undefined, ctx);

    // isError (tất cả fail → không có result nào)
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    // Honest message — KHÔNG fake "Found 0 results"
    expect(text).toMatch(/all.*domain.*fail|search failed/i);
    expect(text).not.toMatch(/found 0 result/i);
  });
});
