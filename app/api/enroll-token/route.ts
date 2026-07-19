import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { generateDeviceSecret, hashDeviceSecret } from "@/lib/device-secret";

// Regenerates the signed-in user's account enrollment token and returns a
// ready-to-paste PowerShell command. Running that command on any Windows PC
// enrolls it as a new device under this account and starts background
// tracking — no browser needed on the target PC. Regenerating invalidates any
// command handed out previously.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = generateDeviceSecret();
  await db
    .update(users)
    .set({ enrollmentTokenHash: hashDeviceSecret(token) })
    .where(eq(users.id, session.user.id));

  const origin = new URL(req.url).origin;

  const enrollCommand =
    `$env:DT_TOKEN='${token}'; ` +
    `$env:DT_URL='${origin}'; ` +
    `irm ${origin}/agent/enroll.ps1 | iex`;

  const uninstallCommand = `irm ${origin}/agent/uninstall.ps1 | iex`;

  return NextResponse.json({ enrollCommand, uninstallCommand });
}
