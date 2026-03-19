/**
 * main.js
 * Entry point — wires together camera feed, device sensors, ArcGIS scene,
 * AR layers, and the UI controls.
 */

import { startCameraFeed, stopCameraFeed } from "./camera-feed.js";
import {
  startGPS,
  stopGPS,
  startOrientation,
  stopOrientation,
  sensorState,
  recalibrate,
} from "./device-sensors.js";
import { initScene, startSensorSync, stopSensorSync, getView } from "./scene-manager.js";
import { initLayers, addWaypoint, setLayerVisibility } from "./ar-layers.js";

/* ── DOM refs ───────────────────────────────────────────────────── */
const videoEl = document.getElementById("camera-feed");
const btnStart = document.getElementById("btn-start");
const btnAddWP = document.getElementById("btn-add-waypoint");
const btnLayers = document.getElementById("btn-toggle-layers");
const btnRecal = document.getElementById("btn-recalibrate");

const layerPanel = document.getElementById("layer-panel");
const btnCloseLayers = document.getElementById("btn-close-layers");
const chkWaypoints = document.getElementById("layer-waypoints");
const chkPaths = document.getElementById("layer-paths");
const chkFeatures = document.getElementById("layer-features");

const waypointPopup = document.getElementById("waypoint-popup");
const popupContent = document.getElementById("popup-content");
const btnClosePopup = document.getElementById("btn-close-popup");

const gpsDot = document.getElementById("gps-status");
const oriDot = document.getElementById("orientation-status");
const camDot = document.getElementById("camera-status");
const accuracyDisp = document.getElementById("accuracy-display");
const headingDisp = document.getElementById("heading-display");

let arRunning = false;

/* ── Start AR session ───────────────────────────────────────────── */

async function startAR() {
  btnStart.disabled = true;
  btnStart.textContent = "Starting…";

  try {
    // 1. Camera
    await startCameraFeed(videoEl);
    camDot.className = "status-dot on";

    // 2. Scene
    const view = await initScene("sceneViewDiv");

    // 3. Layers
    await initLayers(view.map);

    // 4. GPS + Orientation
    startGPS();
    await startOrientation();

    // 5. Sync loop
    startSensorSync();

    // 6. Hit-test for waypoint taps
    view.on("click", async (event) => {
      const hit = await view.hitTest(event);
      if (hit.results.length > 0) {
        const attrs = hit.results[0].graphic?.attributes;
        if (attrs?.name) {
          popupContent.innerHTML = `
            <strong>${attrs.name}</strong><br>
            Lon: ${attrs.longitude?.toFixed(6)}<br>
            Lat: ${attrs.latitude?.toFixed(6)}<br>
            Alt: ${attrs.altitude ?? "—"} m
          `;
          waypointPopup.classList.remove("hidden");
        }
      }
    });

    // Enable buttons
    btnAddWP.disabled = false;
    btnLayers.disabled = false;
    btnRecal.disabled = false;

    btnStart.textContent = "Stop AR";
    btnStart.disabled = false;
    arRunning = true;
  } catch (err) {
    console.error("Failed to start AR:", err);
    btnStart.textContent = "Start AR";
    btnStart.disabled = false;
    alert("Could not start AR. Ensure camera and location permissions are granted.\n\n" + err.message);
  }
}

function stopAR() {
  stopSensorSync();
  stopGPS();
  stopOrientation();
  stopCameraFeed(videoEl);

  gpsDot.className = "status-dot off";
  oriDot.className = "status-dot off";
  camDot.className = "status-dot off";

  btnAddWP.disabled = true;
  btnLayers.disabled = true;
  btnRecal.disabled = true;

  btnStart.textContent = "Start AR";
  arRunning = false;
}

/* ── HUD update loop ────────────────────────────────────────────── */

setInterval(() => {
  if (!arRunning) return;

  gpsDot.className = sensorState.gpsReady ? "status-dot on" : "status-dot off";
  oriDot.className = sensorState.orientationReady ? "status-dot on" : "status-dot off";

  if (sensorState.gpsReady) {
    accuracyDisp.textContent = `Accuracy: ${sensorState.accuracy?.toFixed(1) ?? "—"} m`;
  }
  if (sensorState.orientationReady) {
    headingDisp.textContent = `Heading: ${sensorState.heading?.toFixed(0) ?? "—"}°`;
  }
}, 250);

/* ── Button handlers ────────────────────────────────────────────── */

btnStart.addEventListener("click", () => {
  if (arRunning) {
    stopAR();
  } else {
    startAR();
  }
});

btnAddWP.addEventListener("click", () => {
  if (!sensorState.gpsReady) {
    alert("GPS not ready yet.");
    return;
  }
  const label = prompt("Waypoint name (leave blank for auto):");
  addWaypoint(
    sensorState.longitude,
    sensorState.latitude,
    sensorState.altitude ?? 0,
    label || undefined
  );
});

btnRecal.addEventListener("click", () => {
  recalibrate();
  alert("Heading recalibrated. Point your phone north for best results.");
});

btnLayers.addEventListener("click", () => layerPanel.classList.toggle("hidden"));
btnCloseLayers.addEventListener("click", () => layerPanel.classList.add("hidden"));

chkWaypoints.addEventListener("change", () => setLayerVisibility("waypoints", chkWaypoints.checked));
chkPaths.addEventListener("change", () => setLayerVisibility("paths", chkPaths.checked));
chkFeatures.addEventListener("change", () => setLayerVisibility("features", chkFeatures.checked));

btnClosePopup.addEventListener("click", () => waypointPopup.classList.add("hidden"));
