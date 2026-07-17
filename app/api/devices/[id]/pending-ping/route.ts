import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { pingRequests } from "@/lib/schema";
import { authenticateDevice } from "@/lib/device-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const device = await authenticateDevice(req, id);
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [pending] = await db
    .select({ id: pingRequests.id })
    .from(pingRequests)
    .where(and(eq(pingRequests.deviceId, id), isNull(pingRequests.fulfilledAt)))
    .limit(1);

  return NextResponse.json({ pending: !!pending });
}
