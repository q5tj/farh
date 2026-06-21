import { router, usePathname } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";

/**
 * Account-required screen guard. Apple guideline 5.1.1(v) lets browse
 * surfaces stay open to guests, but account-only screens (bookings
 * list, favourites, profile, the booking form, provider zone, admin)
 * still need a session.
 *
 * The hook is a no-op while auth is still bootstrapping, then redirects
 * unauthenticated callers to /(auth)/login with a `?next=` query string
 * so the login screen can bounce them back to the page they wanted.
 *
 * Returns `true` once the user is signed in and a profile is loaded —
 * use it to gate the render (`if (!ready) return null;`).
 */
export function useRequireAuth(): boolean {
  const { session, profile, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (session && profile) return;
    if (session && !profile) return; // wait one more tick
    router.replace(
      `/(auth)/signup?next=${encodeURIComponent(pathname)}` as never,
    );
  }, [loading, session, profile, pathname]);

  return !loading && !!session && !!profile;
}
