import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Monitor } from "lucide-react";
import { auth } from "@/lib/auth";
import { getDevicesForUser } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeviceMapLoader } from "@/components/device-map-loader";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const devices = await getDevicesForUser(session.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your devices</h1>
        <div className="flex items-center gap-2">
          <Button
            render={<Link href="/dashboard/add-windows" />}
            nativeButton={false}
            variant="outline"
          >
            <Monitor className="size-4" />
            Add Windows PC
          </Button>
          <Button render={<Link href="/dashboard/devices/new" />} nativeButton={false}>
            <Plus className="size-4" />
            Add device
          </Button>
        </div>
      </div>
      <DashboardAutoRefresh intervalMs={30000} />

      {devices.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No devices yet. Add your laptop or phone to start tracking it.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {devices.map((device) => (
            <Card key={device.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{device.name}</CardTitle>
                <Badge variant="secondary" className="capitalize">
                  {device.type}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <DeviceMapLoader
                  current={
                    device.latestLocation
                      ? {
                          lat: device.latestLocation.lat,
                          lng: device.latestLocation.lng,
                        }
                      : null
                  }
                  accuracyMeters={device.latestLocation?.accuracyMeters ?? null}
                  height={160}
                  interactive={false}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Last seen {timeAgo(device.lastSeenAt)}
                  </p>
                  <Button
                    render={<Link href={`/dashboard/devices/${device.id}`} />}
                    nativeButton={false}
                    size="sm"
                    variant="outline"
                  >
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
