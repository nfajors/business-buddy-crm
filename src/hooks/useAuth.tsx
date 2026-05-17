import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { zerodb, ZeroDBError } from "@/integrations/zerodb/client";
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
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SIGN_IN_KEY = "zerodb.last_sign_in_at";
const SESSION_KEY = "zerodb.session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(zerodb.getSession());
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    const unsubscribe = zerodb.onAuthChange((next) => {
      setSession(next);
      setRoles(next ? rolesForEmail(next.user.email) : []);
      if (!next) setMustChangePassword(false);
      else void refreshMustChangeFlag(next.user.id, setMustChangePassword);
    });
    const initial = zerodb.getSession();
    if (initial) {
      setRoles(rolesForEmail(initial.user.email));
      void refreshMustChangeFlag(initial.user.id, setMustChangePassword);
    }
    setLoading(false);
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase();
    // Defense-in-depth: the allowlist short-circuits before we hit the auth
    // endpoint, so a non-staff email can't even probe for a valid password.
    if (!isEmailAllowed(normalized)) {
      return { error: "Access restricted to authorized Winning.Careers staff." };
    }
    try {
      await zerodb.auth.login(normalized, password);
      localStorage.setItem(SIGN_IN_KEY, new Date().toISOString());
      return { error: null };
    } catch (err) {
      if (err instanceof ZeroDBError && (err.status === 401 || err.status === 403)) {
        return { error: "Invalid email or password." };
      }
      return { error: (err as Error).message || "Sign-in failed." };
    }
  };

  // Sign-up is intentionally disabled — accounts are admin-provisioned via
  // scripts/zerodb/provision-users.ts (#16).
  const signUp = async (_email: string, _password: string, _displayName: string) => {
    return { error: "Accounts are provisioned by an admin. Contact the team if you need access." };
  };

  const signOut = async () => {
    zerodb.auth.logout();
    localStorage.removeItem(SIGN_IN_KEY);
    localStorage.removeItem(SESSION_KEY);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const current = zerodb.getSession();
    if (!current) return { error: "Not signed in." };
    try {
      await zerodb.auth.changePassword(currentPassword, newPassword);
      await clearMustChangeFlag(current.user.id);
      setMustChangePassword(false);
      return { error: null };
    } catch (err) {
      if (err instanceof ZeroDBError) {
        if (err.status === 401 || err.status === 403) {
          return { error: "Current password is incorrect." };
        }
        if (err.status === 404 || err.status === 405) {
          return {
            error:
              "Self-serve password change isn't available yet. Email an admin to reset it for you.",
          };
        }
      }
      return { error: (err as Error).message || "Password change failed." };
    }
  };

  const lastSignInAt =
    typeof localStorage !== "undefined" ? localStorage.getItem(SIGN_IN_KEY) ?? undefined : undefined;
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
        mustChangePassword,
        signIn,
        signUp,
        signOut,
        changePassword,
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

async function refreshMustChangeFlag(
  userId: string,
  setter: (v: boolean) => void,
): Promise<void> {
  try {
    const profile = await zerodb.tables.get("profiles", userId);
    setter(profile?.must_change_password === true);
  } catch (err) {
    // No profile yet means the user was provisioned but hasn't had a temp-
    // password flag set — treat as "no forced change required" rather than
    // bouncing them out of the app.
    if (err instanceof ZeroDBError && err.status === 404) {
      setter(false);
      return;
    }
    console.warn("[auth] could not read profile.must_change_password", err);
    setter(false);
  }
}

async function clearMustChangeFlag(userId: string): Promise<void> {
  try {
    await zerodb.tables.update("profiles", userId, {
      must_change_password: false,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    // Failing to clear the flag is annoying (user gets re-prompted next
    // login) but not dangerous — log and continue.
    console.warn("[auth] could not clear must_change_password flag", err);
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
