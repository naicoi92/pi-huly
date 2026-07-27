// Test T-33 index.ts factory — register tools + command + session_shutdown hook.
// Strategy: mock ExtensionAPI (capture registerTool/registerCommand/on calls),
// invoke setup(), assert counts + hooks attached.

import { beforeEach, describe, expect, it, vi } from "vitest";
import setup, { __resetSetupGuardForTests } from "../index.js";
import { allTools } from "../tools/register.js";
import { closeAll } from "../client/pool.js";

// Mock pool.closeAll để verify session_shutdown gọi nó (KHÔNG close thật).
vi.mock("../client/pool.js", () => ({
  closeAll: vi.fn(() => Promise.resolve()),
  // pool export khác không dùng trong test này — skip
}));

/** Minimal ExtensionAPI stub capturing registerTool/registerCommand/on. */
function makePiStub() {
  const registeredTools: Array<{ name: string; renderResult?: unknown }> = [];
  const registeredCommands: string[] = [];
  const eventHandlers = new Map<string, ((...args: never[]) => unknown)[]>();

  const pi = {
    registerTool(tool: { name: string; renderResult?: unknown }) {
      registeredTools.push(tool);
    },
    registerCommand(name: string) {
      registeredCommands.push(name);
    },
    on(event: string, handler: (...args: never[]) => unknown) {
      const list = eventHandlers.get(event) ?? [];
      list.push(handler);
      eventHandlers.set(event, list);
    },
  };
  return {
    pi: pi as never as Parameters<typeof setup>[0],
    registeredTools,
    registeredCommands,
    eventHandlers,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetSetupGuardForTests(); // reset module guard (test isolation)
});

describe("setup() factory — T-33", () => {
  it("registers all 102 tools", () => {
    const { pi, registeredTools } = makePiStub();
    const count = setup(pi);
    expect(registeredTools).toHaveLength(allTools.length);
    expect(count).toBe(allTools.length);
    expect(count).toBe(102);
  });

  it("registers /huly command", () => {
    const { pi, registeredCommands } = makePiStub();
    setup(pi);
    expect(registeredCommands).toContain("huly");
  });

  it("registers session_shutdown handler", () => {
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    expect(eventHandlers.has("session_shutdown")).toBe(true);
    expect(eventHandlers.get("session_shutdown")).toHaveLength(1);
  });

  it("session_shutdown handler calls closeAll (pool cleanup FR-12)", async () => {
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_shutdown")![0]!;
    // Truyền event/ctx thực-ish để anchor contract (handler ignore nhưng test rõ shape)
    await handler({ type: "session_shutdown" } as never, {} as never);
    expect(closeAll).toHaveBeenCalledTimes(1);
  });

  it("session_shutdown handler swallows closeAll error (no throw)", async () => {
    vi.mocked(closeAll).mockRejectedValueOnce(new Error("close failed"));
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_shutdown")![0]!;
    // KHÔNG throw — shutdown cleanup không block exit
    await expect(
      handler({ type: "session_shutdown" } as never, {} as never),
    ).resolves.toBeUndefined();
    expect(closeAll).toHaveBeenCalledTimes(1);
  });

  it("attaches render hooks to 3 high-value tools", () => {
    const { pi, registeredTools } = makePiStub();
    setup(pi);
    const names = ["huly_get_issue", "huly_list_issues", "huly_get_document"];
    for (const name of names) {
      const tool = registeredTools.find((t) => t.name === name);
      expect(tool, `tool ${name} registered`).toBeDefined();
      expect(tool!.renderResult, `renderResult attached to ${name}`).toBeTypeOf("function");
    }
  });

  it("does NOT attach render hooks to other tools (pi fallback default)", () => {
    const { pi, registeredTools } = makePiStub();
    setup(pi);
    const noHook = registeredTools.filter((t) => t.renderResult === undefined);
    // 3 tools có hook → rest (102 - 3 = 99) KHÔNG có
    expect(noHook.length).toBe(102 - 3);
  });

  it("does NOT mutate module-level allTools (shallow copy in factory)", () => {
    // attachRenderHooks dùng shallow copy → allTools global KHÔNG bị attach renderResult
    const { pi } = makePiStub();
    setup(pi);
    const mutated = allTools.filter((t) => "renderResult" in t && t.renderResult !== undefined);
    expect(mutated).toHaveLength(0);
  });

  it("all tool names prefixed huly_ (FR-02 D5)", () => {
    const { pi, registeredTools } = makePiStub();
    setup(pi);
    for (const tool of registeredTools) {
      expect(tool.name).toMatch(/^huly_/);
    }
  });

  it("idempotent: setup() twice → 2nd call no-op (guard tránh dev-reload leak)", () => {
    // Factory có module-level guard: setup() lần 2 return 0, KHÔNG register thêm.
    // Tránh leak session_shutdown handler + /huly command khi dev-reload.
    const { pi, registeredTools, eventHandlers, registeredCommands } = makePiStub();
    const first = setup(pi);
    const second = setup(pi);
    expect(first).toBe(102);
    expect(second).toBe(0); // no-op
    // Chỉ 1 lần registration (KHÔNG nhân đôi)
    expect(registeredTools).toHaveLength(102);
    expect(registeredCommands).toHaveLength(1);
    expect(eventHandlers.get("session_shutdown")).toHaveLength(1);
  });
});
