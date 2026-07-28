// T-66 (2026-07-28): documents domain tests — RE-ENABLED từ honest-unavailable.
// create_teamspace STAYS unavailable (icon/spaceType refs from document plugin).
// list/get/update/delete teamspace + list/get/create/edit/delete document ENABLED.

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
import { tools } from "../documents.js";
import { TEAMSPACE_CLASS, DOCUMENT_CLASS } from "../_class-refs.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

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
    createDoc: vi.fn().mockResolvedValue("doc-id-1"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    fetchMarkup: vi.fn().mockResolvedValue("# doc content"),
    uploadMarkup: vi.fn().mockResolvedValue({ blob: "blob-ref" }),
    updateMarkup: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-66: create_teamspace STAYS honest-unavailable (icon/spaceType refs)", () => {
  it("create_teamspace → isError + KHÔNG gọi createDoc (no orphan broken space)", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_teamspace");
    const result = await tool.execute(
      "tc1",
      { name: "Design Docs", description: "Design documents space" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("error message mention icon/spaceType refs + recovery via Huly UI", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_teamspace");
    const result = await tool.execute("tc1", { name: "Test Space" }, undefined, undefined, ctx);

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("documentPlugin.icon.Teamspace");
    expect(text).toContain("documentPlugin.spaceType.DefaultTeamspaceType");
    expect(text).toMatch(/Huly UI/i);
    expect(text).toContain("huly_list_teamspaces");
  });

  it("details reason=icon_spacetype_ref_inaccessible + missingRefs list", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_teamspace");
    const result = await tool.execute(
      "tc1",
      { name: "X", private: true },
      undefined,
      undefined,
      ctx,
    );

    expect(result.details).toMatchObject({
      reason: "icon_spacetype_ref_inaccessible",
      missingRefs: [
        "documentPlugin.icon.Teamspace",
        "documentPlugin.spaceType.DefaultTeamspaceType",
      ],
      name: "X",
    });
  });
});

describe("T-66: list/get_teamspaces dùng TEAMSPACE_CLASS (KHÔNG SPACE_CLASS)", () => {
  it("list_teamspaces → findAll TEAMSPACE_CLASS + filter archived=false", async () => {
    const client = makeClient();
    client.findAll = vi
      .fn()
      .mockResolvedValue([
        { _id: "ts-1", name: "Design", description: "design docs", private: false },
      ]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_teamspaces");
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.findAll).toHaveBeenCalledWith(
      TEAMSPACE_CLASS,
      { archived: false },
      expect.any(Object),
    );
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1 teamspace");
  });

  it("get_teamspace → findOne TEAMSPACE_CLASS (read OK)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "ts-1",
      name: "Design",
      description: null,
      private: false,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_teamspace");
    const result = await tool.execute("tc1", { teamspace: "ts-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.findOne).toHaveBeenCalledWith(TEAMSPACE_CLASS, { _id: "ts-1" });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Design");
  });

  it("get_teamspace not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_teamspace");
    const result = await tool.execute("tc1", { teamspace: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
  });
});

describe("T-66: update/delete_teamspace dùng core.space.Space parent", () => {
  it("update_teamspace → updateDoc TEAMSPACE_CLASS + core.space.Space", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "ts-1",
      name: "Old",
      space: "core.space.Space",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_teamspace");
    const result = await tool.execute(
      "tc1",
      { teamspace: "ts-1", name: "New" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    expect(client.updateDoc).toHaveBeenCalledWith(TEAMSPACE_CLASS, "core.space.Space", "ts-1", {
      name: "New",
    });
  });

  it("delete_teamspace → removeDoc TEAMSPACE_CLASS + core.space.Space", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "ts-1",
      name: "Old",
      space: "core.space.Space",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_delete_teamspace");
    const result = await tool.execute(
      "tc1",
      { teamspace: "ts-1" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    expect(result.isError).toBeUndefined();
    expect(client.removeDoc).toHaveBeenCalledWith(TEAMSPACE_CLASS, "core.space.Space", "ts-1");
  });
});

describe("T-66: document CRUD ENABLED (DOCUMENT_CLASS + space scoping)", () => {
  it("list_documents → findAll DOCUMENT_CLASS + space=teamspace._id", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "ts-1", name: "Docs" });
    client.findAll = vi.fn().mockResolvedValue([{ _id: "d-1", title: "Doc1" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_documents");
    const result = await tool.execute("tc1", { teamspace: "ts-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.findAll).toHaveBeenCalledWith(
      DOCUMENT_CLASS,
      { space: "ts-1" },
      expect.any(Object),
    );
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1 document");
  });

  it("list_documents teamspace not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_documents");
    const result = await tool.execute("tc1", { teamspace: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.findAll).not.toHaveBeenCalled();
  });

  it("get_document → findOne DOCUMENT_CLASS + fetchMarkup content", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "d-1",
      title: "Doc",
      content: { blob: "ref-1" },
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_document");
    const result = await tool.execute("tc1", { document: "d-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.findOne).toHaveBeenCalledWith(DOCUMENT_CLASS, { _id: "d-1" });
    expect(client.fetchMarkup).toHaveBeenCalledTimes(1);
  });

  it("create_document with content → uploadMarkup + createDoc DOCUMENT_CLASS", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "ts-1", name: "Docs" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_document");
    const result = await tool.execute(
      "tc1",
      { teamspace: "ts-1", title: "New", content: "# hello" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.uploadMarkup).toHaveBeenCalledTimes(1);
    expect(client.createDoc).toHaveBeenCalledTimes(1);
    expect(client.createDoc).toHaveBeenCalledWith(
      DOCUMENT_CLASS,
      "ts-1",
      expect.objectContaining({ title: "New" }),
      expect.any(String),
    );
  });

  it("create_document without content → createDoc content=null, NO uploadMarkup", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "ts-1", name: "Docs" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_document");
    const result = await tool.execute(
      "tc1",
      { teamspace: "ts-1", title: "Empty" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.uploadMarkup).not.toHaveBeenCalled();
    expect(client.createDoc).toHaveBeenCalledWith(
      DOCUMENT_CLASS,
      "ts-1",
      expect.objectContaining({ title: "Empty", content: null }),
      expect.any(String),
    );
  });

  it("edit_document content mode (existing blob) → updateMarkup", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "d-1",
      title: "Doc",
      content: { blob: "ref" },
      space: "ts-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_edit_document");
    const result = await tool.execute(
      "tc1",
      { document: "d-1", content: "# new" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateMarkup).toHaveBeenCalledTimes(1);
  });

  it("edit_document search-replace → fetchMarkup + updateMarkup", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "d-1",
      title: "Doc",
      content: { blob: "ref" },
      space: "ts-1",
    });
    client.fetchMarkup = vi.fn().mockResolvedValue("hello world foo");
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_edit_document");
    const result = await tool.execute(
      "tc1",
      { document: "d-1", old_text: "world", new_text: "earth" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.fetchMarkup).toHaveBeenCalledTimes(1);
    expect(client.updateMarkup).toHaveBeenCalledWith(
      DOCUMENT_CLASS,
      "d-1",
      "content",
      "hello earth foo",
      "markdown",
    );
  });

  it("edit_document search not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "d-1",
      title: "Doc",
      content: { blob: "ref" },
      space: "ts-1",
    });
    client.fetchMarkup = vi.fn().mockResolvedValue("hello world");
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_edit_document");
    const result = await tool.execute(
      "tc1",
      { document: "d-1", old_text: "nonexistent", new_text: "x" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateMarkup).not.toHaveBeenCalled();
  });

  it("edit_document content + old_text mutual exclusive → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "d-1", content: {} });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_edit_document");
    const result = await tool.execute(
      "tc1",
      { document: "d-1", content: "x", old_text: "a", new_text: "b" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
  });

  it("delete_document → removeDoc DOCUMENT_CLASS (destructive needs confirm)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "d-1",
      title: "Doc",
      space: "ts-1",
      _class: DOCUMENT_CLASS,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_delete_document");
    const result = await tool.execute(
      "tc1",
      { document: "d-1" },
      undefined,
      undefined,
      ctxConfirmed,
    );

    expect(result.isError).toBeUndefined();
    expect(client.removeDoc).toHaveBeenCalledTimes(1);
  });
});
