// Client-side "has finished onboarding" flag. Sign-in state itself is handled
// by the real Supabase session (cookies), not here.
const ONBOARDED = "frequency-onboarded";

export const session = {
  isOnboarded(): boolean {
    try {
      return localStorage.getItem(ONBOARDED) === "1";
    } catch {
      return false;
    }
  },
  setOnboarded() {
    try {
      localStorage.setItem(ONBOARDED, "1");
    } catch {}
  },
};
