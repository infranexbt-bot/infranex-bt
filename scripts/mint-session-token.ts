/**
 * Mint a valid session token for the active admin user (operator-side
 * verification only — same HMAC the login route produces).
 * Run: bun scripts/mint-session-token.ts
 */
import { createSessionToken } from "../src/lib/auth";

const token = await createSessionToken({
  userId: "admin",
  label: "Administrator",
  role: "admin",
});
console.log(token);
