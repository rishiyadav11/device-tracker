import { randomBytes, createHash, timingSafeEqual } from "crypto";

// Device secrets are high-entropy random tokens (not human passwords), so a
// fast salted hash is sufficient — no need for bcrypt's deliberate slowness,
// and check-ins happen far more often than logins.
export function generateDeviceSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifyDeviceSecret(secret: string, hash: string) {
  const candidate = Buffer.from(hashDeviceSecret(secret));
  const expected = Buffer.from(hash);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
