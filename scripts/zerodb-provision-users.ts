#!/usr/bin/env npx tsx
/**
 * zerodb-provision-users.ts
 *
 * Registers CRM staff accounts in ZeroDB so each user can authenticate
 * with their own credentials instead of the shared VITE_CRM_PASSWORD.
 *
 * Usage:
 *   npx tsx scripts/zerodb-provision-users.ts
 *   npx tsx scripts/zerodb-provision-users.ts --password MyCustomPass123!
 *
 * Refs #16
 * Built by AINative Dev Team
 */

const ZERODB_API_URL =
  process.env.VITE_ZERODB_API_URL ?? "https://api.ainative.studio/v1";

const CRM_USERS = [
  "nf@winning.careers",
  "mf@winning.careers",
  "caleb@winning.careers",
  "scott@winning.careers",
];

const DEFAULT_PASSWORD = "WinningCRM2026!";

function parseArgs(): { password: string } {
  const args = process.argv.slice(2);
  const pwIdx = args.indexOf("--password");
  const password =
    pwIdx !== -1 && args[pwIdx + 1] ? args[pwIdx + 1] : DEFAULT_PASSWORD;
  return { password };
}

async function registerUser(email: string, password: string): Promise<void> {
  const url = `${ZERODB_API_URL}/public/auth/register`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`  [NETWORK ERROR] ${email}: ${detail}`);
    return;
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (res.ok) {
    console.log(`  [OK] ${email} — registered successfully`);
    return;
  }

  // ZeroDB returns 400 or 409 when the account already exists.
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const alreadyExists =
    res.status === 409 ||
    (res.status === 400 &&
      (bodyStr.toLowerCase().includes("already") ||
        bodyStr.toLowerCase().includes("exists") ||
        bodyStr.toLowerCase().includes("duplicate")));

  if (alreadyExists) {
    console.log(`  [SKIP] ${email} — account already exists`);
  } else {
    console.error(
      `  [FAIL] ${email} — HTTP ${res.status}: ${bodyStr}`,
    );
  }
}

async function main() {
  const { password } = parseArgs();

  console.log("ZeroDB CRM User Provisioning");
  console.log(`API: ${ZERODB_API_URL}`);
  console.log(`Users: ${CRM_USERS.length}`);
  console.log("---");

  for (const email of CRM_USERS) {
    await registerUser(email, password);
  }

  console.log("---");
  console.log("Done. Share the password securely with each user.");
  console.log(
    "Users can change their password via the ZeroDB account portal after first login.",
  );
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
