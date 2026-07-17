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

function toLocationError(err: GeolocationPositionError): LocationError {
  if (err.code === err.PERMISSION_DENIED) {
    // An embedded frame reports denial with no prompt — surface the real
    // reason rather than telling the user to change a setting that won't help.
    if (isEmbeddedFrame()) {
      return new LocationError(
        "embedded-frame",
        "Location is blocked because this page is open inside an embedded preview. Open the app in a normal browser tab (or install it), then try again.",
      );
    }
    return new LocationError(
      "denied",
      "Location access is blocked for this site. Tap the location or lock icon in your browser's address bar, set Location to Allow, then tap Try again.",
    );
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return new LocationError(
      "unavailable",
      "Your device couldn't determine its location. Make sure Location Services are turned on, then try again.",
    );
  }
  return new LocationError(
    "timeout",
    "Location took too long to respond. Try again.",
  );
}

function precheck(): LocationError | null {
  // Browsers block geolocation entirely on plain HTTP except on localhost,
  // and fail silently/immediately rather than prompting.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return new LocationError(
      "insecure-context",
      "This page isn't served over HTTPS, so the browser blocks location access here (localhost is exempt). Use the deployed HTTPS URL, or HTTPS locally, to test this.",
    );
  }
  if (!("geolocation" in navigator)) {
    return new LocationError(
      "unsupported",
      "This browser doesn't support location access.",
    );
  }
  return null;
}

export function getCurrentPosition(
  options?: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const pre = precheck();
    if (pre) {
      reject(pre);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(toLocationError(err)),
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        // Always take a fresh reading — never a stale cached (often coarse) one.
        maximumAge: 0,
        ...options,
      },
    );
  });
}

// GPS fixes converge over a few seconds: the first reading is usually the
// coarse WiFi/cell estimate and later readings tighten as satellites lock in.
// Rather than reporting the first (often inaccurate) fix, watch briefly and
// keep the most accurate reading, returning early once it's good enough.
export function getBestPosition({
  desiredAccuracyMeters = 25,
  maxWaitMs = 12_000,
}: { desiredAccuracyMeters?: number; maxWaitMs?: number } = {}): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const pre = precheck();
    if (pre) {
      reject(pre);
      return;
    }

    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else
        reject(
          new LocationError("timeout", "Couldn't get a location fix. Try again."),
        );
    };

    const timer = setTimeout(finish, maxWaitMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos;
        }
        // Accurate enough — stop early instead of draining the whole window.
        if (best.coords.accuracy <= desiredAccuracyMeters) finish();
      },
      (err) => {
        // Only fail outright if we have nothing at all; a transient error
        // after a good reading shouldn't discard it.
        if (!best) {
          settled = true;
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          reject(toLocationError(err));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: maxWaitMs,
        maximumAge: 0,
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
  const position = await getBestPosition();
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
