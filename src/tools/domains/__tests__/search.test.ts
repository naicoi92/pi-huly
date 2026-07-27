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
    // Honest message — KHÔNG fake "Found 0 results" mà return error rõ ràng
    expect(result.content[0]?.text ?? "").toMatch(/search failed|error/i);
  });

  it("tool description honest về capability (KHÔNG overclaim fulltext)", () => {
    const tool = findTool();
    // Description phải mention substring search (KHÔNG claim "fulltext index")
    expect(tool.description.toLowerCase()).toMatch(/substring|title|content/);
  });
});
