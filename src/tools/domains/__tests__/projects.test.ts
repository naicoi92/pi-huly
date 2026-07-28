// T-67 #75: create_project tests — self-ref space + type + members + idempotent.

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
import { tools } from "../projects.js";
import { PROJECT_CLASS, CLASSIC_PROJECT_TYPE_REF } from "../_class-refs.js";

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
    createDoc: vi.fn().mockResolvedValue("proj-id-1"),
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

describe("T-67 #75: create_project self-ref space + type + idempotent", () => {
  it("idempotent — findOne by identifier trước, exists → return existing (KHÔNG createDoc)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "existing-1", name: "Old" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_project");
    const result = await tool.execute(
      "tc1",
      { name: "New", identifier: "PD" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.createDoc).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ identifier: "PD", idempotent: true });
  });

  it("create → self-ref space (projectId) + type + members + sequence:0", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined); // not exists
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_project");
    const result = await tool.execute(
      "tc1",
      { name: "MyProj", identifier: "MP" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.createDoc).toHaveBeenCalledTimes(1);
    const call = client.createDoc.mock.calls[0];
    expect(call?.[0]).toBe(PROJECT_CLASS);
    // space = id (self-ref) — KHÔNG workspace handle
    expect(call?.[1]).toBe(call?.[3]);
    const attrs = call?.[2] as Record<string, unknown>;
    expect(attrs.type).toBe(CLASSIC_PROJECT_TYPE_REF);
    expect(attrs.members).toEqual(["u1"]);
    expect(attrs.owners).toEqual(["u1"]);
    expect(attrs.sequence).toBe(0);
    expect(attrs.defaultTimeReportDay).toBe("CurrentWorkDay");
  });
});
