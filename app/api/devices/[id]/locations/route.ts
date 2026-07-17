import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDeviceForUser, getLocationHistory } from "@/lib/queries";

export async function GET(
  req: Request,
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

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

  const rows = await getLocationHistory(id, limit);

  return NextResponse.json({ locations: rows });
}
