import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { devices } from "@/lib/schema";
import { verifyDeviceSecret } from "@/lib/device-secret";

export function getBearerToken(req: Request) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function authenticateDevice(req: Request, deviceId: string) {
  const token = getBearerToken(req);
  if (!token) return null;

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);
  if (!device) return null;

  if (!verifyDeviceSecret(token, device.deviceSecretHash)) return null;

  return device;
}
