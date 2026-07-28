// Test T-58 #43 document-snapshots domain — honest-unavailable (deprecated).
// DEEP-AUDIT 12 packages @0.7.423: document:class:DocumentSnapshot 0 match.
// All 2 snapshot tools → isError + redirect Huly UI Activity panel.

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
import { tools } from "../document-snapshots.js";

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
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-58 #43: document-snapshots honest-unavailable (deprecated)", () => {
  it("list_document_snapshots → isError + KHÔNG gọi findAll", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_document_snapshots");
    const result = await tool.execute("tc1", { document: "doc-1" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.findAll).not.toHaveBeenCalled();
  });

  it("get_document_snapshot → isError + KHÔNG gọi findOne", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_document_snapshot");
    const result = await tool.execute("tc1", { snapshot: "snap-1" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.findOne).not.toHaveBeenCalled();
  });

  it("message mention deprecated + redirect Huly UI / get_document", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_document_snapshots");
    const result = await tool.execute("tc1", { document: "d1" }, undefined, undefined, ctx);

    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/KHÔNG khả dụng|deprecated/i);
    expect(text).toContain("document:class:DocumentSnapshot");
    expect(text).toMatch(/Huly UI|Activity/i);
  });

  it("details reason=deprecated", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_document_snapshot");
    const result = await tool.execute("tc1", { snapshot: "s1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({
      reason: "deprecated",
      useClass: "document:class:DocumentSnapshot",
    });
  });
});
