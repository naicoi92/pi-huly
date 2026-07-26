import { describe, expect, it } from "vitest";
import { HULY_VERSION } from "../index.js";

// Smoke test — verify vitest wire-up + module export. KHÔNG business logic
// (T-01 chỉ skeleton, per task-implement/references/superpowers-dispatch.md
// config/skeleton → classic no-TDD).
describe("pi-huly skeleton", () => {
  it("exports HULY_VERSION constant", () => {
    expect(HULY_VERSION).toBe("0.1.0");
  });
});
