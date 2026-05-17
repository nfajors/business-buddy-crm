// Provision ZeroDB user accounts for the Business Buddy CRM.
// Registers each allowlisted email via the ZeroDB auth register endpoint.
// Idempotent: already-registered users are reported and skipped.
//
// Usage:
//   node --env-file=.env --import tsx scripts/zerodb/provision-users.ts --temp-password "YourPass1!"
//
// Requires env: VITE_ZERODB_API_URL
// The --temp-password flag sets the initial password for all provisioned users.
// Users should change their password on first login via /settings.

const API_URL =
  process.env.VITE_ZERODB_API_URL ?? "https://api.ainative.studio/v1";

const ALLOWED_EMAILS: string[] = [
  "nf@winning.careers",
  "mf@winning.careers",
  "caleb@winning.careers",
  "scott@inspiration-labs.com",
];

function parseTempPassword(args: string[]): string {
  const idx = args.indexOf("--temp-password");
  if (idx === -1 || idx + 1 >= args.length) {
    console.error(
      "Usage: provision-users.ts --temp-password <password>\n" +
        "  Password must be >= 8 chars with at least one letter and one number/symbol.",
    );
    process.exit(1);
  }
  const pw = args[idx + 1];
  if (pw.length < 8) {
    console.error("Error: --temp-password must be at least 8 characters.");
    process.exit(1);
  }
  if (!/[A-Za-z]/.test(pw)) {
    console.error("Error: --temp-password must include at least one letter.");
    process.exit(1);
  }
  if (!/[0-9\W_]/.test(pw)) {
    console.error(
      "Error: --temp-password must include at least one number or symbol.",
    );
    process.exit(1);
  }
  return pw;
}

async function registerUser(
  email: string,
  password: string,
): Promise<"created" | "exists" | string> {
  const res = await fetch(`${API_URL}/public/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (res.ok) return "created";

  const text = await res.text();

  // Treat 409 Conflict or "already exists" / "duplicate" as idempotent success.
  if (
    res.status === 409 ||
    /already exists/i.test(text) ||
    /duplicate/i.test(text) ||
    /registered/i.test(text)
  ) {
    return "exists";
  }

  return `error ${res.status}: ${text}`;
}

async function main() {
  const tempPassword = parseTempPassword(process.argv);

  console.log(`[provision-users] api=${API_URL}`);
  console.log(`[provision-users] registering ${ALLOWED_EMAILS.length} users\n`);

  let failures = 0;

  for (const email of ALLOWED_EMAILS) {
    const result = await registerUser(email, tempPassword);
    const icon = result === "created" ? "+" : result === "exists" ? "=" : "!";
    console.log(`  [${icon}] ${email}: ${result}`);
    if (result !== "created" && result !== "exists") failures++;
  }

  console.log(
    `\n[provision-users] done. ${failures === 0 ? "All OK." : `${failures} failure(s).`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
