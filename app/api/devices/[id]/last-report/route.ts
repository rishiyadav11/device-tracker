import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";

// Lets the agent verify a report actually landed, rather than assuming
// success just because a browser window launched successfully — launching
// and actually reporting are different things (permission prompt ignored,
// page failed, etc.).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const device = await authenticateDevice(req, id);
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
  });
}
