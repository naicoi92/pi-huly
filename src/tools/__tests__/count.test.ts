import { describe, it, expect } from "vitest";
import { allTools, toolCountByDomain } from "../register.js";

describe("tool count by domain", () => {
  it("allTools matches sum of per-domain counts", () => {
    const counts = toolCountByDomain();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(allTools.length).toBe(total);
  });

  it("prints breakdown", () => {
    const counts = toolCountByDomain();
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [d, n] of entries) {
      console.log(`  ${d}: ${n}`);
    }
    console.log(`  TOTAL: ${allTools.length}`);
    expect(allTools.length).toBeGreaterThan(80);
  });

  it("all tools có huly_ prefix (FR-02 D5)", () => {
    for (const t of allTools) {
      expect(t.name).toMatch(/^huly_/);
    }
  });
});
