/**
 * The phone number last used to sign in (never the password), so the sign-in page is already filled in next time.
 * The session itself stays signed in until the person signs out; this only saves retyping after signing out.
 */
const KEY = "rizo.lastPhone";

export function readLastPhone(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberPhone(phone: string) {
  try {
    localStorage.setItem(KEY, phone.trim());
  } catch {
    // Storage can be blocked (private window): the sign-in still works.
  }
}

export function forgetPhone() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
