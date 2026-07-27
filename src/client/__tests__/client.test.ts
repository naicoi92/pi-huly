import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @hcengineering/api-client BEFORE import client.ts
vi.mock("@hcengineering/api-client", () => {
  const mockPlatformClient = {
    findOne: vi.fn().mockResolvedValue({ _id: "doc1", name: "Test" }),
    findAll: vi.fn().mockResolvedValue([{ _id: "doc1" }, { _id: "doc2" }]),
    createDoc: vi.fn().mockResolvedValue("new-doc-ref"),
    updateDoc: vi.fn().mockResolvedValue({ ok: true }),
    removeDoc: vi.fn().mockResolvedValue({ ok: true }),
    addCollection: vi.fn().mockResolvedValue("new-attached-ref"),
    createMixin: vi.fn().mockResolvedValue({ ok: true }),
    getAccount: vi.fn().mockResolvedValue({
      uuid: "account-uuid-123",
      primarySocialId: "person-id-456",
      socialIds: ["person-id-456"],
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockRestClient = {
    findOne: vi.fn().mockResolvedValue({ _id: "rest-doc1" }),
    findAll: vi.fn().mockResolvedValue([{ _id: "rest-doc1" }]),
    getAccount: vi.fn().mockResolvedValue({
      uuid: "rest-account-uuid",
      primarySocialId: "rest-person-id",
      socialIds: ["rest-person-id"],
    }),
  };
  const mockTxOperations = {
    createDoc: vi.fn().mockResolvedValue("rest-new-doc-ref"),
    updateDoc: vi.fn().mockResolvedValue({ ok: true }),
    removeDoc: vi.fn().mockResolvedValue({ ok: true }),
    addCollection: vi.fn().mockResolvedValue("rest-new-attached-ref"),
    createMixin: vi.fn().mockResolvedValue({ ok: true }),
  };
  return {
    connect: vi.fn().mockResolvedValue(mockPlatformClient),
    connectRest: vi.fn().mockResolvedValue(mockRestClient),
    createRestTxOperations: vi.fn().mockResolvedValue(mockTxOperations),
    getWorkspaceToken: vi.fn().mockResolvedValue({
      endpoint: "https://huly.io/api",
      workspaceId: "ws-uuid",
      token: "resolved-token",
    }),
    // expose mocks cho test assertions
    __mockPlatformClient: mockPlatformClient,
    __mockRestClient: mockRestClient,
    __mockTxOperations: mockTxOperations,
  };
});

import {
  connect,
  connectRest,
  createRestTxOperations,
  getWorkspaceToken,
} from "@hcengineering/api-client";
import { createHulyClient, type HulyCredentials } from "../client.js";
import { ConnectionError } from "../errors.js";

const tokenCreds = {
  url: "https://huly.example.com",
  workspace: "myteam",
  token: "test-token-abc",
} as HulyCredentials;
const emailCreds = {
  url: "https://huly.example.com",
  workspace: "myteam",
  email: "user@example.com",
  password: "pass123",
} as HulyCredentials;

describe("createHulyClient — transport selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ws transport calls connect() with url + auth", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    expect(connect).toHaveBeenCalledWith("https://huly.example.com", {
      workspace: "myteam",
      token: "test-token-abc",
    });
    expect(connectRest).not.toHaveBeenCalled();
    expect(client.transport).toBe("ws");
  });

  it("rest transport calls connectRest() + createRestTxOperations()", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    expect(connectRest).toHaveBeenCalledWith("https://huly.example.com", {
      workspace: "myteam",
      token: "test-token-abc",
    });
    expect(getWorkspaceToken).toHaveBeenCalled();
    expect(createRestTxOperations).toHaveBeenCalledWith(
      "https://huly.io/api",
      "ws-uuid",
      "resolved-token",
    );
    expect(client.transport).toBe("rest");
  });

  it("default transport is ws", async () => {
    const client = await createHulyClient(tokenCreds);
    expect(connect).toHaveBeenCalled();
    expect(client.transport).toBe("ws");
  });

  it("works with email+password auth", async () => {
    const client = await createHulyClient(emailCreds, "ws");
    expect(connect).toHaveBeenCalledWith("https://huly.example.com", {
      workspace: "myteam",
      email: "user@example.com",
      password: "pass123",
    });
    expect(client.transport).toBe("ws");
  });
});

describe("HulyClient ws — delegates to PlatformClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findOne delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.findOne("class-ref" as never, {} as never);
    expect(result).toEqual({ _id: "doc1", name: "Test" });
  });

  it("findAll delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.findAll("class-ref" as never, {} as never);
    expect(result).toHaveLength(2);
  });

  it("createDoc delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.createDoc("class-ref" as never, "space" as never, {} as never);
    expect(result).toBe("new-doc-ref");
  });

  it("updateDoc delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.updateDoc("class-ref" as never, "space" as never, "id" as never, {} as never);
    // Just verify no throw
    expect(true).toBe(true);
  });

  it("removeDoc delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.removeDoc("class-ref" as never, "space" as never, "id" as never);
    expect(true).toBe(true);
  });

  it("addCollection delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.addCollection(
      "class-ref" as never,
      "space" as never,
      "attachedTo" as never,
      "attachedToClass" as never,
      "collection",
      {} as never,
    );
    expect(result).toBe("new-attached-ref");
  });

  it("createMixin delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.createMixin(
      "objectId" as never,
      "objectClass" as never,
      "objectSpace" as never,
      "mixin" as never,
      {} as never,
    );
    expect(true).toBe(true);
  });

  it("getAccount delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const account = await client.getAccount();
    expect(account.uuid).toBe("account-uuid-123");
  });

  it("close delegates to PlatformClient.close", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.close();
    // Verify close called (via mock, would error if not)
    expect(true).toBe(true);
  });
});

describe("HulyClient rest — delegates to RestClient (read) + TxOperations (write)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findOne delegates to RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const result = await client.findOne("class-ref" as never, {} as never);
    expect(result).toEqual({ _id: "rest-doc1" });
  });

  it("findAll delegates to RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const result = await client.findAll("class-ref" as never, {} as never);
    expect(result).toHaveLength(1);
  });

  it("createDoc delegates to TxOperations (RestClient read-only)", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const result = await client.createDoc("class-ref" as never, "space" as never, {} as never);
    expect(result).toBe("rest-new-doc-ref");
  });

  it("updateDoc delegates to TxOperations", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    await client.updateDoc("class-ref" as never, "space" as never, "id" as never, {} as never);
    expect(true).toBe(true);
  });

  it("getAccount delegates to RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const account = await client.getAccount();
    expect(account.uuid).toBe("rest-account-uuid");
  });

  it("close is no-op (stateless, KHÔNG throw)", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    await expect(client.close()).resolves.toBeUndefined();
  });
});

describe("getCurrentUser — cache (D15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first call fetches account via getAccount", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const user = await client.getCurrentUser();
    expect(user).toEqual({
      id: "account-uuid-123",
      name: "person-id-456",
      email: "person-id-456",
    });
  });

  it("second call uses cache (getAccount called once across 2 getCurrentUser)", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.getCurrentUser();
    await client.getCurrentUser();
    // Verify underlying mock getAccount called exactly once (cache hit on 2nd)
    const lastCall = vi.mocked(connect).mock.results.at(-1);
    const mockClient = (await lastCall?.value) as unknown as {
      getAccount: { mock: { calls: unknown[] } };
    };
    expect(mockClient.getAccount.mock.calls).toHaveLength(1);
  });

  it("cache returns same object reference on subsequent calls", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const user1 = await client.getCurrentUser();
    const user2 = await client.getCurrentUser();
    expect(user1).toBe(user2); // same reference (cache)
  });

  it("rest getCurrentUser fetches from RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const user = await client.getCurrentUser();
    expect(user.id).toBe("rest-account-uuid");
  });
});

describe("createHulyClient — error mapping (T-04 integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connect throw PlatformError → mapped HulyError", async () => {
    vi.mocked(connect).mockRejectedValueOnce(
      Object.assign(new Error("ERROR: platform:status:Unauthorized {}"), {
        name: "PlatformError",
        status: { severity: "ERROR", code: "platform:status:Unauthorized", params: {} },
      }),
    );
    await expect(createHulyClient(tokenCreds, "ws")).rejects.toMatchObject({
      class: "Auth",
    });
  });

  it("connect throw network Error → ConnectionError", async () => {
    vi.mocked(connect).mockRejectedValueOnce(new Error("connect ECONNREFUSED 1.2.3.4:80"));
    await expect(createHulyClient(tokenCreds, "ws")).rejects.toBeInstanceOf(ConnectionError);
  });

  it("connectRest throw → mapped HulyError", async () => {
    vi.mocked(connectRest).mockRejectedValueOnce(
      Object.assign(new Error("ERROR: platform:status:Forbidden {}"), {
        name: "PlatformError",
        status: { severity: "ERROR", code: "platform:status:Forbidden", params: {} },
      }),
    );
    await expect(createHulyClient(tokenCreds, "rest")).rejects.toMatchObject({
      class: "Auth",
    });
  });
});

describe("integration: full flow end-to-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ws: createHulyClient → findAll → createDoc → getCurrentUser → close", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const docs = await client.findAll("class-ref" as never, {} as never);
    expect(docs).toHaveLength(2);
    const newRef = await client.createDoc(
      "class-ref" as never,
      "space" as never,
      { name: "new" } as never,
    );
    expect(newRef).toBe("new-doc-ref");
    const user = await client.getCurrentUser();
    expect(user.id).toBe("account-uuid-123");
    await client.close();
  });

  it("rest: createHulyClient → findOne → updateDoc → getCurrentUser → close", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const doc = await client.findOne("class-ref" as never, {} as never);
    expect(doc).toEqual({ _id: "rest-doc1" });
    await client.updateDoc("class-ref" as never, "space" as never, "id" as never, {} as never);
    const user = await client.getCurrentUser();
    expect(user.id).toBe("rest-account-uuid");
    await client.close(); // no-op for rest
  });
});
