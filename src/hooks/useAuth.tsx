import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { zerodb, ZeroDBError } from "@/integrations/zerodb/client";
import type { AuthSession } from "@/integrations/zerodb/types";
import { isEmailAllowed } from "@/lib/auth-allowlist";
import type { AppRole } from "@/lib/types";

interface User {
  id: string;
  email: string;
  last_sign_in_at?: string;
}

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  loading: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SIGN_IN_KEY = "zerodb.last_sign_in_at";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(zerodb.getSession());
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    const unsubscribe = zerodb.onAuthChange((next) => {
      setSession(next);
      if (next?.user.id) void fetchRoles(next.user.id);
      else setRoles([]);
    });
    const initial = zerodb.getSession();
    if (initial?.user.id) void fetchRoles(initial.user.id);
    setLoading(false);
    return unsubscribe;
  }, []);

  const fetchRoles = async (userId: string) => {
    try {
      const res = await zerodb.tables.query("user_roles", {
        filter: { user_id: userId },
        limit: 100,
      });
      setRoles(res.records.map((r) => r.role));
    } catch (err) {
      console.warn("[auth] role fetch failed", err);
      setRoles([]);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await zerodb.auth.login(email.trim().toLowerCase(), password);
      localStorage.setItem(SIGN_IN_KEY, new Date().toISOString());
      return { error: null };
    } catch (err) {
      return { error: friendlyAuthError(err) };
    }
  };

  const signUp = async (email: string, password: string, _displayName: string) => {
    const normalized = email.trim().toLowerCase();
    if (!isEmailAllowed(normalized)) {
      return { error: "Signups are restricted to authorized Winning.Careers staff." };
    }
    try {
      await zerodb.auth.register(normalized, password);
      localStorage.setItem(SIGN_IN_KEY, new Date().toISOString());
      return { error: null };
    } catch (err) {
      return { error: friendlyAuthError(err) };
    }
  };

  const signOut = async () => {
    zerodb.auth.logout();
    localStorage.removeItem(SIGN_IN_KEY);
  };

  const lastSignInAt = typeof localStorage !== "undefined" ? localStorage.getItem(SIGN_IN_KEY) ?? undefined : undefined;
  const user: User | null = session
    ? { id: session.user.id, email: session.user.email, last_sign_in_at: lastSignInAt }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        roles,
        isAdmin: roles.includes("admin"),
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function friendlyAuthError(err: unknown): string {
  if (err instanceof ZeroDBError) {
    if (err.status === 401 || err.status === 403) return "Invalid email or password.";
    const body = err.body as { message?: string; detail?: string } | null;
    return body?.message ?? body?.detail ?? err.message;
  }
  const msg = (err as Error).message || "";
  // Network-level failure (CORS blocked response, no connectivity, etc.)
  if (!msg || msg === "Failed to fetch" || msg === "Load failed" || msg === "NetworkError") {
    return "Invalid email or password.";
  }
  return msg || "Authentication failed.";
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
