"use client";

const STORAGE_PREFIX = "devicetracker:secret:";

export type StoredDevice = { id: string; secret: string };

export function saveDeviceSecret(deviceId: string, secret: string) {
  localStorage.setItem(STORAGE_PREFIX + deviceId, secret);
}

export function removeDeviceSecret(deviceId: string) {
  localStorage.removeItem(STORAGE_PREFIX + deviceId);
}

export function listStoredDevices(): StoredDevice[] {
  if (typeof window === "undefined") return [];
  const result: StoredDevice[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    const secret = localStorage.getItem(key);
    if (!secret) continue;
    result.push({ id: key.slice(STORAGE_PREFIX.length), secret });
  }
  return result;
}

export type LocationErrorCode =
  | "insecure-context"
  | "embedded-frame"
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "report-failed";

export class LocationError extends Error {
  code: LocationErrorCode;
  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = "LocationError";
    this.code = code;
  }
}

// Geolocation is blocked inside an iframe unless the embedding page grants it
// via allow="geolocation" — which preview/embedded panes usually don't. Detect
// this so we can tell the user to open the app in a real browser tab instead of
// showing a misleading "permission denied".
function isEmbeddedFrame() {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access throws — that itself means we're framed.
    return true;
  }
}

export function getCurrentPosition(
  options?: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    // Browsers block geolocation entirely on plain HTTP except on
    // localhost, and fail silently/immediately rather than prompting.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      reject(
        new LocationError(
          "insecure-context",
          "This page isn't served over HTTPS, so the browser blocks location access here (localhost is exempt). Use the deployed HTTPS URL, or HTTPS locally, to test this.",
        ),
      );
      return;
    }
    if (!("geolocation" in navigator)) {
      reject(
        new LocationError(
          "unsupported",
          "This browser doesn't support location access.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // An embedded frame reports denial with no prompt — surface the real
          // reason rather than telling the user to change a setting that won't
          // help.
          if (isEmbeddedFrame()) {
            reject(
              new LocationError(
                "embedded-frame",
                "Location is blocked because this page is open inside an embedded preview. Open the app in a normal browser tab (or install it), then try again.",
              ),
            );
            return;
          }
          reject(
            new LocationError(
              "denied",
              "Location access is blocked for this site. Tap the location or lock icon in your browser's address bar, set Location to Allow, then tap Try again.",
            ),
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(
            new LocationError(
              "unavailable",
              "Your device couldn't determine its location. Make sure Location Services are turned on, then try again.",
            ),
          );
        } else {
          reject(
            new LocationError(
              "timeout",
              "Location took too long to respond. Try again.",
            ),
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 60_000,
        ...options,
      },
    );
  });
}

export async function reportLocation(
  deviceId: string,
  secret: string,
  position: GeolocationPosition,
) {
  const res = await fetch(`/api/devices/${deviceId}/location`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
      source: "gps",
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new LocationError(
      "report-failed",
      data.error ?? `The server rejected the location report (${res.status}).`,
    );
  }
  return true;
}

export async function captureAndReport(deviceId: string, secret: string) {
  const position = await getCurrentPosition();
  return reportLocation(deviceId, secret, position);
}

export async function hasPendingPing(deviceId: string, secret: string) {
  const res = await fetch(`/api/devices/${deviceId}/pending-ping`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.pending;
}
