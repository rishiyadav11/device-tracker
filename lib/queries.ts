import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { devices, locations } from "@/lib/schema";

export async function getDevicesForUser(userId: string) {
  const rows = await db.select().from(devices).where(eq(devices.userId, userId));

  return Promise.all(
    rows.map(async (device) => {
      const [latest] = await db
        .select()
        .from(locations)
        .where(eq(locations.deviceId, device.id))
        .orderBy(desc(locations.capturedAt))
        .limit(1);
      return { ...device, latestLocation: latest ?? null };
    }),
  );
}

export async function getDeviceForUser(userId: string, deviceId: string) {
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
    .limit(1);
  return device ?? null;
}

export async function getLocationHistory(deviceId: string, limit = 100) {
  return db
    .select()
    .from(locations)
    .where(eq(locations.deviceId, deviceId))
    .orderBy(desc(locations.capturedAt))
    .limit(limit);
}
