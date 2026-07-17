import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { devices } from "@/lib/schema";
import { generateDeviceSecret, hashDeviceSecret } from "@/lib/device-secret";

// Regenerates this device's secret and returns a ready-to-paste PowerShell
// command that installs the background agent on a Windows PC. The plaintext
// secret only exists in this response — it is stored hashed — so generating a
// new setup command invalidates any agent previously installed for this device.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .limit(1);
  if (!device) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = generateDeviceSecret();
  await db
    .update(devices)
    .set({ deviceSecretHash: hashDeviceSecret(secret) })
    .where(eq(devices.id, id));

  const origin = new URL(req.url).origin;

  const installCommand =
    `$env:DT_DEVICE='${id}'; ` +
    `$env:DT_SECRET='${secret}'; ` +
    `$env:DT_URL='${origin}'; ` +
    `irm ${origin}/agent/install.ps1 | iex`;

  const uninstallCommand = `irm ${origin}/agent/uninstall.ps1 | iex`;

  return NextResponse.json({ installCommand, uninstallCommand });
}
