"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { saveDeviceSecret, captureAndReport, LocationError } from "@/lib/device-client";

type DeviceType = "laptop" | "phone" | "tablet" | "other";
type Step = "form" | "locating" | "done";

function describeLocationError(err: unknown): string {
  if (err instanceof LocationError) return err.message;
  if (err instanceof Error) {
    return `We added the device, but couldn't save its location: ${err.message}`;
  }
  return "We added the device, but couldn't get its location.";
}

export default function NewDevicePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<DeviceType>("laptop");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [addedDevice, setAddedDevice] = useState<{
    id: string;
    secret: string;
  } | null>(null);

  const attemptLocate = async (deviceId: string, secret: string) => {
    try {
      await captureAndReport(deviceId, secret);
      setLocationError(null);
      setStep("done");
      toast.success("Device added and located");
      setTimeout(() => router.push(`/dashboard/devices/${deviceId}`), 800);
    } catch (err) {
      setLocationError(describeLocationError(err));
      setStep("done");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not add device");
      setSubmitting(false);
      return;
    }

    const { device, deviceSecret } = await res.json();
    saveDeviceSecret(device.id, deviceSecret);
    setAddedDevice({ id: device.id, secret: deviceSecret });
    setSubmitting(false);
    setStep("locating");

    await attemptLocate(device.id, deviceSecret);
  };

  const handleRetry = async () => {
    if (!addedDevice) return;
    setRetrying(true);
    setStep("locating");
    await attemptLocate(addedDevice.id, addedDevice.secret);
    setRetrying(false);
  };

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Add this device</CardTitle>
          <CardDescription>
            Set this up from the browser on the laptop or phone you want to
            track — it will ask for location permission next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "form" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Device name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Rishi's MacBook"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Device type</Label>
                <Select value={type} onValueChange={(v) => setType(v as DeviceType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={submitting} className="mt-2">
                {submitting ? "Adding..." : "Add device"}
              </Button>
            </form>
          )}

          {step === "locating" && (
            <p className="text-sm text-muted-foreground">
              Requesting location permission from this browser — check for a
              permission prompt.
            </p>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-3">
              {locationError ? (
                <>
                  <p className="text-sm text-amber-600">{locationError}</p>
                  <Button onClick={handleRetry} disabled={retrying}>
                    {retrying ? "Trying again..." : "Try again"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Location captured. Taking you to the device...
                </p>
              )}
              <Button variant="outline" onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
