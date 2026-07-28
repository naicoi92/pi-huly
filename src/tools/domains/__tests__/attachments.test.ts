// T-75: attachment blob upload/download (storageClient wired).

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
import { tools } from "../attachments.js";
import { ATTACHMENT_CLASS } from "../_class-refs.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    addCollection: vi.fn().mockResolvedValue("att-id"),
    uploadBlob: vi.fn().mockResolvedValue({ blobId: "blob-1", size: 100 }),
    getBlob: vi.fn().mockResolvedValue(Buffer.from("hello")),
  };
}
function findTool(name: string) {
  const t = tools.find((x) => x.name === name);
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

describe("T-75: add_attachment uploadBlob + addCollection {file,size,type,lastModified}", () => {
  it("upload base64 → blob → addCollection với file=blobId, type (KHÔNG contentType/data)", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_add_attachment").execute(
      "tc1",
      { attachedTo: "i1", filename: "f.txt", contentType: "text/plain", data: "aGVsbG8=" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBeUndefined();
    expect(client.uploadBlob).toHaveBeenCalledWith("f.txt", expect.any(Buffer), "text/plain");
    const call = client.addCollection.mock.calls[0];
    expect(call?.[0]).toBe(ATTACHMENT_CLASS);
    expect(call?.[4]).toBe("attachments");
    const attrs = call?.[5] as Record<string, unknown>;
    expect(attrs.file).toBe("blob-1"); // Ref<Blob>
    expect(attrs.size).toBe(100);
    expect(attrs.type).toBe("text/plain"); // KHÔNG contentType
    expect(attrs.data).toBeUndefined();
    expect(attrs.lastModified).toEqual(expect.any(Number));
  });

  it("strips data: URL prefix", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    await findTool("huly_add_attachment").execute(
      "tc1",
      {
        attachedTo: "i1",
        filename: "f.png",
        contentType: "image/png",
        data: "data:image/png;base64,aGVsbG8=",
      },
      undefined,
      undefined,
      ctx,
    );
    // uploadBlob called with buffer from "aGVsbG8=" (prefix stripped)
    const buf = client.uploadBlob.mock.calls[0]?.[1] as Buffer;
    expect(buf.toString("base64")).toBe("aGVsbG8=");
  });

  it("missing data → isError", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_add_attachment").execute(
      "tc1",
      { attachedTo: "i1", filename: "f.txt", contentType: "text/plain" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(client.uploadBlob).not.toHaveBeenCalled();
  });
});

describe("T-75: add_issue_attachment uploadBlob + addCollection", () => {
  it("upload + attach to issue", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "i1", space: "sp1", identifier: "PD-1" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_add_issue_attachment").execute(
      "tc1",
      { identifier: "PD-1", filename: "f.txt", contentType: "text/plain", data: "aGVsbG8=" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBeUndefined();
    expect(client.uploadBlob).toHaveBeenCalled();
    const attrs = client.addCollection.mock.calls[0]?.[5] as Record<string, unknown>;
    expect(attrs.file).toBe("blob-1");
    expect(attrs.type).toBe("text/plain");
  });
});

describe("T-75: download_attachment getBlob → base64", () => {
  it("download via getBlob(att.file) → base64", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValue({ _id: "a1", name: "f.txt", file: "blob-1", type: "text/plain", size: 5 });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_download_attachment").execute(
      "tc1",
      { attachment: "a1" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBeUndefined();
    expect(client.getBlob).toHaveBeenCalledWith("blob-1");
    expect(r.details).toMatchObject({ name: "f.txt", type: "text/plain", size: 5 });
    expect(r.details.data).toBe(Buffer.from("hello").toString("base64"));
  });

  it("attachment without file ref → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "a1", name: "f", file: undefined });
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_download_attachment").execute(
      "tc1",
      { attachment: "a1" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(client.getBlob).not.toHaveBeenCalled();
  });
});

describe("T-75: list_attachments reads field type (KHÔNG contentType)", () => {
  it("list returns type field", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "i1", space: "sp1", identifier: "PD-1" });
    client.findAll = vi
      .fn()
      .mockResolvedValue([{ _id: "a1", name: "f", type: "text/plain", size: 5 }]);
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_list_attachments").execute(
      "tc1",
      { identifier: "PD-1" },
      undefined,
      undefined,
      ctx,
    );
    const atts = r.details.attachments as Array<Record<string, unknown>>;
    expect(atts[0].type).toBe("text/plain");
    expect(atts[0].contentType).toBeUndefined();
  });
});
