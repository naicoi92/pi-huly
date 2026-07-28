import { describe, expect, it, vi } from "vitest";

// T-63 #68: regression test cho safeUpdateDoc / safeRemoveDoc helper.
// Helper centralize schema drift guard — nếu doc.space/_id undefined → isError,
// KHÔNG gửi updateDoc (silent no-op prevention).

import { safeRemoveDoc, safeUpdateDoc } from "../_common.js";
import type { HulyClient } from "../../../client/client.js";
import type { Ref, Space } from "@hcengineering/api-client";

/** Mock HulyClient với updateDoc/removeDoc spy. */
function makeMockClient(): HulyClient & {
  updateDoc: ReturnType<typeof vi.fn>;
  removeDoc: ReturnType<typeof vi.fn>;
} {
  return {
    transport: "ws",
    findOne: vi.fn(),
    findAll: vi.fn(),
    createDoc: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue({ ok: true }),
    removeDoc: vi.fn().mockResolvedValue({ ok: true }),
    addCollection: vi.fn(),
    createMixin: vi.fn(),
    fetchMarkup: vi.fn(),
    getAccount: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as HulyClient & {
    updateDoc: ReturnType<typeof vi.fn>;
    removeDoc: ReturnType<typeof vi.fn>;
  };
}

const CLASS_REF = "tracker:class:Issue" as Ref<never>;
const SPACE_REF = "space-1" as Ref<Space>;
const DOC_ID = "issue-1" as never;

describe("safeUpdateDoc — schema drift guard", () => {
  it("doc có space + _id → gọi updateDoc thật, return ok", async () => {
    const client = makeMockClient();
    const doc = { _id: DOC_ID, space: SPACE_REF, title: "test" };
    const result = await safeUpdateDoc(client, CLASS_REF, doc, { title: "updated" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ ok: true });
    }
    expect(client.updateDoc).toHaveBeenCalledWith(CLASS_REF, SPACE_REF, DOC_ID, {
      title: "updated",
    });
  });

  it("doc.space undefined → isError, KHÔNG gọi updateDoc (silent no-op prevention)", async () => {
    const client = makeMockClient();
    const doc = { _id: DOC_ID, title: "test" }; // space missing
    const result = await safeUpdateDoc(client, CLASS_REF, doc, { title: "updated" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isError).toBe(true);
      expect(result.error.content).toMatch(/space/i);
      expect(result.error.details).toMatchObject({ docId: DOC_ID, missingField: "space" });
    }
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("doc._id undefined → isError, KHÔNG gọi updateDoc", async () => {
    const client = makeMockClient();
    const doc = { space: SPACE_REF, title: "test" }; // _id missing
    const result = await safeUpdateDoc(client, CLASS_REF, doc, { title: "updated" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isError).toBe(true);
      expect(result.error.content).toMatch(/_id/i);
      expect(result.error.details).toMatchObject({ missingField: "_id" });
    }
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("doc cả space + _id undefined → error mention space first (ưu tiên)", async () => {
    const client = makeMockClient();
    const doc = { title: "test" };
    const result = await safeUpdateDoc(client, CLASS_REF, doc, { title: "updated" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toMatchObject({ missingField: "space" });
    }
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("doc null → isError (KHÔNG throw, caller return thẳng)", async () => {
    const client = makeMockClient();
    const result = await safeUpdateDoc(client, CLASS_REF, null, { title: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isError).toBe(true);
    }
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("doc không phải object (vd string) → isError", async () => {
    const client = makeMockClient();
    const result = await safeUpdateDoc(client, CLASS_REF, "not-a-doc" as never, {});
    expect(result.ok).toBe(false);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("operations rỗng → vẫn gọi updateDoc (caller quyết định, KHÔNG guard ở helper)", async () => {
    const client = makeMockClient();
    const doc = { _id: DOC_ID, space: SPACE_REF };
    const result = await safeUpdateDoc(client, CLASS_REF, doc, {});
    expect(result.ok).toBe(true);
    expect(client.updateDoc).toHaveBeenCalledWith(CLASS_REF, SPACE_REF, DOC_ID, {});
  });

  it("error message include _class + docId cho debug", async () => {
    const client = makeMockClient();
    const doc = { title: "x" }; // missing cả 2
    const result = await safeUpdateDoc(client, CLASS_REF, doc, {});
    if (!result.ok) {
      expect(result.error.content).toContain("tracker:class:Issue");
    }
  });
});

describe("safeRemoveDoc — schema drift guard", () => {
  it("doc có space + _id → gọi removeDoc thật, return ok", async () => {
    const client = makeMockClient();
    const doc = { _id: DOC_ID, space: SPACE_REF };
    const result = await safeRemoveDoc(client, CLASS_REF, doc);
    expect(result.ok).toBe(true);
    expect(client.removeDoc).toHaveBeenCalledWith(CLASS_REF, SPACE_REF, DOC_ID);
  });

  it("doc.space undefined → isError, KHÔNG gọi removeDoc", async () => {
    const client = makeMockClient();
    const doc = { _id: DOC_ID };
    const result = await safeRemoveDoc(client, CLASS_REF, doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isError).toBe(true);
      expect(result.error.details).toMatchObject({ missingField: "space" });
    }
    expect(client.removeDoc).not.toHaveBeenCalled();
  });

  it("doc._id undefined → isError, KHÔNG gọi removeDoc", async () => {
    const client = makeMockClient();
    const doc = { space: SPACE_REF };
    const result = await safeRemoveDoc(client, CLASS_REF, doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toMatchObject({ missingField: "_id" });
    }
    expect(client.removeDoc).not.toHaveBeenCalled();
  });

  it("doc null → isError", async () => {
    const client = makeMockClient();
    const result = await safeRemoveDoc(client, CLASS_REF, null);
    expect(result.ok).toBe(false);
    expect(client.removeDoc).not.toHaveBeenCalled();
  });
});
