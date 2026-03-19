/**
 * scene-manager.js
 * Creates a transparent ArcGIS SceneView and continuously syncs its camera
 * with the device's real-world GPS position and orientation.
 */

import { sensorState, getCalibratedHeading } from "./device-sensors.js";

let view = null;
let animFrameId = null;

/**
 * Initialise the ArcGIS SceneView with a transparent background.
 * Returns a Promise that resolves with the view once it's ready.
 */
export function initScene(container) {
  return new Promise((resolve, reject) => {
    require([
      "esri/Map",
      "esri/views/SceneView",
      "esri/Camera",
      "esri/geometry/Point",
      "esri/views/3d/environment/VirtualLighting",
    ], (Map, SceneView, Camera, Point, VirtualLighting) => {
      const map = new Map({
        basemap: null, // no basemap — we want to see the camera feed
        ground: "world-elevation",
      });

      view = new SceneView({
        container,
        map,
        alphaCompositingEnabled: true, // key: transparent background
        qualityProfile: "high",
        environment: {
          background: { type: "color", color: [0, 0, 0, 0] },
          atmosphereEnabled: false,
          starsEnabled: false,
          lighting: {
            type: "virtual",
          },
        },
        ui: { components: [] }, // hide default widgets
        // Start with a sensible default camera; will be overridden by sensors
        camera: new Camera({
          position: new Point({
            longitude: -98.5795,
            latitude: 39.8283,
            z: 1.6,
            spatialReference: { wkid: 4326 },
          }),
          heading: 0,
          tilt: 90,
          fov: 55,
        }),
      });

      view.when(() => resolve(view), reject);
    });
  });
}

/**
 * Start the render loop that syncs the SceneView camera to device sensors.
 */
export function startSensorSync() {
  function loop() {
    if (!view || view.destroyed) return;

    if (sensorState.gpsReady && sensorState.orientationReady) {
      require(["esri/Camera", "esri/geometry/Point"], (Camera, Point) => {
        const cam = new Camera({
          position: new Point({
            longitude: sensorState.longitude,
            latitude: sensorState.latitude,
            z: sensorState.altitude ?? 1.6,
            spatialReference: { wkid: 4326 },
          }),
          heading: getCalibratedHeading(),
          tilt: sensorState.tilt,
          fov: 55,
        });

        // goTo with no animation for instant update
        view.goTo(cam, { animate: false }).catch(() => {});
      });
    }

    animFrameId = requestAnimationFrame(loop);
  }

  animFrameId = requestAnimationFrame(loop);
}

export function stopSensorSync() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

export function getView() {
  return view;
}
