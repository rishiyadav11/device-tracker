import L from "leaflet";

let fixed = false;

export function fixLeafletIcon() {
  if (fixed) return;
  fixed = true;
  // Bundlers don't resolve Leaflet's default marker image paths, so point
  // the default icon at the CDN copy instead.
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
    ._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}
