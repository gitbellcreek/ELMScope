/**
 * device-sensors.js
 * Wraps the Geolocation API and DeviceOrientation events and exposes a
 * reactive state object that the scene-manager reads each frame.
 */

export const sensorState = {
  // GPS
  latitude: null,
  longitude: null,
  altitude: null,        // metres above WGS-84 ellipsoid (may be null)
  accuracy: null,        // metres
  altitudeAccuracy: null,
  gpsReady: false,

  // Orientation (degrees)
  heading: 0,   // compass heading 0-360
  tilt: 90,     // 0 = straight up, 90 = horizon, 180 = straight down
  roll: 0,

  orientationReady: false,
};

let watchId = null;
let orientationBound = false;

/* ── GPS ─────────────────────────────────────────────────────────────── */

export function startGPS() {
  if (!("geolocation" in navigator)) {
    console.warn("Geolocation not available");
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      sensorState.latitude = pos.coords.latitude;
      sensorState.longitude = pos.coords.longitude;
      sensorState.altitude = pos.coords.altitude ?? 1.6; // default eye-height
      sensorState.accuracy = pos.coords.accuracy;
      sensorState.altitudeAccuracy = pos.coords.altitudeAccuracy;
      sensorState.gpsReady = true;
    },
    (err) => console.warn("GPS error:", err.message),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
}

export function stopGPS() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  sensorState.gpsReady = false;
}

/* ── Orientation ─────────────────────────────────────────────────────── */

function onDeviceOrientation(e) {
  // Use webkitCompassHeading (iOS) or alpha (Android)
  if (e.webkitCompassHeading !== undefined) {
    sensorState.heading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    // On Android, alpha is relative to the device's initial orientation.
    // For a compass heading we need absolute orientation when available.
    sensorState.heading = e.absolute ? (360 - e.alpha) % 360 : e.alpha;
  }

  // beta: front/back tilt (-180 to 180) — map to SceneView tilt
  // When phone is held upright, beta ≈ 90 → tilt should be 90 (horizon).
  if (e.beta !== null) {
    // Clamp to [0, 180] for ArcGIS camera tilt
    sensorState.tilt = Math.max(0, Math.min(180, e.beta));
  }

  if (e.gamma !== null) {
    sensorState.roll = e.gamma; // left/right tilt
  }

  sensorState.orientationReady = true;
}

export async function startOrientation() {
  // iOS 13+ requires permission
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const perm = await DeviceOrientationEvent.requestPermission();
    if (perm !== "granted") {
      console.warn("Orientation permission denied");
      return;
    }
  }

  window.addEventListener("deviceorientation", onDeviceOrientation, true);
  orientationBound = true;
}

export function stopOrientation() {
  if (orientationBound) {
    window.removeEventListener("deviceorientation", onDeviceOrientation, true);
    orientationBound = false;
  }
  sensorState.orientationReady = false;
}

/* ── Heading offset for calibration ──────────────────────────────────── */

let headingOffset = 0;

export function recalibrate() {
  // Store current heading as the "zero" so the user can correct drift.
  headingOffset = sensorState.heading;
}

export function getCalibratedHeading() {
  return (sensorState.heading - headingOffset + 360) % 360;
}
