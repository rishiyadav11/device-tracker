import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { devices, locations, pingRequests } from "@/lib/schema";
import { locationReportSchema } from "@/lib/validation";
import { authenticateDevice } from "@/lib/device-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!checkRateLimit(`location:${id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const device = await authenticateDevice(req, id);
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = locationReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const now = new Date();

  await db.insert(locations).values({
    deviceId: device.id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    accuracyMeters: parsed.data.accuracyMeters,
    source: parsed.data.source,
    capturedAt: now,
  });

  await db
    .update(devices)
    .set({ lastSeenAt: now })
    .where(eq(devices.id, device.id));

  // A fresh location report inherently satisfies any outstanding "Locate Now"
  // request for this device, whether it was prompted by one or not.
  await db
    .update(pingRequests)
    .set({ fulfilledAt: now })
    .where(
      and(eq(pingRequests.deviceId, device.id), isNull(pingRequests.fulfilledAt)),
    );

  return NextResponse.json({ ok: true }, { status: 201 });
}
