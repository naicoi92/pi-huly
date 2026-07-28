// T-63 #68: schema drift guard regression cho 4 file thiếu test
// (comments, projects, tag-categories, spaces). Helper safeUpdateDoc/safeRemoveDoc
// test ở _common.test.ts; file này verify migration wiring qua tool entry.
//
// Pattern: mock findOne trả doc missing space/_id → tool gọi safeUpdateDoc →
// isError + write KHÔNG gọi (silent no-op prevention).

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
import { tools as commentsTools } from "../comments.js";
import { tools as projectsTools } from "../projects.js";
import { tools as tagCategoryTools } from "../tag-categories.js";
import { tools as spacesTools } from "../spaces.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

function makeClient(docToReturn: unknown) {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(docToReturn),
    createDoc: vi.fn().mockResolvedValue("new-ref"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn(),
    createMixin: vi.fn(),
    fetchMarkup: vi.fn(),
    getAccount: vi.fn(),
    close: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-63 schema drift guard — comments", () => {
  it("update_comment: comment doc missing space → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient({ _id: "c-1", body: "text" }); // space missing
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = commentsTools.find((t) => t.name === "huly_update_comment");
    if (!tool) throw new Error("huly_update_comment not found");
    const result = await tool.execute(
      "tc1",
      { comment: "c-1", body: "updated" } as never,
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("delete_comment: comment doc missing _id → isError, removeDoc KHÔNG gọi", async () => {
    const client = makeClient({ space: "sp1", body: "text" }); // _id missing
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = commentsTools.find((t) => t.name === "huly_delete_comment");
    if (!tool) throw new Error("huly_delete_comment not found");
    const result = await tool.execute(
      "tc1",
      { comment: "c-1" } as never,
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.removeDoc).not.toHaveBeenCalled();
  });
});

describe("T-63 schema drift guard — projects", () => {
  it("update_project: project doc missing space → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient({ _id: "p-1", name: "Proj", identifier: "PD" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = projectsTools.find((t) => t.name === "huly_update_project");
    if (!tool) throw new Error("huly_update_project not found");
    const result = await tool.execute(
      "tc1",
      { project: "PD", name: "Updated" } as never,
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("delete_project: project doc missing _id → isError, removeDoc KHÔNG gọi", async () => {
    const client = makeClient({ space: "sp1", name: "Proj", identifier: "PD" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = projectsTools.find((t) => t.name === "huly_delete_project");
    if (!tool) throw new Error("huly_delete_project not found");
    const result = await tool.execute("tc1", {} as never, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(client.removeDoc).not.toHaveBeenCalled();
  });
});

describe("T-63 schema drift guard — tag-categories", () => {
  it("update_tag_category: category doc missing space → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient({ _id: "cat-1", name: "Cat", color: "#fff" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = tagCategoryTools.find((t) => t.name === "huly_update_tag_category");
    if (!tool) throw new Error("huly_update_tag_category not found");
    const result = await tool.execute(
      "tc1",
      { category: "cat-1", title: "Updated" } as never,
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("delete_tag_category: category doc missing _id → isError, removeDoc KHÔNG gọi", async () => {
    const client = makeClient({ space: "sp1", name: "Cat" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = tagCategoryTools.find((t) => t.name === "huly_delete_tag_category");
    if (!tool) throw new Error("huly_delete_tag_category not found");
    const result = await tool.execute(
      "tc1",
      { category: "cat-1" } as never,
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.removeDoc).not.toHaveBeenCalled();
  });
});

describe("T-63 schema drift guard — spaces", () => {
  it("update_space: space doc missing _id → isError, updateDoc KHÔNG gọi", async () => {
    // space doc: space field trùng name (Space.space = self ref). Test _id missing.
    const client = makeClient({ space: "sp1", name: "My Space" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = spacesTools.find((t) => t.name === "huly_update_space");
    if (!tool) throw new Error("huly_update_space not found");
    const result = await tool.execute(
      "tc1",
      { space: "sp1", name: "Updated" } as never,
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});
