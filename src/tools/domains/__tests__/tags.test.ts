// Test T-52 #42 cho tags domain — attach_tag FK validate + shape fix.
// Cover: tag not found → isError; tag exists → $push TagReference object shape
// (KHÔNG raw string); idempotent dùng ref resolved (KHÔNG raw string).

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
import { tools } from "../tags.js";

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
    createDoc: vi.fn().mockResolvedValue("tag-id-1"),
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

describe("T-52 #42: attach_tag FK validate + TagReference shape", () => {
  it("tag KHÔNG tồn tại → isError + updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", tags: [] })
      .mockResolvedValueOnce(undefined); // tag not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_attach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/tag.*not found/i);
    expect(text).toMatch(/create_tag/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("tag tồn tại → $push TagReference object shape {tag, title, color} (KHÔNG raw string)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1", tags: [] })
      .mockResolvedValueOnce({ _id: "tag-1", title: "bug", color: "#f00" }); // tag
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_attach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.updateDoc).toHaveBeenCalledTimes(1);
    const call = client.updateDoc.mock.calls[0];
    const ops = call?.[3] as { $push: { tags: { tag: string; title: string; color: string } } };
    // TagReference object shape (KHÔNG raw string idRef)
    expect(ops.$push.tags).toMatchObject({
      tag: "tag-1",
      title: "bug",
      color: "#f00",
    });
  });

  it("tag đã có trên issue (idempotent ref resolved) → no-op, KHÔNG re-push duplicate", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "i1",
        space: "sp1",
        identifier: "PD-1",
        tags: [{ tag: "tag-1", title: "bug", color: "#f00" }], // đã có
      })
      .mockResolvedValueOnce({ _id: "tag-1", title: "bug", color: "#f00" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_attach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/already|no-op|idempotent/i);
    // updateDoc KHÔNG gọi (idempotent dùng ref resolved match)
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});
