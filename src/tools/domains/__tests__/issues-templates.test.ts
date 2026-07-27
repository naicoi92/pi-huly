// Test T-51 #41 cho issues-templates domain (silent space fallback fix).
// T-52 không touch tool này FK-wise (chỉ space fallback).

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
  markupToMd: vi.fn(),
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../issues-templates.js";

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
    createDoc: vi.fn().mockResolvedValue("tpl-id-1"),
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

describe("T-51 #41: create_template project space resolve", () => {
  it("project null → isError + createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_template");
    const result = await tool.execute("tc1", { title: "Bug template" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
    expect(text).toMatch(/huly init/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("project exists → createDoc dùng project.space", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "proj-1", space: "tpl-space" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_template");
    const result = await tool.execute("tc1", { title: "Bug template" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const call = client.createDoc.mock.calls[0];
    expect(call?.[1]).toBe("tpl-space");
    expect(call?.[1]).not.toBe("ws1");
  });
});

describe("T-51 #41: create_issue_from_template (2 lookup paths)", () => {
  it("template not found → isError (regression)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/template.*not found/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("template exists + project null → isError MỚI + createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "tpl-123", title: "Bug" })
      .mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/project.*not found/i);
    expect(text).toMatch(/huly init/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("happy path (cả 2 tồn tại) → createDoc dùng project.space", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "tpl-123", title: "Bug", description: "{}" })
      .mockResolvedValueOnce({ _id: "proj-1", space: "happy-space" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const call = client.createDoc.mock.calls[0];
    expect(call?.[1]).toBe("happy-space");
    expect(call?.[1]).not.toBe("ws1");
  });
});
