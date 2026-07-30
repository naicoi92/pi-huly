// T-66 (2026-07-28): document-snapshots domain tests — RE-ENABLED.
// DOCUMENT_SNAPSHOT_CLASS registered trong document plugin() block (verified
// vs trusted huly-mcp v0.45). Snapshot content = MarkupBlobRef → fetchMarkup.

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
import { DOCUMENT_SNAPSHOT_CLASS } from "../_class-refs.js";

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
    fetchMarkup: vi.fn().mockResolvedValue("# snapshot content"),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-66: document-snapshots ENABLED (DOCUMENT_SNAPSHOT_CLASS)", () => {
  it("list_document_snapshots → sort createdOn Desc + output fields (no modifiedBy) #120", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([
      { _id: "s-2", title: "v2", parent: "doc-1", createdOn: 2000, modifiedOn: 2001 },
      { _id: "s-1", title: "v1", parent: "doc-1", createdOn: 1000, modifiedOn: 1001 },
    ]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_document_snapshots");
    const result = await tool.execute("tc1", { document: "doc-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    // T-85: findAll với sort createdOn Descending (newest-first).
    const findCall = client.findAll.mock.calls[0];
    expect(findCall?.[0]).toBe(DOCUMENT_SNAPSHOT_CLASS);
    expect(findCall?.[1]).toMatchObject({ attachedTo: "doc-1" });
    expect(findCall?.[2]).toMatchObject({ sort: { createdOn: -1 } });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("2 snapshot");
    // T-99 (#145): output fields — _id (KHÔNG snapshotId) + documentId/title/...
    const snaps = (result as { details?: { snapshots?: unknown[] } }).details?.snapshots ?? [];
    expect(snaps[0]).toMatchObject({
      _id: "s-2",
      documentId: "doc-1",
      title: "v2",
      parentDocumentId: "doc-1",
      createdOn: 2000,
      modifiedOn: 2001,
    });
    // modifiedBy KHÔNG còn (fake field trusted không có).
    expect(JSON.stringify(snaps[0])).not.toContain("modifiedBy");
  });

  it("get_document_snapshot → findOne DOCUMENT_SNAPSHOT_CLASS + fetchMarkup + output fields #120", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "s-1",
      attachedTo: "doc-1",
      title: "v1",
      parent: "doc-root",
      createdOn: 1000,
      modifiedOn: 1001,
      content: { blob: "ref" },
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_document_snapshot");
    const result = await tool.execute("tc1", { snapshot: "s-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.findOne).toHaveBeenCalledWith(DOCUMENT_SNAPSHOT_CLASS, { _id: "s-1" });
    expect(client.fetchMarkup).toHaveBeenCalledWith(
      DOCUMENT_SNAPSHOT_CLASS,
      "s-1",
      "content",
      { blob: "ref" },
      "markdown",
    );
    // T-99 (#145): output fields — _id (KHÔNG snapshotId)/documentId/title/...
    const details = (result as { details?: Record<string, unknown> }).details ?? {};
    expect(details).toMatchObject({
      _id: "s-1",
      documentId: "doc-1",
      title: "v1",
      parentDocumentId: "doc-root",
      createdOn: 1000,
    });
    expect(JSON.stringify(details)).not.toContain("modifiedBy");
  });

  it("get_document_snapshot not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_document_snapshot");
    const result = await tool.execute("tc1", { snapshot: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
  });

  it("get_document_snapshot no content → metadata only (no fetchMarkup)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "s-1", content: undefined });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_document_snapshot");
    const result = await tool.execute("tc1", { snapshot: "s-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    expect(client.fetchMarkup).not.toHaveBeenCalled();
  });
});
