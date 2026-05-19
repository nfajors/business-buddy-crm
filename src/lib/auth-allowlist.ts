// Authorized signup emails. Was enforced in Postgres via the
// handle_new_user trigger; in the ZeroDB world the app does the check
// before calling /public/auth/register (#4). Keep this list in sync with
// the admin user list — anyone not here cannot sign up.

const ALLOWED_EMAILS = new Set<string>([
  "nf@winning.careers",
  "mf@winning.careers",
  "caleb@winning.careers",
  "scott@inspiration-labs.com",
  "admin@winning.careers",
]);

const ADMIN_EMAILS = new Set<string>(["nf@winning.careers", "admin@winning.careers"]);

export function isEmailAllowed(email: string): boolean {
  return ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}
