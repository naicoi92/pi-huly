// Test T-33 index.ts factory — register tools + command + session_shutdown hook.
// Strategy: mock ExtensionAPI (capture registerTool/registerCommand/on calls),
// invoke setup(), assert counts + hooks attached.

import { beforeEach, describe, expect, it, vi } from "vitest";
import setup from "../index.js";
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
    await handler();
    expect(closeAll).toHaveBeenCalledTimes(1);
  });

  it("session_shutdown handler swallows closeAll error (no throw)", async () => {
    vi.mocked(closeAll).mockRejectedValueOnce(new Error("close failed"));
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_shutdown")![0]!;
    // KHÔNG throw — shutdown cleanup không block exit
    await expect(handler()).resolves.toBeUndefined();
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

  it("all tool names prefixed huly_ (FR-02 D5)", () => {
    const { pi, registeredTools } = makePiStub();
    setup(pi);
    for (const tool of registeredTools) {
      expect(tool.name).toMatch(/^huly_/);
    }
  });

  it("idempotent: setup() twice registers tools twice (pi guard ngoài)", () => {
    // Factory KHÔNG tự guard — caller (pi) đảm bảo load 1 lần. Verify behavior rõ.
    const { pi, registeredTools } = makePiStub();
    setup(pi);
    setup(pi);
    // 2 lần → 204 registrations (pi thực guard load 1 lần ngoài factory)
    expect(registeredTools).toHaveLength(102 * 2);
  });
});
