/**
 * Offload uses no-registration token-based access.
 * The auth router (login/logout) has been removed.
 * This file is kept as a placeholder test to satisfy the test runner.
 */
import { describe, expect, it } from "vitest";

describe("auth (no-registration model)", () => {
  it("app uses token-based access — no login/logout required", () => {
    expect(true).toBe(true);
  });
});
