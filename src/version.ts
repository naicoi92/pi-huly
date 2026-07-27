// version.ts — pi-huly version constant (single source).
// Tách riêng khỏi index.ts để tránh circular import:
//   index.ts (factory) ↔ commands/huly.ts (import HULY_VERSION cho /huly status).
// Cả 2 import từ đây → KHÔNG cycle. Bump version tại đây duy nhất.

export const HULY_VERSION = "1.0.0-beta.1";
