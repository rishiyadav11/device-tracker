"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Locate, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DeviceMapLoader } from "@/components/device-map-loader";
import { WindowsAgentSetup } from "@/components/windows-agent-setup";
import { timeAgo } from "@/lib/format";

type Device = {
  id: string;
  name: string;
  type: string;
  lastSeenAt: string | null;
};

type LocationRow = {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  capturedAt: string;
};

const PING_POLL_INTERVAL_MS = 3000;
const PING_TIMEOUT_MS = 45_000;

export function DeviceDetail({
  device: initialDevice,
  locations: initialLocations,
}: {
  device: Device;
  locations: LocationRow[];
}) {
  const router = useRouter();
  const [device, setDevice] = useState(initialDevice);
  const [locations, setLocations] = useState(initialLocations);
  const [name, setName] = useState(initialDevice.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locateStatus, setLocateStatus] = useState<
    "idle" | "waiting" | "timeout"
  >("idle");
  const pollTimers = useRef<{ interval?: NodeJS.Timeout; timeout?: NodeJS.Timeout }>(
    {},
  );

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      clearInterval(timers.interval);
      clearTimeout(timers.timeout);
    };
  }, []);

  const current = locations[0]
    ? { lat: locations[0].lat, lng: locations[0].lng }
    : null;
  const currentAccuracy = locations[0]?.accuracyMeters ?? null;
  const trail = [...locations].reverse().map((l) => ({ lat: l.lat, lng: l.lng }));

  const handleRename = async () => {
    setSaving(true);
    const res = await fetch(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Could not rename device");
      return;
    }
    setDevice((d) => ({ ...d, name }));
    setRenameOpen(false);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirm(`Remove "${device.name}"? This deletes its location history too.`)) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toast.error("Could not remove device");
      return;
    }
    toast.success("Device removed");
    router.push("/dashboard");
    router.refresh();
  };

  const handleLocateNow = async () => {
    const res = await fetch(`/api/devices/${device.id}/ping`, { method: "POST" });
    if (!res.ok) {
      toast.error("Could not request location");
      return;
    }
    const { pingRequest } = await res.json();
    const requestedAt = new Date(pingRequest.requestedAt).getTime();

    setLocateStatus("waiting");
    clearInterval(pollTimers.current.interval);
    clearTimeout(pollTimers.current.timeout);

    pollTimers.current.interval = setInterval(async () => {
      const r = await fetch(`/api/devices/${device.id}/locations?limit=200`);
      if (!r.ok) return;
      const data = await r.json();
      const rows: LocationRow[] = data.locations;
      const latest = rows[0];
      if (latest && new Date(latest.capturedAt).getTime() >= requestedAt) {
        clearInterval(pollTimers.current.interval);
        clearTimeout(pollTimers.current.timeout);
        setLocations(rows);
        setDevice((d) => ({ ...d, lastSeenAt: latest.capturedAt }));
        setLocateStatus("idle");
        toast.success("Got a fresh location");
      }
    }, PING_POLL_INTERVAL_MS);

    pollTimers.current.timeout = setTimeout(() => {
      clearInterval(pollTimers.current.interval);
      setLocateStatus("timeout");
    }, PING_TIMEOUT_MS);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{device.name}</h1>
          <Badge variant="secondary" className="capitalize">
            {device.type}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleLocateNow}
            disabled={locateStatus === "waiting"}
          >
            {locateStatus === "waiting" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Locate className="size-4" />
            )}
            Locate now
          </Button>
          <WindowsAgentSetup deviceId={device.id} />
          <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <Pencil className="size-4" />
              Rename
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename device</DialogTitle>
              </DialogHeader>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <DialogFooter>
                <Button onClick={handleRename} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        </div>
      </div>

      {locateStatus === "waiting" && (
        <p className="text-sm text-muted-foreground">
          Waiting for the device to respond — this only works while it has this
          site open in a browser tab somewhere.
        </p>
      )}
      {locateStatus === "timeout" && (
        <p className="text-sm text-amber-600">
          The device hasn&apos;t responded yet. It may not have this site open
          right now — showing the last known location below.
        </p>
      )}

      <DeviceMapLoader
        current={current}
        trail={trail}
        accuracyMeters={currentAccuracy}
        height={380}
      />

      <p className="text-sm text-muted-foreground">
        Last seen {timeAgo(device.lastSeenAt)}
        {currentAccuracy != null &&
          ` · accurate to ±${Math.round(currentAccuracy)} m`}
        {locations.length > 1 && ` · ${locations.length} points in history`}
      </p>
    </div>
  );
}
