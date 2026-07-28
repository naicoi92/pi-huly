// Test T-42 + T-60 fulltext_search — expand query + honest capability.
// T-60 (2026-07-28): Document domain REMOVED (tracker:class:Document not
// registered runtime — interface orphan). Chỉ 2 domain: Issue (title) +
// ChatMessage (content). Tool description honest Document unavailable.

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
  it("findAll gọi 2 lần: Issue (title) + ChatMessage (content) — Document REMOVED (T-60)", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    await tool.execute("tc1", { query: "critical bug" }, undefined, undefined, ctx);

    // T-60: chỉ 2 domain (Issue + ChatMessage), Document removed
    expect(client.findAll).toHaveBeenCalledTimes(2);
    const calls = client.findAll.mock.calls;
    expect(calls[0]?.[0]).toBe("tracker:class:Issue");
    expect(calls[1]?.[0]).toBe("chunter:class:ChatMessage");
    // KHÔNG query Document (T-60 remove — class not registered runtime)
    const queriedClasses = calls.map((c) => c[0]);
    expect(queriedClasses).not.toContain("tracker:class:Document");
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

  it("merge results + tag domain type (issue/message) — Document removed", async () => {
    const client = makeClient();
    client.findAll = vi
      .fn()
      .mockResolvedValueOnce([{ _id: "i1", identifier: "PD-1", title: "Critical bug in auth" }])
      .mockResolvedValueOnce([{ _id: "m1", content: "msg about bug" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "bug" }, undefined, undefined, ctx);

    // T-60: chỉ 2 result (issue + message), không document
    expect(result.details).toMatchObject({ count: 2 });
    const items = (result.details as { results: Array<{ _id: string; type: string }> }).results;
    expect(items.some((i) => i._id === "i1" && i.type === "issue")).toBe(true);
    expect(items.some((i) => i._id === "m1" && i.type === "message")).toBe(true);
    expect(items.some((i) => i.type === "document")).toBe(false);
  });

  it("limit cap applied across all domains", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    await tool.execute("tc1", { query: "x", limit: 10 }, undefined, undefined, ctx);

    for (const call of client.findAll.mock.calls) {
      expect(call?.[2]).toMatchObject({ limit: 10 });
    }
  });

  it("server reject $like → catch + honest message", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockRejectedValue(new Error("platform:status:BadRequest"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/all search domains failed|search failed|error/i);
  });

  it("T-60 tool description honest Document unavailable", () => {
    const tool = findTool();
    expect(tool.description).toMatch(/substring/i);
    expect(tool.description).toMatch(/document/i);
    expect(tool.description.toLowerCase()).toMatch(/not available|unavailable/i);
  });
});

// T-49 #38: defensive per-domain catch — 1 domain fail không kéo cả search fail.
describe("T-49 #38: defensive per-domain catch (Promise.allSettled)", () => {
  it("1 domain reject (ChatMessage) → Issue vẫn return + warning", async () => {
    const client = makeClient();
    // T-60: chỉ 2 domain — Issue OK, ChatMessage fail
    client.findAll = vi
      .fn()
      .mockResolvedValueOnce([{ _id: "i1", identifier: "PD-1", title: "Critical bug" }])
      .mockRejectedValueOnce(new Error("domain not found: chunter:class:ChatMessage"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "bug" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const details = result.details as {
      results: Array<{ _id: string; type: string }>;
      failedDomains?: Array<{ name: string; reason: string }>;
    };
    expect(details.results).toHaveLength(1);
    expect(details.results[0]?._id).toBe("i1");
    expect(details.failedDomains).toEqual([
      { name: "messages", reason: expect.stringContaining("domain not found") },
    ]);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/messages search failed/i);
  });

  it("TẤT CẢ domain reject → isError + honest message (KHÔNG fake 0 results)", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool();
    const result = await tool.execute("tc1", { query: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/all.*domain.*fail|search failed/i);
    expect(text).not.toMatch(/found 0 result/i);
  });
});
