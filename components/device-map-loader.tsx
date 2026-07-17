"use client";

import dynamic from "next/dynamic";
import type { LatLng } from "@/components/device-map";

const DeviceMap = dynamic(
  () => import("@/components/device-map").then((m) => m.DeviceMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[160px] w-full animate-pulse rounded-md border bg-muted" />
    ),
  },
);

export function DeviceMapLoader(props: {
  current: LatLng | null;
  trail?: LatLng[];
  accuracyMeters?: number | null;
  height?: number;
  interactive?: boolean;
}) {
  return <DeviceMap {...props} />;
}
