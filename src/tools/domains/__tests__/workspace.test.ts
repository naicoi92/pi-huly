// Test T-14 workspace/profile domain (5 tools) — schema + handler delegate.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock pool.getClient + resolver (builder sẽ resolve binding trước handler).
vi.mock("../../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../../config/resolver.js", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
  resolveProject: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../client/errors.js", () => ({
  HulyError: class extends Error {
    readonly class: string;
    constructor(c: string, m: string) {
      super(m);
      this.class = c;
    }
  },
  mapError: vi.fn((e: unknown) => ({
    class: "Internal",
    message: String(e),
  })),
  sanitize: vi.fn((s: string) => s),
  LEAK_PATTERNS: [],
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../workspace.js";

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn(),
    findOne: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue(undefined),
  };
}

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(makeClient() as never);
});

describe("workspace domain — 5 tools registered", () => {
  it("exports 5 tools với huly_ prefix", () => {
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "huly_get_user_profile",
        "huly_get_workspace_info",
        "huly_list_workspace_members",
        "huly_list_workspaces",
        "huly_update_user_profile",
      ].sort(),
    );
  });
});

describe("huly_get_workspace_info", () => {
  it("returns resolved workspace id", async () => {
    const tool = tools.find((t) => t.name === "huly_get_workspace_info")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(result.content[0]?.text).toBe("Workspace: ws1");
    expect(result.details).toEqual({ workspace: "ws1" });
  });
});

describe("huly_list_workspaces", () => {
  it("queries Person + returns count", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([
      { _id: "p1", name: "Alice" },
      { _id: "p2", name: "Bob" },
    ]);
    vi.mocked(getClient).mockResolvedValueOnce(client as never);

    const tool = tools.find((t) => t.name === "huly_list_workspaces")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(client.findAll).toHaveBeenCalledWith("contact:class:Person", {}, { limit: 50 });
    // T-40: non-TUI mode (hasUI=false) append details → content text để LLM thấy
    // member list (trước đây chỉ thấy count string). Content gốc + array data.
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Found 2 workspace member(s).");
    expect(text).toContain("Alice");
    expect(text).toContain("Bob");
    expect(text).toContain("p1");
  });

  it("limit param override default", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValueOnce(client as never);

    const tool = tools.find((t) => t.name === "huly_list_workspaces")!;
    await tool.execute("tc1", { limit: 10 }, undefined, undefined, ctx);
    expect(client.findAll).toHaveBeenCalledWith("contact:class:Person", {}, { limit: 10 });
  });
});

describe("huly_list_workspace_members", () => {
  it("queries Employee + returns members", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([{ _id: "e1", name: "Alice", email: "a@x.com" }]);
    vi.mocked(getClient).mockResolvedValueOnce(client as never);

    const tool = tools.find((t) => t.name === "huly_list_workspace_members")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(client.findAll).toHaveBeenCalledWith("contact:mixin:Employee", {}, { limit: 50 });
    expect(result.details).toMatchObject({ count: 1 });
  });
});

describe("huly_get_user_profile", () => {
  it("returns current user passthrough", async () => {
    const tool = tools.find((t) => t.name === "huly_get_user_profile")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(result.content[0]?.text).toContain("User");
    expect(result.content[0]?.text).toContain("u@x.com");
    expect(result.details).toEqual({
      user: { id: "u1", name: "User", email: "u@x.com" },
    });
  });
});

describe("huly_update_user_profile", () => {
  it("no fields → no update", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(client.updateDoc).not.toHaveBeenCalled();
    expect(result.details).toEqual({ updated: false });
  });

  // T-50 #40: lookup Person.space trước updateDoc — KHÔNG dùng currentUser.id
  // làm space (bug gốc: space=objectId=currentUser.id → TxUpdateDoc skip).
  it("name provided → lookup Person.space → updateDoc với space ĐÚNG (không phải currentUser.id)", async () => {
    const client = makeClient();
    // findOne trả Person record có space thật (vd "ws1-person-space")
    client.findOne = vi.fn().mockResolvedValue({ _id: "u1", space: "ws1-person-space" });
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", { name: "New Name" }, undefined, undefined, ctx);

    // findOne được gọi query Person by _id
    expect(client.findOne).toHaveBeenCalledWith("contact:class:Person", { _id: "u1" });
    // updateDoc: space = person.space (KHÔNG phải currentUser.id), objectId = person._id
    expect(client.updateDoc).toHaveBeenCalledWith(
      "contact:class:Person",
      "ws1-person-space",
      "u1",
      { name: "New Name" },
    );
    expect(result.details).toEqual({ updated: true, fields: ["name"] });
  });

  // T-50 #40: Person không tìm thấy → isError rõ ràng, KHÔNG âm thầm gửi
  // TxUpdateDoc sai (space sai → server skip → update KHÔNG persist silently).
  it("Person not found → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined); // Person not found
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", { name: "New Name" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const details = result.details as { userId?: string };
    expect(details.userId).toBe("u1");
    // updateDoc KHÔNG gọi (validate failed)
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  // T-50 review fix: Person record tồn tại nhưng space/_id missing (schema
  // drift) → isError, KHÔNG gửi updateDoc với undefined (silent no-op lại).
  it("Person record missing space field (schema drift) → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    // Person có _id nhưng KHÔNG có space field
    client.findOne = vi.fn().mockResolvedValue({ _id: "u1" /* space missing */ });
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", { name: "New Name" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/schema drift/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});
