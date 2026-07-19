"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { captureAndReport } from "@/lib/device-client";

// Launched by the Windows agent in a real, invisible browser window when
// available, so location reporting gets the browser's own (much richer)
// network-location database instead of the OS API's more limited one — the
// same reason a browser tab reports tighter accuracy than a raw script call.
// No login required: authenticated purely by the per-device secret, exactly
// like the /api/devices/[id]/location endpoint it ultimately calls.
function RelayContent() {
  const params = useSearchParams();
  const deviceId = params.get("device");
  const secret = params.get("secret");
  const [status, setStatus] = useState(
    deviceId && secret ? "Getting precise location..." : "Missing parameters.",
  );

  useEffect(() => {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      window.close();
    };

    if (!deviceId || !secret) {
      const t = setTimeout(close, 1000);
      return () => clearTimeout(t);
    }

    captureAndReport(deviceId, secret)
      .then(() => setStatus("Location reported."))
      .catch(() => setStatus("Could not report location."))
      .finally(() => setTimeout(close, 400));

    // Safety net in case something hangs (e.g. a slow permission prompt) so
    // the window doesn't sit open indefinitely.
    const timeout = setTimeout(close, 15000);
    return () => clearTimeout(timeout);
  }, [deviceId, secret]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, fontSize: 14 }}>
      {status}
    </div>
  );
}

export default function RelayPage() {
  return (
    <Suspense>
      <RelayContent />
    </Suspense>
  );
}
