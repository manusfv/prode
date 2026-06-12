import { describe, expect, it } from "vitest";

import { isValidDisplayName, validatePasswordChange, MIN_PASSWORD_LENGTH } from "./account";

describe("isValidDisplayName", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(isValidDisplayName("")).toBe(false);
    expect(isValidDisplayName("   ")).toBe(false);
  });

  it("accepts a non-empty name", () => {
    expect(isValidDisplayName("Manu")).toBe(true);
    expect(isValidDisplayName("  Manu  ")).toBe(true);
  });
});

describe("validatePasswordChange", () => {
  it("rejects mismatched passwords", () => {
    const result = validatePasswordChange("abcdef", "abcdeX");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Las contraseñas no coinciden.");
  });

  it("rejects passwords shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = validatePasswordChange(short, short);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
  });

  it("accepts a valid matching password", () => {
    const good = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(validatePasswordChange(good, good)).toEqual({ ok: true });
  });
});
