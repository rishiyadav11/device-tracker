import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pingRequests } from "@/lib/schema";
import { getDeviceForUser } from "@/lib/queries";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const device = await getDeviceForUser(session.user.id, id);
  if (!device) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [pingRequest] = await db
    .insert(pingRequests)
    .values({ deviceId: id, requestedBy: session.user.id })
    .returning({ id: pingRequests.id, requestedAt: pingRequests.requestedAt });

  return NextResponse.json({ pingRequest }, { status: 201 });
}
