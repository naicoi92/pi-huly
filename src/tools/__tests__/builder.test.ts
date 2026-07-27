// Test T-09 defineHulyTool — single seam: prefix, resolve, getClient, error map,
// confirm gate, assignee default, handler convert.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Type } from "typebox";

// Mock dependencies BEFORE import builder.ts
vi.mock("../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../config/resolver.js", () => {
  class NeedsInitError extends Error {
    constructor(m = "needs init") {
      super(m);
      this.name = "NeedsInitError";
    }
  }
  class NeedsDisambiguationError extends Error {
    readonly matches: Array<{ id: string; url: string; workspace: string }>;
    constructor(matches: Array<{ id: string; url: string; workspace: string }>) {
      super("ambiguous");
      this.name = "NeedsDisambiguationError";
      this.matches = matches;
    }
  }
  return {
    resolveWorkspace: vi.fn(),
    resolveProject: vi.fn(),
    NeedsInitError,
    NeedsDisambiguationError,
  };
});
vi.mock("../../client/errors.js", () => {
  class HulyError extends Error {
    readonly class: string;
    constructor(c: string, m: string) {
      super(m);
      this.name = `${c}Error`;
      this.class = c;
    }
  }
  return {
    HulyError,
    mapError: vi.fn((e: unknown) => {
      if (e instanceof Error && /network/i.test(e.message)) {
        return new HulyError("Connection", `Huly unreachable: ${e.message}`);
      }
      return new HulyError("Internal", String(e));
    }),
  };
});
vi.mock("../../client/client.js", () => ({}));
vi.mock("../../client/assignee.js", () => ({
  resolveAssignee: vi.fn(),
}));

import { getClient } from "../../client/pool.js";
import { resolveWorkspace, resolveProject, NeedsInitError } from "../../config/resolver.js";
import { resolveAssignee } from "../../client/assignee.js";
import { defineHulyTool } from "../builder.js";

function makeMockClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
  };
}

function makeCtx(hasUI = false, confirmResult = true) {
  return {
    hasUI,
    cwd: "/proj",
    ui: { confirm: vi.fn().mockResolvedValue(confirmResult) },
  } as unknown as Parameters<ReturnType<typeof defineHulyTool>["execute"]>[4];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(makeMockClient() as never);
  vi.mocked(resolveWorkspace).mockResolvedValue("ws1");
  vi.mocked(resolveProject).mockResolvedValue("PD");
  vi.mocked(resolveAssignee).mockResolvedValue({
    identifier: "u@x.com",
    name: "User",
    resolved: true,
  });
});

describe("defineHulyTool — prefix huly_ (D5 FR-02)", () => {
  it("prefixes name with huly_", () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List issues",
      description: "list",
      parameters: Type.Object({}),
      handler: async () => ({ content: "ok" }),
    });
    expect(tool.name).toBe("huly_list_issues");
  });
});

describe("defineHulyTool execute — resolve + getClient + handler", () => {
  it("resolves workspace từ params.workspace", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: Type.Object({ workspace: Type.Optional(Type.String()) }),
      handler: async (_params, tctx) => ({
        content: `ws=${tctx.workspace} project=${tctx.project ?? "n/a"}`,
      }),
    });
    const result = await tool.execute(
      "tc1",
      { workspace: "explicit" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(resolveWorkspace).toHaveBeenCalledWith("explicit", { cwd: "/proj" });
    expect(result.content[0]?.text).toBe("ws=ws1 project=n/a");
  });

  it("needsProject → resolve project từ params.project", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: Type.Object({ project: Type.Optional(Type.String()) }),
      needsProject: true,
      handler: async (_params, tctx) => ({ content: `project=${tctx.project}` }),
    });
    const result = await tool.execute("tc1", { project: "WEB" }, undefined, undefined, makeCtx());
    expect(resolveProject).toHaveBeenCalledWith("WEB", { cwd: "/proj" });
    expect(result.content[0]?.text).toBe("project=PD"); // resolveProject mock returns PD regardless; project=WEB passed in
  });
});

describe("defineHulyTool execute — error mapping (FR-14)", () => {
  it("NeedsInitError → isError=true + clear hint", async () => {
    vi.mocked(resolveWorkspace).mockRejectedValueOnce(new NeedsInitError());
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: Type.Object({}),
      handler: async () => ({ content: "ok" }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/needs init/);
    expect(result.details).toMatchObject({ errorClass: "Auth", kind: "NeedsInit" });
  });

  it("handler throw → mapError → isError=true + sanitized", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: Type.Object({}),
      handler: async () => {
        throw new Error("network down");
      },
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/ConnectionError/);
    expect(result.details).toMatchObject({ errorClass: "Connection" });
  });

  it("token leak trong message → strip [REDACTED] (08 §A NFR-04)", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: Type.Object({}),
      handler: async () => {
        throw new Error("token=abc123secret456 network down");
      },
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.content[0]?.text).not.toContain("abc123secret456");
    expect(result.content[0]?.text).toContain("[REDACTED]");
  });
});

describe("defineHulyTool execute — confirm gate (FR-09 D9)", () => {
  it("destructive=true + non-TUI → auto-deny + isError cancelled", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "deleted" });
    const tool = defineHulyTool({
      name: "delete_issue",
      label: "Delete",
      description: "delete",
      parameters: Type.Object({}),
      destructive: true,
      handler,
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Cancelled/);
  });

  it("destructive=true + TUI confirm → handler chạy", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "deleted PD-1" });
    const tool = defineHulyTool({
      name: "delete_issue",
      label: "Delete",
      description: "delete",
      parameters: Type.Object({}),
      destructive: true,
      destructiveContext: () => ({ type: "issue", id: "PD-1" }),
      handler,
    });
    const ctx = makeCtx(true, true);
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(ctx.ui.confirm).toHaveBeenCalledWith("Delete issue", 'Delete issue "PD-1"?');
    expect(handler).toHaveBeenCalled();
    expect(result.content[0]?.text).toBe("deleted PD-1");
  });

  it("destructive=true + TUI deny → handler KHÔNG chạy", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "deleted" });
    const tool = defineHulyTool({
      name: "delete_issue",
      label: "Delete",
      description: "delete",
      parameters: Type.Object({}),
      destructive: true,
      handler,
    });
    const ctx = makeCtx(true, false);
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });
});

describe("defineHulyTool execute — assignee default (D15 FR-18)", () => {
  it("needsAssignee + assignee absent → resolveAssignee fill email", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "ok" });
    const tool = defineHulyTool({
      name: "create_issue",
      label: "Create",
      description: "create",
      parameters: Type.Object({
        title: Type.String(),
        assignee: Type.Optional(Type.String()),
      }),
      needsAssignee: true,
      handler,
    });
    await tool.execute("tc1", { title: "T" }, undefined, undefined, makeCtx());
    expect(resolveAssignee).toHaveBeenCalledWith(expect.anything(), undefined);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ assignee: "u@x.com" }),
      expect.anything(),
    );
  });

  it("needsAssignee + assignee present → KHÔNG resolveAssignee", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "ok" });
    const tool = defineHulyTool({
      name: "create_issue",
      label: "Create",
      description: "create",
      parameters: Type.Object({
        title: Type.String(),
        assignee: Type.Optional(Type.String()),
      }),
      needsAssignee: true,
      handler,
    });
    await tool.execute("tc1", { title: "T", assignee: "x@y.com" }, undefined, undefined, makeCtx());
    expect(resolveAssignee).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ assignee: "x@y.com" }),
      expect.anything(),
    );
  });

  it("needsAssignee + custom assigneeField 'owner' → fill owner khi absent", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "ok" });
    const tool = defineHulyTool({
      name: "log_time",
      label: "Log",
      description: "log",
      parameters: Type.Object({
        owner: Type.Optional(Type.String()),
      }),
      needsAssignee: true,
      assigneeField: "owner",
      handler,
    });
    await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "u@x.com" }),
      expect.anything(),
    );
  });
});

describe("defineHulyTool execute — result convert", () => {
  it("HulyToolResult → AgentToolResult shape (content + details)", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: Type.Object({}),
      handler: async () => ({
        content: "Found 3 issues",
        details: { count: 3, ids: ["PD-1", "PD-2", "PD-3"] },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.content).toEqual([{ type: "text", text: "Found 3 issues" }]);
    expect(result.details).toEqual({ count: 3, ids: ["PD-1", "PD-2", "PD-3"] });
    expect(result.isError).toBeUndefined();
  });

  it("HulyToolResult isError=true → propagate", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: Type.Object({}),
      handler: async () => ({ content: "Not found", isError: true }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
  });
});
