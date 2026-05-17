import { describe, it, expect } from "vitest";
import { isEmailAllowed, isAdminEmail } from "@/lib/auth-allowlist";

describe("auth-allowlist", () => {
  it("includes all 4 staff emails", () => {
    for (const e of [
      "nf@winning.careers",
      "mf@winning.careers",
      "caleb@winning.careers",
      "scott@inspiration-labs.com",
    ]) {
      expect(isEmailAllowed(e)).toBe(true);
    }
  });

  it("rejects non-staff emails", () => {
    expect(isEmailAllowed("attacker@example.com")).toBe(false);
    expect(isEmailAllowed("")).toBe(false);
  });

  it("normalises case and whitespace", () => {
    expect(isEmailAllowed("  NF@Winning.Careers  ")).toBe(true);
  });

  it("nf@winning.careers is the only admin", () => {
    expect(isAdminEmail("nf@winning.careers")).toBe(true);
    expect(isAdminEmail("mf@winning.careers")).toBe(false);
    expect(isAdminEmail("scott@inspiration-labs.com")).toBe(false);
  });
});
