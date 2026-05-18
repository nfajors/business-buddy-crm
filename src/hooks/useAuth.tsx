import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { zerodb } from "@/integrations/zerodb/client";
import type { AuthSession } from "@/integrations/zerodb/types";
import { isEmailAllowed, isAdminEmail } from "@/lib/auth-allowlist";
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
const SESSION_KEY = "zerodb.session";

// Auth: ZeroDB per-user login (#16) with shared-password fallback.
// The shared VITE_CRM_PASSWORD is checked first so existing accounts keep
// working while ZeroDB user accounts are being provisioned.
const CRM_PASSWORD = import.meta.env.VITE_CRM_PASSWORD as string | undefined;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(zerodb.getSession());
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    const unsubscribe = zerodb.onAuthChange((next) => {
      setSession(next);
      setRoles(next ? rolesForEmail(next.user.email) : []);
    });
    const initial = zerodb.getSession();
    if (initial) setRoles(rolesForEmail(initial.user.email));
    setLoading(false);
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase();

    // Defense-in-depth: allowlist check runs before hitting ZeroDB.
    if (!isEmailAllowed(normalized)) {
      return { error: "Access restricted to authorized Winning.Careers staff." };
    }

    // Shared-password fallback: lets existing staff log in while ZeroDB
    // user accounts are being provisioned. Checked first so it never breaks.
    if (CRM_PASSWORD && password === CRM_PASSWORD) {
      const fakeSession = {
        token: import.meta.env.VITE_ZERODB_API_KEY as string ?? "",
        user: { id: normalized, email: normalized },
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      };
      zerodb.setSession(fakeSession);
      localStorage.setItem(SIGN_IN_KEY, new Date().toISOString());
      return { error: null };
    }

    try {
      // Per-user ZeroDB auth (#16) — used once accounts are provisioned.
      await zerodb.auth.login(normalized, password);
      localStorage.setItem(SIGN_IN_KEY, new Date().toISOString());
      return { error: null };
    } catch {
      return { error: "Invalid email or password." };
    }
  };

  // Sign-up is intentionally disabled — accounts are admin-provisioned.
  const signUp = async (_email: string, _password: string, _displayName: string) => {
    return { error: "Accounts are provisioned by an admin. Contact the team if you need access." };
  };

  const signOut = async () => {
    zerodb.setSession(null);
    localStorage.removeItem(SIGN_IN_KEY);
    localStorage.removeItem(SESSION_KEY);
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

function rolesForEmail(email: string): AppRole[] {
  const roles: AppRole[] = ["user"];
  if (isAdminEmail(email)) roles.push("admin");
  return roles;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
