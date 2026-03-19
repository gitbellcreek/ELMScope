/**
 * main.js
 * Entry point — wires together camera feed, device sensors, ArcGIS scene,
 * AR layers, portal authentication, and the UI controls.
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
import {
  signIn,
  signOut,
  fetchUserWebMaps,
  searchPortalMaps,
  loadWebMapLayers,
  removeWebMapLayers,
  getPortal,
  isSignedIn,
  getToken,
} from "./portal-auth.js";

/* ── DOM refs ───────────────────────────────────────────────────── */
const videoEl = document.getElementById("camera-feed");
const btnStart = document.getElementById("btn-start");
const btnAddWP = document.getElementById("btn-add-waypoint");
const btnBrowseMaps = document.getElementById("btn-browse-maps");
const btnLayers = document.getElementById("btn-toggle-layers");
const btnRecal = document.getElementById("btn-recalibrate");

const layerPanel = document.getElementById("layer-panel");
const btnCloseLayers = document.getElementById("btn-close-layers");
const chkWaypoints = document.getElementById("layer-waypoints");
const chkPaths = document.getElementById("layer-paths");
const chkFeatures = document.getElementById("layer-features");
const webmapLayerToggles = document.getElementById("webmap-layer-toggles");

const waypointPopup = document.getElementById("waypoint-popup");
const popupContent = document.getElementById("popup-content");
const btnClosePopup = document.getElementById("btn-close-popup");

const gpsDot = document.getElementById("gps-status");
const oriDot = document.getElementById("orientation-status");
const camDot = document.getElementById("camera-status");
const accuracyDisp = document.getElementById("accuracy-display");
const headingDisp = document.getElementById("heading-display");

// Login overlay
const loginOverlay = document.getElementById("login-overlay");
const usernameInput = document.getElementById("username-input");
const passwordInput = document.getElementById("password-input");
const btnSignIn = document.getElementById("btn-sign-in");
const btnSkipLogin = document.getElementById("btn-skip-login");
const loginError = document.getElementById("login-error");

// Map browser
const mapBrowser = document.getElementById("map-browser");
const mapGrid = document.getElementById("map-grid");
const mapSearchInput = document.getElementById("map-search-input");
const btnSearchMaps = document.getElementById("btn-search-maps");
const btnMyMaps = document.getElementById("btn-my-maps");
const btnCloseBrowser = document.getElementById("btn-close-browser");
const btnSignOut = document.getElementById("btn-sign-out");
const portalUserInfo = document.getElementById("portal-user-info");

let arRunning = false;
let loadedWebMapLayers = null; // track currently loaded web map layers

/* ── Login flow ─────────────────────────────────────────────────── */

btnSignIn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showLoginError("Please enter your username and password.");
    return;
  }

  btnSignIn.disabled = true;
  btnSignIn.textContent = "Signing in…";
  loginError.classList.add("hidden");

  try {
    await signIn(username, password);
    passwordInput.value = "";
    loginOverlay.classList.add("hidden");
    showMapBrowser();
  } catch (err) {
    console.error("Sign-in failed:", err);
    showLoginError("Sign-in failed: " + (err.message || "Invalid username or password"));
  } finally {
    btnSignIn.disabled = false;
    btnSignIn.textContent = "Sign In";
  }
});

btnSkipLogin.addEventListener("click", () => {
  loginOverlay.classList.add("hidden");
});

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove("hidden");
}

/* ── Map browser ────────────────────────────────────────────────── */

async function showMapBrowser() {
  mapBrowser.classList.remove("hidden");
  const p = getPortal();
  if (p && p.user) {
    portalUserInfo.textContent = `Signed in as ${p.user.fullName || p.user.username}`;
  }
  await loadMyMaps();
}

async function loadMyMaps() {
  mapGrid.innerHTML = '<div class="map-grid-loading">Loading your maps…</div>';
  try {
    const items = await fetchUserWebMaps();
    renderMapGrid(items);
  } catch (err) {
    mapGrid.innerHTML = `<div class="map-grid-loading">Error: ${err.message}</div>`;
  }
}

async function searchMaps(query) {
  mapGrid.innerHTML = '<div class="map-grid-loading">Searching…</div>';
  try {
    const items = await searchPortalMaps(query);
    renderMapGrid(items);
  } catch (err) {
    mapGrid.innerHTML = `<div class="map-grid-loading">Error: ${err.message}</div>`;
  }
}

function renderMapGrid(items) {
  if (!items || items.length === 0) {
    mapGrid.innerHTML = '<div class="map-grid-loading">No web maps found.</div>';
    return;
  }

  mapGrid.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "map-card";
    card.dataset.itemId = item.id;

    let thumb = item.thumbnailUrl || "https://www.arcgis.com/sharing/rest/content/items/" + item.id + "/info/" + (item.thumbnail || "thumbnail/ago_downloaded.png");
    const token = getToken();
    if (token && !thumb.includes("token=")) {
      thumb += (thumb.includes("?") ? "&" : "?") + "token=" + token;
    }

    card.innerHTML = `
      <img class="map-card-thumb" src="${thumb}" alt="" onerror="this.style.display='none'" />
      <div class="map-card-info">
        <div class="map-card-title">${escapeHtml(item.title)}</div>
        <div class="map-card-meta">${escapeHtml(item.owner)} · ${new Date(item.modified).toLocaleDateString()}</div>
      </div>
    `;

    card.addEventListener("click", () => onSelectMap(item));
    mapGrid.appendChild(card);
  });
}

async function onSelectMap(item) {
  mapBrowser.classList.add("hidden");

  // If AR is running, load directly. Otherwise, store and load after AR starts.
  if (arRunning) {
    await loadSelectedMap(item);
  } else {
    // Store selection, will load after AR starts
    window._pendingMapItem = item;
    alert(`"${item.title}" selected. Start AR to see its layers.`);
  }
}

async function loadSelectedMap(item) {
  const view = getView();
  if (!view) return;

  // Remove previously loaded web map layers
  if (loadedWebMapLayers) {
    removeWebMapLayers(view.map, loadedWebMapLayers);
    loadedWebMapLayers = null;
    webmapLayerToggles.innerHTML = "";
  }

  try {
    const result = await loadWebMapLayers(item.id, view.map);
    loadedWebMapLayers = result.layers;

    // Build layer toggles in the layer panel
    buildWebMapLayerToggles(result.layers);
  } catch (err) {
    console.error("Failed to load web map:", err);
    alert("Failed to load map: " + err.message);
  }
}

function buildWebMapLayerToggles(layers) {
  webmapLayerToggles.innerHTML = "";
  if (!layers || layers.length === 0) return;

  const header = document.createElement("h4");
  header.textContent = "Web Map Layers";
  header.style.marginTop = "12px";
  webmapLayerToggles.appendChild(header);

  layers.forEach((layer) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = layer.visible;
    checkbox.addEventListener("change", () => {
      layer.visible = checkbox.checked;
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + (layer.title || "Untitled Layer")));
    webmapLayerToggles.appendChild(label);
  });
}

btnSearchMaps.addEventListener("click", () => {
  const q = mapSearchInput.value.trim();
  if (q) searchMaps(q);
});

mapSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = mapSearchInput.value.trim();
    if (q) searchMaps(q);
  }
});

btnMyMaps.addEventListener("click", loadMyMaps);

btnCloseBrowser.addEventListener("click", () => {
  mapBrowser.classList.add("hidden");
});

btnSignOut.addEventListener("click", async () => {
  await signOut();
  mapBrowser.classList.add("hidden");

  // Remove loaded web map layers
  if (loadedWebMapLayers && arRunning) {
    const view = getView();
    if (view) removeWebMapLayers(view.map, loadedWebMapLayers);
    loadedWebMapLayers = null;
    webmapLayerToggles.innerHTML = "";
  }

  loginOverlay.classList.remove("hidden");
});

btnBrowseMaps.addEventListener("click", () => {
  if (isSignedIn()) {
    showMapBrowser();
  } else {
    loginOverlay.classList.remove("hidden");
  }
});

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
    btnBrowseMaps.disabled = false;
    btnLayers.disabled = false;
    btnRecal.disabled = false;

    btnStart.textContent = "Stop AR";
    btnStart.disabled = false;
    arRunning = true;

    // Load pending map if user selected one before starting AR
    if (window._pendingMapItem) {
      await loadSelectedMap(window._pendingMapItem);
      window._pendingMapItem = null;
    }
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
  btnBrowseMaps.disabled = true;
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

/* ── Utilities ──────────────────────────────────────────────────── */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
