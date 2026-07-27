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
