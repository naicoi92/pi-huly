// Test T-54 #58 cho documents domain — create_teamspace honest-unavailable.
// Reality-checker STRONG confirm (2026-07-28): `core:class:Space` là base abstract
// KHÔNG có SpaceTypeDescriptor → createDoc tạo space vô hình. KHÔNG có class
// "Teamspace" runtime. Tool honest-unavailable cho đến khi T-58 verify class thật.

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

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

// ctx cho destructive tool (delete_document) — hasUI=true + confirm=yes.
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
    createDoc: vi.fn().mockResolvedValue("space-id-1"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-54 #58: create_teamspace honest-unavailable (SpaceType ref inaccessible)", () => {
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
    // createDoc KHÔNG gọi — tránh tạo space lỗi (thiếu type field)
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("error message mention drive:class:Drive + SpaceType inaccessible + recovery via Huly UI", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_teamspace");
    const result = await tool.execute("tc1", { name: "Test Space" }, undefined, undefined, ctx);

    const text = result.content[0]?.text ?? "";
    // T-58 audit: Documents Teamspace thật = drive:class:Drive
    expect(text).toContain("drive:class:Drive");
    expect(text).toMatch(/SpaceType|type.*Ref/i);
    expect(text).toMatch(/Huly UI/i);
    expect(text).toContain("huly_list_teamspaces");
  });

  it("details có reason=spacetype_ref_inaccessible + candidateClass=drive:class:Drive", async () => {
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
      reason: "spacetype_ref_inaccessible",
      candidateClass: "drive:class:Drive",
      missingField: "type (Ref<SpaceType>)",
      name: "X",
    });
  });
});

describe("T-54 #58: list/get_teamspaces vẫn OK (read path qua SPACE_CLASS)", () => {
  // findAll/findOne trên base class Space trả subclasses qua inheritance — read
  // path KHÔNG affected (chỉ create path fail). Verify regression guard.
  it("list_teamspaces → findAll SPACE_CLASS (read OK)", async () => {
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
    expect(client.findAll).toHaveBeenCalledTimes(1);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1 teamspace");
  });

  it("get_teamspace → findOne SPACE_CLASS (read OK)", async () => {
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
    expect(client.findOne).toHaveBeenCalledTimes(1);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Design");
  });
});

// T-60 #55 #64: 5 document CRUD tools honest-unavailable (interface orphan).
// tracker:class:Document interface exists NHƯNG KHÔNG register trong plugin()
// class block → runtime fail. Cùng verdict T-60 search domain removal.
describe("T-60: document CRUD honest-unavailable (Document interface orphan)", () => {
  const docTools = [
    "huly_list_documents",
    "huly_get_document",
    "huly_create_document",
    "huly_edit_document",
    "huly_delete_document",
  ];

  for (const name of docTools) {
    it(`${name} → isError + KHÔNG gọi client CRUD (Document orphan)`, async () => {
      const client = makeClient();
      vi.mocked(getClient).mockResolvedValue(client as never);

      const tool = findTool(name);
      const params =
        name === "huly_list_documents"
          ? { teamspace: "ts-1" }
          : name === "huly_create_document"
            ? { teamspace: "ts-1", title: "Doc" }
            : { document: "doc-1" };
      // delete_document needs confirm (destructive)
      const useCtx = name === "huly_delete_document" ? ctxConfirmed : ctx;
      const result = await tool.execute("tc1", params, undefined, undefined, useCtx);

      expect(result.isError).toBe(true);
      expect(client.findAll).not.toHaveBeenCalled();
      expect(client.findOne).not.toHaveBeenCalled();
      expect(client.createDoc).not.toHaveBeenCalled();
      expect(client.updateDoc).not.toHaveBeenCalled();
      expect(client.removeDoc).not.toHaveBeenCalled();
      expect(result.details).toMatchObject({
        reason: "interface_orphan",
        useClass: "tracker:class:Document",
      });
    });
  }

  it("message mention interface orphan + redirect Huly UI", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_documents");
    const result = await tool.execute("tc1", { teamspace: "ts-1" }, undefined, undefined, ctx);

    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/KHÔNG khả dụng|interface orphan/i);
    expect(text).toContain("tracker:class:Document");
    expect(text).toMatch(/Huly UI/i);
  });
});
