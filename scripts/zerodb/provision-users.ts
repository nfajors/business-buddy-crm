// Provision the 4 staff users in ZeroDB (#16). Idempotent: if a user
// already exists, registration is skipped but the profile row is
// upserted with must_change_password=true so the next sign-in still
// forces a rotation.
//
// Usage:
//   ZERODB_TEMP_PASSWORD='SomethingStrong1!' \
//     node --env-file=.env --import tsx scripts/zerodb/provision-users.ts
//
// Required env: VITE_ZERODB_API_URL, VITE_ZERODB_PROJECT_ID,
// VITE_ZERODB_API_KEY, ZERODB_TEMP_PASSWORD.

const API_URL = process.env.VITE_ZERODB_API_URL ?? "https://api.ainative.studio/v1";
const PROJECT_ID = process.env.VITE_ZERODB_PROJECT_ID;
const API_KEY = process.env.VITE_ZERODB_API_KEY;
const TEMP_PASSWORD = process.env.ZERODB_TEMP_PASSWORD;

const STAFF: { email: string; displayName: string }[] = [
  { email: "nf@winning.careers", displayName: "Nique Fajors" },
  { email: "mf@winning.careers", displayName: "Manareldeen Fajors" },
  { email: "caleb@winning.careers", displayName: "Caleb Culberson" },
  { email: "scott@inspiration-labs.com", displayName: "Scott Hilton-Clarke" },
];

const TABLE_API_BASE = API_URL.replace(/\/v1$/, "/api/v1");

interface RegisterResponse {
  access_token?: string;
  user?: { id: string; email: string };
}

async function registerUser(email: string, password: string): Promise<"created" | "exists"> {
  const res = await fetch(`${API_URL}/public/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    },
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) return "created";
  const text = await res.text();
  // ZeroDB return codes for duplicate registrations aren't documented; treat
  // 4xx with "exists" / "already" / "duplicate" / "registered" as idempotent.
  if (res.status === 409 || /already|exists|duplicate|registered/i.test(text)) {
    return "exists";
  }
  throw new Error(`register ${email} failed: ${res.status} ${text}`);
}

async function upsertProfile(email: string, displayName: string): Promise<void> {
  const now = new Date().toISOString();
  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
  };
  const base = `${TABLE_API_BASE}/projects/${PROJECT_ID}/database/tables/profiles/rows`;

  // Try update first; if missing, create.
  const updateRes = await fetch(`${base}/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      display_name: displayName,
      must_change_password: true,
      updated_at: now,
    }),
  });
  if (updateRes.ok) return;
  if (updateRes.status !== 404) {
    const text = await updateRes.text();
    throw new Error(`profile update ${email} failed: ${updateRes.status} ${text}`);
  }
  const createRes = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      row_data: {
        id: email,
        display_name: displayName,
        must_change_password: true,
        created_at: now,
        updated_at: now,
      },
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`profile create ${email} failed: ${createRes.status} ${text}`);
  }
}

async function main() {
  if (!PROJECT_ID) throw new Error("VITE_ZERODB_PROJECT_ID is required.");
  if (!API_KEY) throw new Error("VITE_ZERODB_API_KEY is required.");
  if (!TEMP_PASSWORD || TEMP_PASSWORD.length < 8) {
    throw new Error("ZERODB_TEMP_PASSWORD is required and must be at least 8 characters.");
  }

  console.log(`[provision] api=${API_URL} project=${PROJECT_ID}`);
  console.log(`[provision] ${STAFF.length} users to process`);

  for (const { email, displayName } of STAFF) {
    try {
      const result = await registerUser(email, TEMP_PASSWORD);
      await upsertProfile(email, displayName);
      console.log(`[provision] ${email}: ${result}, profile upserted (must_change_password=true)`);
    } catch (err) {
      console.error(`[provision] ${email} FAILED:`, err);
      process.exitCode = 1;
    }
  }

  console.log("[provision] done.");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Share the temp password with each user out-of-band (Signal / 1Password).");
  console.log("  2. Each user signs in once — they'll be forced to change the password.");
  console.log("  3. Drop VITE_CRM_PASSWORD from Railway once everyone has rotated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
