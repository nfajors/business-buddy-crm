import { z } from "zod";

// Internal CRM password policy: ≥12 chars, mix of letters + digits/symbols.
export const passwordSchema = z
  .string()
  .min(12, { message: "Password must be at least 12 characters" })
  .max(72, { message: "Password must be 72 characters or fewer" })
  .refine((v) => /[A-Za-z]/.test(v), { message: "Include at least one letter" })
  .refine((v) => /[0-9\W_]/.test(v), {
    message: "Include at least one number or symbol",
  });

export const PASSWORD_HINT =
  "Min. 12 characters with at least one letter and one number or symbol.";