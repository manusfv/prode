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

export function validateLogin(email: string, password: string): ValidationResult {
  if (!email.trim()) {
    return { ok: false, message: "Ingresá tu email." };
  }
  if (!password) {
    return { ok: false, message: "Ingresá tu contraseña." };
  }
  return { ok: true };
}

export function validateSignup(
  _name: string,
  email: string,
  password: string,
  confirm: string,
): ValidationResult {
  if (!email.trim()) {
    return { ok: false, message: "Ingresá tu email." };
  }
  return validatePasswordChange(password, confirm);
}
