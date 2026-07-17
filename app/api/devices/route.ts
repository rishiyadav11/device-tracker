import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { devices } from "@/lib/schema";
import { deviceCreateSchema } from "@/lib/validation";
import { generateDeviceSecret, hashDeviceSecret } from "@/lib/device-secret";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDevices = await db
    .select({
      id: devices.id,
      name: devices.name,
      type: devices.type,
      lastSeenAt: devices.lastSeenAt,
      createdAt: devices.createdAt,
    })
    .from(devices)
    .where(eq(devices.userId, session.user.id));

  return NextResponse.json({ devices: userDevices });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = deviceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const deviceSecret = generateDeviceSecret();
  const deviceSecretHash = hashDeviceSecret(deviceSecret);

  const [device] = await db
    .insert(devices)
    .values({
      userId: session.user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      deviceSecretHash,
    })
    .returning({ id: devices.id, name: devices.name, type: devices.type });

  return NextResponse.json(
    { device, deviceSecret },
    { status: 201 },
  );
}
