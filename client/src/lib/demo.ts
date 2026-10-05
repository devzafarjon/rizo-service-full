// Demo logins are shown and prefilled only in development, or when a build sets VITE_SHOW_DEMO=true.
// A production site must never advertise or prefill account credentials.
export const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === "true";
