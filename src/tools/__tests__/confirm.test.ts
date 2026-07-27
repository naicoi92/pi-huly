// Test T-10 confirmDestructive — FR-09 D9 confirm gate + non-TUI auto-deny.

import { describe, expect, it, vi } from "vitest";
import { confirmDestructive } from "../confirm.js";

function makeCtx(hasUI: boolean) {
  return {
    hasUI,
    ui: { confirm: vi.fn() },
  } as unknown as Parameters<typeof confirmDestructive>[0];
}

describe("confirmDestructive — FR-09 D9", () => {
  it("non-TUI (hasUI=false) → auto-deny (KHÔNG bypass)", async () => {
    const ctx = makeCtx(false);
    const result = await confirmDestructive(ctx, { type: "issue", id: "PD-1" });
    expect(result).toBe(false);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("TUI (hasUI=true) + user confirm yes → true", async () => {
    const ctx = makeCtx(true);
    ctx.ui.confirm = vi.fn().mockResolvedValue(true);
    const result = await confirmDestructive(ctx, { type: "issue", id: "PD-1" });
    expect(result).toBe(true);
    expect(ctx.ui.confirm).toHaveBeenCalledWith("Delete issue", 'Delete issue "PD-1"?');
  });

  it("TUI (hasUI=true) + user deny → false", async () => {
    const ctx = makeCtx(true);
    ctx.ui.confirm = vi.fn().mockResolvedValue(false);
    const result = await confirmDestructive(ctx, { type: "issue", id: "PD-1" });
    expect(result).toBe(false);
  });

  it("TUI + detail cascade → message includes detail", async () => {
    const ctx = makeCtx(true);
    ctx.ui.confirm = vi.fn().mockResolvedValue(true);
    await confirmDestructive(ctx, {
      type: "issue",
      id: "PD-1",
      detail: "Cascade: 5 items",
    });
    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Delete issue",
      'Delete issue "PD-1"? Cascade: 5 items',
    );
  });

  it("TUI + confirm throw → safe deny (false)", async () => {
    const ctx = makeCtx(true);
    ctx.ui.confirm = vi.fn().mockRejectedValue(new Error("dialog dismissed"));
    const result = await confirmDestructive(ctx, { type: "issue", id: "PD-1" });
    expect(result).toBe(false);
  });

  it("hasUI undefined (boundary) → auto-deny (NFR-10 fail-safe)", async () => {
    // Pi có thể truyền ctx không set hasUI — phải deny KHÔNG bypass
    const ctx = { ui: { confirm: vi.fn() } } as unknown as Parameters<typeof confirmDestructive>[0];
    const result = await confirmDestructive(ctx, { type: "issue", id: "PD-1" });
    expect(result).toBe(false);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });
});
