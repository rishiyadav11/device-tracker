import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDeviceForUser, getLocationHistory } from "@/lib/queries";
import { DeviceDetail } from "@/components/device-detail";

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const device = await getDeviceForUser(session.user.id, id);
  if (!device) notFound();

  const locations = await getLocationHistory(id, 200);

  return (
    <DeviceDetail
      device={{
        id: device.id,
        name: device.name,
        type: device.type,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      }}
      locations={locations.map((l) => ({
        lat: l.lat,
        lng: l.lng,
        accuracyMeters: l.accuracyMeters,
        capturedAt: l.capturedAt.toISOString(),
      }))}
    />
  );
}
