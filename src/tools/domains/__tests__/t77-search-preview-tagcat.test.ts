// T-77: searchFulltext prefer + $like fallback, preview_deletion cascade, tag-category label.

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
import { tools as searchTools } from "../search.js";
import { tools as deletionTools } from "../deletion.js";
import { tools as tagCatTools } from "../tag-categories.js";
import { TAG_CATEGORY_CLASS } from "../_class-refs.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("new-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn().mockResolvedValue("coll-id"),
    searchFulltext: undefined as unknown,
  };
}
function findTool(list: { name: string }[], name: string) {
  const t = list.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t as never as {
    name: string;
    execute: (
      id: string,
      p: Record<string, unknown>,
      s: undefined,
      u: undefined,
      ctx: unknown,
    ) => Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
      isError?: true;
    }>;
  };
}
beforeEach(() => vi.clearAllMocks());

describe("T-77: fulltext_search prefers searchFulltext, falls back $like", () => {
  it("searchFulltext available → use it (engine: searchFulltext)", async () => {
    const client = makeClient();
    client.searchFulltext = vi.fn().mockResolvedValue({
      docs: [
        {
          id: "i1",
          title: "Bug X",
          doc: { _id: "i1", _class: "tracker:class:Issue", identifier: "PD-1" },
        },
      ],
    });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool(searchTools, "huly_fulltext_search").execute(
      "tc1",
      { query: "bug" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.details).toMatchObject({ engine: "searchFulltext", count: 1 });
    expect(client.searchFulltext).toHaveBeenCalled();
  });

  it("searchFulltext throws → fallback $like (engine implicit, 2 domains)", async () => {
    const client = makeClient();
    client.searchFulltext = vi.fn().mockRejectedValue(new Error("not available"));
    client.findAll = vi.fn().mockResolvedValue([{ _id: "i1", title: "Bug", identifier: "PD-1" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool(searchTools, "huly_fulltext_search").execute(
      "tc1",
      { query: "bug" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBeUndefined();
    expect(r.details.engine).toBeUndefined(); // $like path, no engine field
    expect(client.findAll).toHaveBeenCalled();
  });

  it("searchFulltext undefined (ws lacking) → $like fallback", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool(searchTools, "huly_fulltext_search").execute(
      "tc1",
      { query: "x" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.details.engine).toBeUndefined();
    expect(client.findAll).toHaveBeenCalled();
  });
});

describe("T-84: preview_deletion reads CollectionSize counters (no N+1 findAll) #119", () => {
  it("reads subIssues/comments/attachments counters + inline blockedBy/relations, correct total", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "i1",
      identifier: "PD-1",
      space: "sp1",
      subIssues: 3, // CollectionSize counter
      comments: 5,
      attachments: 2,
      blockedBy: [{ _id: "b1" }],
      relations: [{ _id: "r1" }, { _id: "r2" }],
    });
    client.findAll = vi.fn(); // T-84: KHÔNG gọi findAll (counters trực tiếp)
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool(deletionTools, "huly_preview_deletion").execute(
      "tc1",
      { identifier: "PD-1" },
      undefined,
      undefined,
      ctx,
    );
    const cascade = r.details.cascade as Record<string, number>;
    expect(cascade.comments).toBe(5);
    expect(cascade.attachments).toBe(2);
    expect(cascade.subIssues).toBe(3);
    expect(cascade.blockedBy).toBe(1);
    expect(cascade.relations).toBe(2);
    // T-84: total = subIssues+comments+attachments+blockedBy+relations (no +1 entity,
    // no reverseBlocks — match trusted previewIssueDeletion).
    expect(cascade.total).toBe(3 + 5 + 2 + 1 + 2);
    expect(cascade.reverseBlocks).toBeUndefined(); // T-84: drop broken counter
    // T-84: findAll KHÔNG gọi (đọc counters trực tiếp, không N+1).
    expect(client.findAll).not.toHaveBeenCalled();
    expect(r.details.warnings).toBeDefined();
  });
});

describe("T-77: tag-categories field label (KHÔNG title)", () => {
  it("create → createDoc với label + defaults (icon/tags/default)", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    await findTool(tagCatTools, "huly_create_tag_category").execute(
      "tc1",
      { label: "Priority" },
      undefined,
      undefined,
      ctx,
    );
    const attrs = client.createDoc.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(attrs.label).toBe("Priority");
    expect(attrs.title).toBeUndefined();
    expect(attrs.icon).toBe("");
    expect(attrs.tags).toEqual([]);
    expect(attrs.default).toBe(false);
  });

  it("list → read field label", async () => {
    const client = makeClient();
    client.findAll = vi
      .fn()
      .mockResolvedValue([{ _id: "c1", label: "Priority", targetClass: "x" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool(tagCatTools, "huly_list_tag_categories").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );
    const cats = r.details.categories as Array<Record<string, unknown>>;
    expect(cats[0].label).toBe("Priority");
  });

  it("update → ops.label (KHÔNG title)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValue({ _id: "c1", space: "sp1", _class: TAG_CATEGORY_CLASS });
    vi.mocked(getClient).mockResolvedValue(client as never);
    await findTool(tagCatTools, "huly_update_tag_category").execute(
      "tc1",
      { category: "c1", label: "New" },
      undefined,
      undefined,
      ctx,
    );
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.label).toBe("New");
    expect(ops.title).toBeUndefined();
  });
});

// T-74: log_time collection "reports" + hours + date + employee best-effort.
describe("T-74: log_time collection reports + hours unit", () => {
  it('addCollection với collection "reports" + value hours + date', async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" });
    client.getCurrentUser = vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const timeTools = (await import("../time.js")).tools;
    const tool = timeTools.find((t) => t.name === "huly_log_time")!;
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", value: 2.5 },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const call = client.addCollection.mock.calls[0];
    expect(call?.[4]).toBe("reports"); // KHÔNG "timetracking"
    const attrs = call?.[5] as Record<string, unknown>;
    expect(attrs.value).toBe(2.5); // hours (fractional OK)
    expect(attrs.date).toEqual(expect.any(Number));
  });
});
