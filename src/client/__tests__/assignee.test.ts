import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAssignee } from "../assignee.js";
import type { HulyClient } from "../client.js";

function makeMockClient(): HulyClient {
  return {
    transport: "ws",
    getCurrentUser: vi.fn().mockResolvedValue({
      id: "acc-uuid",
      name: "Test User",
      email: "test@huly.io",
    }),
    getAccount: vi.fn(),
    findOne: vi.fn(),
    findAll: vi.fn(),
    createDoc: vi.fn(),
    updateDoc: vi.fn(),
    removeDoc: vi.fn(),
    addCollection: vi.fn(),
    createMixin: vi.fn(),
    close: vi.fn(),
  } as unknown as HulyClient;
}

describe("resolveAssignee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns input as-is when provided (resolved=false)", async () => {
    const client = makeMockClient();
    const result = await resolveAssignee(client, "alice@huly.io");
    expect(result).toEqual({
      identifier: "alice@huly.io",
      resolved: false,
    });
    expect(client.getCurrentUser).not.toHaveBeenCalled();
  });

  it("returns input name when provided (non-email)", async () => {
    const client = makeMockClient();
    const result = await resolveAssignee(client, "Doe, John");
    expect(result.identifier).toBe("Doe, John");
    expect(result.resolved).toBe(false);
  });

  it("defaults to getCurrentUser email when input absent", async () => {
    const client = makeMockClient();
    const result = await resolveAssignee(client, undefined);
    expect(result).toEqual({
      identifier: "test@huly.io",
      name: "Test User",
      resolved: true,
    });
    expect(client.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("defaults to getCurrentUser when input empty string", async () => {
    const client = makeMockClient();
    const result = await resolveAssignee(client, "");
    expect(result.resolved).toBe(true);
    expect(result.identifier).toBe("test@huly.io");
  });

  it("cache: getCurrentUser called once per resolveAssignee(absent)", async () => {
    const client = makeMockClient();
    await resolveAssignee(client);
    await resolveAssignee(client);
    // Note: HulyClient.getCurrentUser is itself cached, but resolveAssignee calls it each time
    // For 2 absent calls, getCurrentUser called twice (cache is at client level, not resolver level)
    expect(client.getCurrentUser).toHaveBeenCalledTimes(2);
  });
});
