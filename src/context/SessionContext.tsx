"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

export type SessionUser = {
  user_id: number;
  username: string;
  full_name: string;
  role: "admin" | "cashier";
};

type SessionContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Immediately ends the session. Prefer requestLogout() from the UI. */
  logout: () => Promise<void>;
  /** Opens the shared confirmation dialog before logging out. */
  requestLogout: () => void;
  logoutPending: boolean;
  cancelLogout: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: SessionUser | null;
}) {
  // Seeded from the server so the shell knows who is logged in on first paint.
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [loading, setLoading] = useState(initialUser === null);
  const [logoutPending, setLogoutPending] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      setUser(data.authenticated ? data.user : null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // The API records the logout in the audit trail before clearing the cookie.
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setLogoutPending(false);
    router.push("/login");
  }, [router]);

  const requestLogout = useCallback(() => setLogoutPending(true), []);
  const cancelLogout = useCallback(() => setLogoutPending(false), []);

  useEffect(() => {
    // The server already told us who is signed in; only go ask when it didn't.
    if (!initialUser) refresh();
  }, [refresh, initialUser]);

  return (
    <SessionContext.Provider
      value={{ user, loading, refresh, logout, requestLogout, logoutPending, cancelLogout }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
