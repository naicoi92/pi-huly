// Test T-33 index.ts factory — register tools + command + session_shutdown hook.
// Strategy: mock ExtensionAPI (capture registerTool/registerCommand/on calls),
// invoke setup(), assert counts + hooks attached.

import { beforeEach, describe, expect, it, vi } from "vitest";
import setup, { __resetSetupGuardForTests } from "../index.js";
import { allTools } from "../tools/register.js";
import { closeAll, getClient } from "../client/pool.js";
import { loadCredentials } from "../config/credentials.js";

// Mock pool.closeAll + getClient để verify session_shutdown + warm call (KHÔNG thật).
vi.mock("../client/pool.js", () => ({
  closeAll: vi.fn(() => Promise.resolve()),
  getClient: vi.fn(() => Promise.resolve({})),
}));

// Mock credentials loader để test T-55 warm pool (control empty vs populated).
vi.mock("../config/credentials.js", () => ({
  loadCredentials: vi.fn(() => Promise.resolve({ version: 1, workspaces: {} })),
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
  // Reset loadCredentials về default (empty workspaces) — clearAllMocks KHÔNG
  // xóa mockResolvedValueOnce queue, phải reset implementation explicit để test
  // isolation (test T-55 set Once cho workspace cụ thể, tránh leak sang test sau).
  vi.mocked(loadCredentials).mockResolvedValue({ version: 1, workspaces: {} });
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

// T-55 #59: session_start → warm pool fire-and-forget (fix first-call failure).
describe("setup() — T-55 pool warm at session_start", () => {
  it("registers session_start handler", () => {
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    expect(eventHandlers.has("session_start")).toBe(true);
  });

  it("session_start reason=startup + credentials có workspace → warm getClient 1 lần", async () => {
    // Mock credentials trả 1 workspace → warm phải gọi getClient
    vi.mocked(loadCredentials).mockResolvedValueOnce({
      version: 1,
      workspaces: { "ws-default": { url: "https://h", workspace: "w", token: "t" } },
    });
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_start")![0]!;
    // Fire-and-forget — handler KHÔNG await. Flush microtask để warm chạy xong.
    handler({ type: "session_start", reason: "startup" } as never, {} as never);
    await vi.waitFor(() => expect(getClient).toHaveBeenCalledWith("ws-default"));
    expect(getClient).toHaveBeenCalledTimes(1);
    // Drain remaining microtasks (warmPool await getClient resolve) để tránh leak
    // sang test sau (fire-and-forget promise chưa settle khi test này exit).
    await new Promise((r) => setTimeout(r, 10));
  });

  it("session_start reason=resume → warm (tiếp tục session trước)", async () => {
    vi.mocked(loadCredentials).mockResolvedValueOnce({
      version: 1,
      workspaces: { "ws-resume": { url: "https://h", workspace: "w", token: "t" } },
    });
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_start")![0]!;
    handler({ type: "session_start", reason: "resume" } as never, {} as never);
    await vi.waitFor(() => expect(getClient).toHaveBeenCalledWith("ws-resume"));
    await new Promise((r) => setTimeout(r, 10));
  });

  it("session_start reason=reload → KHÔNG warm (pool dev-reload còn reuse)", async () => {
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_start")![0]!;
    handler({ type: "session_start", reason: "reload" } as never, {} as never);
    // Đợi một tick đảm bảo warm KHÔNG fire (reason không hợp lệ)
    await new Promise((r) => setTimeout(r, 20));
    expect(getClient).not.toHaveBeenCalled();
  });

  it("session_start reason=new/fork → KHÔNG warm (user chủ động tạo session)", async () => {
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_start")![0]!;
    handler({ type: "session_start", reason: "new" } as never, {} as never);
    handler({ type: "session_start", reason: "fork" } as never, {} as never);
    await new Promise((r) => setTimeout(r, 20));
    expect(getClient).not.toHaveBeenCalled();
  });

  it("credentials rỗng (chưa init) → warm no-op im lặng (KHÔNG gọi getClient)", async () => {
    // beforeEach đã reset loadCredentials về default empty — verify warm skip.
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_start")![0]!;
    handler({ type: "session_start", reason: "startup" } as never, {} as never);
    await new Promise((r) => setTimeout(r, 20));
    expect(getClient).not.toHaveBeenCalled();
  });

  it("warm fail (getClient throw) → swallow, KHÔNG crash session_start handler", async () => {
    vi.mocked(loadCredentials).mockResolvedValueOnce({
      version: 1,
      workspaces: { "ws-fail": { url: "https://h", workspace: "w", token: "t" } },
    });
    vi.mocked(getClient).mockRejectedValueOnce(new Error("connect failed"));
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("session_start")![0]!;
    // Fire-and-forget swallow — handler return ngay (void warmPool), KHÔNG throw.
    // Rejected promise bên trong warmPool được catch → KHÔNG unhandled rejection.
    expect(
      handler({ type: "session_start", reason: "startup" } as never, {} as never),
    ).toBeUndefined();
    // Flush microtask + ensure no unhandled rejection
    await new Promise((r) => setTimeout(r, 20));
    expect(getClient).toHaveBeenCalledTimes(1);
  });
});

// T-56 #60: tool_execution_start → log tool name + args (debug observability).
describe("setup() — T-56 debug log tool calls", () => {
  it("registers tool_execution_start handler", () => {
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    expect(eventHandlers.has("tool_execution_start")).toBe(true);
  });

  it("huly_ tool → log [huly_<tool>] args: <json> ra stderr", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("tool_execution_start")![0]!;
    handler(
      {
        type: "tool_execution_start",
        toolCallId: "tc1",
        toolName: "huly_list_issues",
        args: { workspace: "ws1", limit: 10 },
      } as never,
      {} as never,
    );
    expect(errSpy).toHaveBeenCalledTimes(1);
    const logged = errSpy.mock.calls[0]![0] as string;
    expect(logged).toContain("[huly_list_issues]");
    expect(logged).toContain("args:");
    expect(logged).toContain('"workspace":"ws1"');
    expect(logged).toContain('"limit":10');
    errSpy.mockRestore();
  });

  it("built-in tool (không huly_ prefix) → KHÔNG log (skip)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("tool_execution_start")![0]!;
    handler(
      {
        type: "tool_execution_start",
        toolCallId: "tc2",
        toolName: "bash",
        args: { command: "ls" },
      } as never,
      {} as never,
    );
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("args JSON > 500 chars → truncate + ghi rõ total chars", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("tool_execution_start")![0]!;
    const bigArg = "x".repeat(600);
    handler(
      {
        type: "tool_execution_start",
        toolCallId: "tc3",
        toolName: "huly_create_issue",
        args: { description: bigArg },
      } as never,
      {} as never,
    );
    const logged = errSpy.mock.calls[0]![0] as string;
    expect(logged).toContain("truncated");
    expect(logged).toContain("chars total");
    errSpy.mockRestore();
  });

  it("args chứa token → sanitize strip [REDACTED] trước khi log", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("tool_execution_start")![0]!;
    handler(
      {
        type: "tool_execution_start",
        toolCallId: "tc4",
        toolName: "huly_create_document",
        args: { content: "token=ghp_A" + "B".repeat(36) },
      } as never,
      {} as never,
    );
    const logged = errSpy.mock.calls[0]![0] as string;
    expect(logged).not.toContain("ghp_");
    expect(logged).toContain("[REDACTED]");
    errSpy.mockRestore();
  });

  it("args lớn + secret ở cuối → truncate KHÔNG leak raw token (sanitize sau truncate)", () => {
    // MINOR #1/#2 regression: secret nằm ngoài vùng truncate → sanitize phải vẫn
    // strip. Trước đây sanitize trước truncate → nếu truncate cắt giữa placeholder
    // [REDACTED], phần raw token có thể lọt qua.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("tool_execution_start")![0]!;
    // Payload: 600 ký tự padding + secret ở cuối (offset ~600 > LOG_ARGS_CAP 500)
    const padding = "x".repeat(600);
    const token = "ghp_" + "C".repeat(36);
    handler(
      {
        type: "tool_execution_start",
        toolCallId: "tc6",
        toolName: "huly_create_document",
        args: { padding, secret: token },
      } as never,
      {} as never,
    );
    const logged = errSpy.mock.calls[0]![0] as string;
    expect(logged).toContain("truncated");
    // Secret raw KHÔNG leak dù nằm ngoài vùng truncate (sanitize chạy sau)
    expect(logged).not.toContain("ghp_");
    expect(logged).not.toContain("C".repeat(36));
    errSpy.mockRestore();
  });

  it("handler swallow error khi args circular (KHÔNG throw ra ngoài)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pi, eventHandlers } = makePiStub();
    setup(pi);
    const handler = eventHandlers.get("tool_execution_start")![0]!;
    // Circular reference → JSON.stringify throw
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() =>
      handler(
        {
          type: "tool_execution_start",
          toolCallId: "tc5",
          toolName: "huly_get_issue",
          args: circular,
        } as never,
        {} as never,
      ),
    ).not.toThrow();
    errSpy.mockRestore();
  });
});
