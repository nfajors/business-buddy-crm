// Admin-only password reset for a single user (#16). Used when a user
// loses their password and can't self-serve. Sets a new password and
// flips must_change_password back on so the user is forced to rotate
// it on next sign-in.
//
// Usage:
//   node --env-file=.env --import tsx \
//     scripts/zerodb/set-password.ts <email> <new-temp-password>
//
// ZeroDB's admin-side "set password by email" endpoint shape isn't
// documented to us. We try two plausible paths in order; if both fail
// the script reports the response so the admin can adjust.

const API_URL = process.env.VITE_ZERODB_API_URL ?? "https://api.ainative.studio/v1";
const PROJECT_ID = process.env.VITE_ZERODB_PROJECT_ID;
const API_KEY = process.env.VITE_ZERODB_API_KEY;

const TABLE_API_BASE = API_URL.replace(/\/v1$/, "/api/v1");

function headers() {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
  };
}

async function tryAdminSetPassword(email: string, newPassword: string): Promise<boolean> {
  const candidates = [
    {
      label: "POST /public/auth/admin/set-password",
      url: `${API_URL}/public/auth/admin/set-password`,
      body: { email, new_password: newPassword },
    },
    {
      label: "POST /public/auth/reset-password",
      url: `${API_URL}/public/auth/reset-password`,
      body: { email, new_password: newPassword },
    },
  ];
  for (const c of candidates) {
    const res = await fetch(c.url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(c.body),
    });
    if (res.ok) {
      console.log(`[set-password] ${email}: success via ${c.label}`);
      return true;
    }
    const text = await res.text();
    console.warn(`[set-password] ${c.label} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return false;
}

async function flipMustChangeFlag(email: string): Promise<void> {
  const url = `${TABLE_API_BASE}/projects/${PROJECT_ID}/database/tables/profiles/rows/${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      must_change_password: true,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[set-password] could not flip must_change_password: ${res.status} ${text.slice(0, 200)}`);
  }
}

async function main() {
  const [, , email, newPassword] = process.argv;
  if (!email || !newPassword) {
    console.error("Usage: scripts/zerodb/set-password.ts <email> <new-password>");
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error("New password must be at least 8 characters.");
    process.exit(1);
  }
  if (!PROJECT_ID || !API_KEY) {
    console.error("VITE_ZERODB_PROJECT_ID and VITE_ZERODB_API_KEY are required.");
    process.exit(1);
  }

  const ok = await tryAdminSetPassword(email.toLowerCase(), newPassword);
  if (!ok) {
    console.error(
      "[set-password] All candidate endpoints rejected the request. Confirm the ZeroDB admin password-reset path and adjust this script.",
    );
    process.exit(2);
  }
  await flipMustChangeFlag(email.toLowerCase());
  console.log(`[set-password] ${email}: temp password set; must_change_password=true.`);
  console.log("Share the new password with the user out-of-band; they will be forced to rotate it.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
