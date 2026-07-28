import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies BEFORE import pool.ts
vi.mock("../../config/credentials.js", () => ({
  getWorkspace: vi.fn(),
}));
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, transport: "ws", projects: {} }),
}));
vi.mock("../client.js", () => ({
  createHulyClient: vi.fn(),
}));

import { getWorkspace } from "../../config/credentials.js";
import { loadConfig } from "../../config/config.js";
import { createHulyClient } from "../client.js";
import {
  __clearPoolForTests,
  __MAX_WS_POOL,
  __poolSizeForTests,
  closeAll,
  getClient,
  health,
} from "../pool.js";

function makeMockClient(transport: "ws" | "rest" = "ws") {
  return {
    transport,
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    close: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn(),
    findAll: vi.fn(),
    createDoc: vi.fn(),
    updateDoc: vi.fn(),
    removeDoc: vi.fn(),
    addCollection: vi.fn(),
    createMixin: vi.fn(),
    fetchMarkup: vi.fn(), // T-41
    uploadMarkup: vi.fn(), // T-66
    updateMarkup: vi.fn(), // T-66
    getAccount: vi.fn(),
  };
}

const wsCreds = { url: "https://huly.io", workspace: "myteam", token: "tok" };

describe("getClient — cache + LRU", () => {
  beforeEach(() => {
    __clearPoolForTests();
    vi.clearAllMocks();
    vi.mocked(getWorkspace).mockResolvedValue(wsCreds);
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, transport: "ws", projects: {} });
  });

  it("creates client on cache miss", async () => {
    const mock = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(mock);
    const client = await getClient("myteam");
    expect(client).toBe(mock);
    expect(createHulyClient).toHaveBeenCalledTimes(1);
    expect(getWorkspace).toHaveBeenCalledWith("myteam");
  });

  it("returns cached client on cache hit (no createHulyClient)", async () => {
    const mock = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(mock);
    await getClient("myteam");
    const client2 = await getClient("myteam");
    expect(client2).toBe(mock);
    expect(createHulyClient).toHaveBeenCalledTimes(1);
  });

  it("throws when workspace not in credentials", async () => {
    vi.mocked(getWorkspace).mockResolvedValueOnce(undefined);
    await expect(getClient("unknown")).rejects.toThrow(/not found in credentials/i);
  });

  it("LRU evicts oldest ws when pool reaches maxSize", async () => {
    // Fill pool with MAX_WS_POOL entries
    for (let i = 0; i < __MAX_WS_POOL; i++) {
      vi.mocked(getWorkspace).mockResolvedValueOnce({ ...wsCreds, token: `t${i}` });
      vi.mocked(createHulyClient).mockResolvedValueOnce(makeMockClient("ws"));
      await getClient(`ws-${i}`);
    }
    expect(__poolSizeForTests()).toBe(__MAX_WS_POOL);
    // Add 1 more → evict oldest (ws-0)
    vi.mocked(getWorkspace).mockResolvedValueOnce({ ...wsCreds, token: "new" });
    const newMock = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(newMock);
    await getClient("ws-new");
    expect(__poolSizeForTests()).toBe(__MAX_WS_POOL);
    const client = await getClient("ws-new");
    expect(client).toBe(newMock);
  });

  it("REST transport does NOT count towards WS LRU limit", async () => {
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, transport: "rest", projects: {} });
    for (let i = 0; i < __MAX_WS_POOL + 5; i++) {
      vi.mocked(getWorkspace).mockResolvedValueOnce({ ...wsCreds, token: `r${i}` });
      vi.mocked(createHulyClient).mockResolvedValueOnce(makeMockClient("rest"));
      await getClient(`rest-${i}`);
    }
    // REST: no LRU, all kept
    expect(__poolSizeForTests()).toBe(__MAX_WS_POOL + 5);
  });

  it("pre-fetches currentUser on create", async () => {
    const mock = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(mock);
    await getClient("myteam");
    expect(mock.getCurrentUser).toHaveBeenCalledTimes(1);
  });
});

describe("closeAll", () => {
  beforeEach(() => {
    __clearPoolForTests();
    vi.clearAllMocks();
    vi.mocked(getWorkspace).mockResolvedValue(wsCreds);
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, transport: "ws", projects: {} });
  });

  it("closes all clients + clears pool", async () => {
    const m1 = makeMockClient("ws");
    const m2 = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(m1).mockResolvedValueOnce(m2);
    await getClient("ws-1");
    await getClient("ws-2");
    expect(__poolSizeForTests()).toBe(2);

    await closeAll();

    expect(__poolSizeForTests()).toBe(0);
    expect(m1.close).toHaveBeenCalledTimes(1);
    expect(m2.close).toHaveBeenCalledTimes(1);
  });

  it("idempotent — safe to call multiple times", async () => {
    await closeAll();
    await closeAll();
    expect(__poolSizeForTests()).toBe(0);
  });

  it("continues closing other clients if one throws", async () => {
    const m1 = makeMockClient("ws");
    m1.close.mockRejectedValueOnce(new Error("close fail"));
    const m2 = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(m1).mockResolvedValueOnce(m2);
    await getClient("ws-1");
    await getClient("ws-2");
    await closeAll();
    expect(m2.close).toHaveBeenCalledTimes(1);
    expect(__poolSizeForTests()).toBe(0);
  });
});

describe("health", () => {
  beforeEach(() => {
    __clearPoolForTests();
    vi.clearAllMocks();
    vi.mocked(getWorkspace).mockResolvedValue(wsCreds);
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, transport: "ws", projects: {} });
  });

  it("returns empty array when pool empty", async () => {
    const result = await health();
    expect(result).toEqual([]);
  });

  it("returns health for all entries when no workspace given", async () => {
    vi.mocked(createHulyClient).mockResolvedValueOnce(makeMockClient("ws"));
    await getClient("ws-1");
    const result = await health();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      workspace: "ws-1",
      connected: true,
      transport: "ws",
      user: { id: "u1", name: "User", email: "u@x.com" },
    });
  });

  it("returns health for specific workspace", async () => {
    vi.mocked(createHulyClient).mockResolvedValueOnce(makeMockClient("ws"));
    await getClient("ws-1");
    const result = await health("ws-1");
    expect(result).toHaveLength(1);
    expect(result[0].workspace).toBe("ws-1");
  });

  it("returns empty for unknown workspace", async () => {
    const result = await health("unknown");
    expect(result).toEqual([]);
  });

  it("marks disconnected when getCurrentUser throws", async () => {
    const broken = makeMockClient("ws");
    broken.getCurrentUser.mockRejectedValueOnce(new Error("disconnected"));
    vi.mocked(createHulyClient).mockResolvedValueOnce(broken);
    await getClient("ws-1");
    // Override getCurrentUser to always fail (pool cached the client)
    broken.getCurrentUser.mockRejectedValue(new Error("disconnected"));
    const result = await health("ws-1");
    expect(result[0].connected).toBe(false);
    expect(result[0].user).toBeUndefined();
  });

  // T-62 #67: expose upstream noise counters qua health().
  it("T-62: include upstreamNoiseFiltered khi total > 0", async () => {
    const { resetUpstreamNoiseCounters, runWithConsoleFilter } =
      await import("../console-filter.js");
    resetUpstreamNoiseCounters();
    vi.mocked(createHulyClient).mockResolvedValueOnce(makeMockClient("ws"));
    await getClient("ws-1");
    // Giả lập upstream warn đã filter (counter module-level tăng).
    await runWithConsoleFilter([/^no document found/i], async () => {
      console.warn("no document found, skipping");
    });
    const result = await health("ws-1");
    expect(result[0].upstreamNoiseFiltered).toEqual({
      total: 1,
      byPattern: { "/^no document found/i": 1 },
    });
    resetUpstreamNoiseCounters();
  });

  it("T-62: KHÔNG include upstreamNoiseFiltered khi total = 0", async () => {
    const { resetUpstreamNoiseCounters } = await import("../console-filter.js");
    resetUpstreamNoiseCounters();
    vi.mocked(createHulyClient).mockResolvedValueOnce(makeMockClient("ws"));
    await getClient("ws-1");
    const result = await health("ws-1");
    expect(result[0].upstreamNoiseFiltered).toBeUndefined();
  });
});

describe("integration: getClient + closeAll round-trip", () => {
  beforeEach(() => {
    __clearPoolForTests();
    vi.clearAllMocks();
    vi.mocked(getWorkspace).mockResolvedValue(wsCreds);
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, transport: "ws", projects: {} });
  });

  it("create → use → close lifecycle", async () => {
    const mock = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(mock);
    const client = await getClient("myteam");
    await client.findAll("class" as never, {} as never);
    await closeAll();
    expect(mock.close).toHaveBeenCalledTimes(1);
    expect(__poolSizeForTests()).toBe(0);
  });
});

// T-35 — R7 subagent smoke (precondition for D14 shared-pool hypothesis).
//
// R7 STATUS: UNVERIFIED — pi-subagent dispatch runtime chưa verifiable trong CI.
// Audit T-35 (2026-07-27) xác nhận:
//   - `pi-subagents` KHÔNG trong peerDependencies.
//   - KHÔNG có package pi-subagents trong node_modules (chỉ pi-agent-core/ai/
//     coding-agent/tui @ 0.82.1).
//   - pi-agent-core + pi-coding-agent dist KHÔNG export dispatchSubagent/
//     spawn/createSubagent API.
//
// UC-04 hypothesis: "subagent tool = in-process AgentSession → likely same
// process, D14 probably holds". Spec 08-non-functional §"Subagent Smoke (R7)"
// dùng conditional language "[IF same-process verified]".
//
// → Test block này verify PRECONDITION cho D14: nếu subagent = in-process
// (AgentSession hypothesis đúng) thì module-level pool share works. Nó KHÔNG
// verify actual pi-subagent dispatch runtime (defer tới T-36 e2e HOẶC task mới
// sau khi pi-subagents package confirmed available).
describe("R7 subagent smoke (in-process precondition for D14)", () => {
  beforeEach(() => {
    __clearPoolForTests();
    vi.clearAllMocks();
    vi.mocked(getWorkspace).mockResolvedValue(wsCreds);
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, transport: "ws", projects: {} });
  });

  it("main agent + subagent (in-process) share 1 pool connection", async () => {
    // Simulate: main agent getClient trước, subagent (in-process callback)
    // getClient sau — cùng workspace. D14 precondition: pool share, no reconnect.
    const mock = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValueOnce(mock);

    const mainClient = await getClient("myteam");
    // Subagent dispatch (in-process AgentSession hypothesis) — reuse pool entry
    const subagentClient = await getClient("myteam");

    // Precondition assertions (D14 nếu same-process):
    expect(__poolSizeForTests()).toBe(1); // 1 connection, NOT 2
    expect(createHulyClient).toHaveBeenCalledTimes(1); // no reconnect
    expect(subagentClient).toBe(mainClient); // same instance (===)
  });

  it("concurrent main + subagent getClient does NOT double-connect (happy path)", async () => {
    // Concurrent dispatch (Promise.all) — verify pool share under interleaving.
    // NOTE: pool.ts hiện sequential-safe (Map.get→set), KHÔNG có pending-request
    // dedup. Test này verify happy-path precondition; race-edge (2 getClient
    // hit cache miss simultaneously → 2 creates) là known limitation, out of
    // scope T-35 (size S). Sequential await bên dưới tránh race.
    const mock = makeMockClient("ws");
    vi.mocked(createHulyClient).mockResolvedValue(mock);

    // Main bind trước (giống UC-04: main ensure binding TRƯỚC dispatch)
    await getClient("myteam");
    // Subagent concurrent dispatch (2 callers, pool đã có entry)
    const [c1, c2] = await Promise.all([getClient("myteam"), getClient("myteam")]);

    expect(__poolSizeForTests()).toBe(1);
    expect(c1).toBe(mock);
    expect(c2).toBe(mock);
    // createHulyClient chỉ 1 (từ main bind) — subagent reuse
    expect(createHulyClient).toHaveBeenCalledTimes(1);
  });

  it("different workspaces do NOT share (correctness boundary)", async () => {
    // Sanity: pool share CHỈ cho same workspace. Cross-workspace = separate
    // connections (KHÔNG phải subagent sharing bug).
    vi.mocked(createHulyClient)
      .mockResolvedValueOnce(makeMockClient("ws"))
      .mockResolvedValueOnce(makeMockClient("ws"));

    await getClient("ws-a");
    await getClient("ws-b");

    expect(__poolSizeForTests()).toBe(2); // 2 separate connections
  });
});
