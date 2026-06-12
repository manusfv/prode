export const MIN_PASSWORD_LENGTH = 6;

export function isValidDisplayName(name: string): boolean {
  return name.trim().length > 0;
}

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validatePasswordChange(password: string, confirm: string): ValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== confirm) {
    return { ok: false, message: "Las contraseñas no coinciden." };
  }
  return { ok: true };
}
