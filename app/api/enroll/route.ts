import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, devices } from "@/lib/schema";
import { generateDeviceSecret, hashDeviceSecret } from "@/lib/device-secret";
import { checkRateLimit } from "@/lib/rate-limit";

const enrollSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(100),
});

// Called by the enroll.ps1 script on the target PC. Authenticated by the
// account enrollment token (not a session). Creates a device under the owning
// account — or reuses an existing device with the same name to avoid
// duplicates on re-run — and returns a fresh per-device secret the agent then
// uses to report location.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`enroll:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const tokenHash = hashDeviceSecret(parsed.data.token);
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.enrollmentTokenHash, tokenHash))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "Invalid enrollment token" }, { status: 401 });
  }

  const secret = generateDeviceSecret();
  const secretHash = hashDeviceSecret(secret);

  const [existing] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.userId, user.id), eq(devices.name, parsed.data.name)))
    .limit(1);

  let deviceId: string;
  if (existing) {
    await db
      .update(devices)
      .set({ deviceSecretHash: secretHash })
      .where(eq(devices.id, existing.id));
    deviceId = existing.id;
  } else {
    const [created] = await db
      .insert(devices)
      .values({
        userId: user.id,
        name: parsed.data.name,
        type: "laptop",
        deviceSecretHash: secretHash,
      })
      .returning({ id: devices.id });
    deviceId = created.id;
  }

  return NextResponse.json({ deviceId, secret });
}
