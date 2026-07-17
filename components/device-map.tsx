"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  Circle,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fixLeafletIcon } from "@/lib/leaflet-icon";

export type LatLng = { lat: number; lng: number };

export function DeviceMap({
  current,
  trail = [],
  accuracyMeters = null,
  height = 320,
  interactive = true,
}: {
  current: LatLng | null;
  trail?: LatLng[];
  accuracyMeters?: number | null;
  height?: number;
  interactive?: boolean;
}) {
  useEffect(() => {
    fixLeafletIcon();
  }, []);

  if (!current) {
    return (
      <div
        className="flex items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground"
        style={{ height }}
      >
        No location reported yet
      </div>
    );
  }

  return (
    <MapContainer
      key={`${current.lat}-${current.lng}`}
      center={[current.lat, current.lng]}
      zoom={14}
      style={{ height, width: "100%" }}
      className="rounded-md z-0"
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      attributionControl={interactive}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {trail.length > 1 && (
        <Polyline positions={trail.map((p) => [p.lat, p.lng])} />
      )}
      {accuracyMeters && accuracyMeters > 0 && (
        <Circle
          center={[current.lat, current.lng]}
          radius={accuracyMeters}
          pathOptions={{ color: "#2563eb", fillOpacity: 0.1, weight: 1 }}
        />
      )}
      <Marker position={[current.lat, current.lng]}>
        <Popup>
          Last known location
          {accuracyMeters ? ` (±${Math.round(accuracyMeters)} m)` : ""}
        </Popup>
      </Marker>
    </MapContainer>
  );
}
