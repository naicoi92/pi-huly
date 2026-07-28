// Test T-58 #43 labels domain — honest-unavailable (Label deprecated).
// DEEP-AUDIT 12 packages @0.7.423: view:class:Label 0 match → deprecated.
// Huly dùng tags:class:TagElement. All 4 label tools → isError + redirect tag tools.

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
import { tools } from "../labels.js";

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
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-58 #43: labels honest-unavailable (deprecated — dùng tag tools)", () => {
  const toolNames = [
    "huly_list_labels",
    "huly_create_label",
    "huly_update_label",
    "huly_delete_label",
  ];

  for (const name of toolNames) {
    it(`${name} → isError + KHÔNG gọi client CRUD (Label deprecated)`, async () => {
      const client = makeClient();
      vi.mocked(getClient).mockResolvedValue(client as never);

      const tool = findTool(name);
      const params =
        name === "huly_list_labels"
          ? {}
          : name === "huly_create_label"
            ? { title: "Bug" }
            : { label: "lbl-1" };
      const result = await tool.execute("tc1", params, undefined, undefined, ctx);

      expect(result.isError).toBe(true);
      // KHÔNG gọi CRUD — Label class deprecated, tránh domain not found error
      expect(client.findAll).not.toHaveBeenCalled();
      expect(client.createDoc).not.toHaveBeenCalled();
      expect(client.updateDoc).not.toHaveBeenCalled();
      expect(client.removeDoc).not.toHaveBeenCalled();
    });
  }

  it("message mention deprecated + redirect tag tools", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_labels");
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/KHÔNG khả dụng|deprecated/i);
    expect(text).toContain("view:class:Label");
    expect(text).toContain("tags:class:TagElement");
    expect(text).toContain("huly_list_tags");
  });

  it("details reason=deprecated + useTool redirect", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_label");
    const result = await tool.execute("tc1", { title: "X" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({
      reason: "deprecated",
      useClass: "tags:class:TagElement",
      useTool: "huly_create_tag",
    });
  });
});
