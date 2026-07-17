"use client";

import { useEffect } from "react";
import {
  captureAndReport,
  hasPendingPing,
  listStoredDevices,
} from "@/lib/device-client";

const REPORT_INTERVAL_MS = 5 * 60 * 1000;
const PING_POLL_INTERVAL_MS = 20 * 1000;

/**
 * Runs on every page. For any device this browser holds a secret for
 * (i.e. was set up from here), silently reports a fresh location on load,
 * on tab foreground, and on an interval while the tab stays open. Browsers
 * don't allow real background GPS access, so this is best-effort — it only
 * runs while this page is actually open somewhere.
 */
export function DeviceAgent() {
  useEffect(() => {
    const reportAll = () => {
      for (const { id, secret } of listStoredDevices()) {
        captureAndReport(id, secret).catch(() => {
          // Permission denied or offline — silently skip, try again next cycle.
        });
      }
    };

    reportAll();

    const reportInterval = setInterval(reportAll, REPORT_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reportAll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Separately, poll for on-demand "Locate Now" requests from the
    // dashboard and respond immediately when one comes in.
    const checkPings = async () => {
      for (const { id, secret } of listStoredDevices()) {
        try {
          if (await hasPendingPing(id, secret)) {
            await captureAndReport(id, secret);
          }
        } catch {
          // Ignore and try again next cycle.
        }
      }
    };
    const pingInterval = setInterval(checkPings, PING_POLL_INTERVAL_MS);

    return () => {
      clearInterval(reportInterval);
      clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
