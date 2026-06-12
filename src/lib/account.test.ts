import { describe, expect, it } from "vitest";

import { isValidDisplayName, validateLogin, validatePasswordChange, validateSignup, MIN_PASSWORD_LENGTH } from "./account";

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

describe("validateLogin", () => {
  it("rejects an empty email", () => {
    const result = validateLogin("   ", "abcdef");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Ingresá tu email.");
  });

  it("rejects an empty password", () => {
    const result = validateLogin("a@b.com", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Ingresá tu contraseña.");
  });

  it("accepts email and password present", () => {
    expect(validateLogin("a@b.com", "abcdef")).toEqual({ ok: true });
  });
});

describe("validateSignup", () => {
  it("rejects an empty email", () => {
    const result = validateSignup("Manu", "  ", "abcdef", "abcdef");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Ingresá tu email.");
  });

  it("rejects mismatched passwords", () => {
    const result = validateSignup("Manu", "a@b.com", "abcdef", "abcdeX");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Las contraseñas no coinciden.");
  });

  it("rejects passwords shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = validateSignup("Manu", "a@b.com", short, short);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
  });

  it("accepts a valid signup (name optional)", () => {
    const good = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(validateSignup("", "a@b.com", good, good)).toEqual({ ok: true });
  });
});
