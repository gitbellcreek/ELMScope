/**
 * ar-layers.js
 * Creates and manages the three AR data layers:
 *   1. Waypoints (3D points with billboarded icons and labels)
 *   2. Paths (3D polylines connecting waypoints)
 *   3. Features (3D extruded polygons / objects)
 *
 * All data is stored client-side in GraphicsLayers for simplicity.
 * Swap these for FeatureLayers pointing at hosted services for production.
 */

let waypointLayer = null;
let pathLayer = null;
let featureLayer = null;

// In-memory store
const waypoints = [];
let waypointCounter = 0;

/* ── Initialise layers ─────────────────────────────────────────────── */

export function initLayers(map) {
  return new Promise((resolve) => {
    require([
      "esri/layers/GraphicsLayer",
    ], (GraphicsLayer) => {
      waypointLayer = new GraphicsLayer({ title: "Waypoints", elevationInfo: { mode: "relative-to-ground" } });
      pathLayer = new GraphicsLayer({ title: "Paths", elevationInfo: { mode: "relative-to-ground" } });
      featureLayer = new GraphicsLayer({ title: "3D Features", elevationInfo: { mode: "relative-to-ground" } });

      map.addMany([featureLayer, pathLayer, waypointLayer]);

      // Add some demo data so the user sees something immediately
      addDemoData();

      resolve({ waypointLayer, pathLayer, featureLayer });
    });
  });
}

/* ── Waypoints ─────────────────────────────────────────────────────── */

export function addWaypoint(longitude, latitude, altitude, label) {
  return new Promise((resolve) => {
    require([
      "esri/Graphic",
      "esri/geometry/Point",
      "esri/symbols/PointSymbol3D",
      "esri/symbols/IconSymbol3DLayer",
      "esri/symbols/TextSymbol3DLayer",
      "esri/symbols/LabelSymbol3D",
    ], (Graphic, Point, PointSymbol3D, IconSymbol3DLayer, TextSymbol3DLayer) => {
      waypointCounter++;
      const name = label || `WP-${waypointCounter}`;

      const point = new Point({
        longitude,
        latitude,
        z: altitude ?? 0,
        spatialReference: { wkid: 4326 },
      });

      const symbol = new PointSymbol3D({
        symbolLayers: [
          new IconSymbol3DLayer({
            resource: { primitive: "circle" },
            material: { color: [0, 255, 255, 0.9] },
            outline: { color: [255, 255, 255, 0.7], size: 1 },
            size: 14,
          }),
          new TextSymbol3DLayer({
            text: name,
            material: { color: [0, 255, 255, 1] },
            font: { size: 11, weight: "bold" },
            halo: { color: [0, 0, 0, 0.8], size: 1.5 },
          }),
        ],
        verticalOffset: {
          screenLength: 40,
          maxWorldLength: 200,
          minWorldLength: 20,
        },
        callout: {
          type: "line",
          size: 1,
          color: [0, 255, 255, 0.5],
        },
      });

      const graphic = new Graphic({
        geometry: point,
        symbol,
        attributes: { name, longitude, latitude, altitude },
        popupTemplate: {
          title: "{name}",
          content: "Lon: {longitude}<br>Lat: {latitude}<br>Alt: {altitude} m",
        },
      });

      waypointLayer.add(graphic);
      waypoints.push({ longitude, latitude, altitude, name, graphic });

      // Auto-update path
      rebuildPath();

      resolve(graphic);
    });
  });
}

/* ── Path (auto-connects waypoints in order) ─────────────────────── */

function rebuildPath() {
  if (waypoints.length < 2) return;

  require([
    "esri/Graphic",
    "esri/geometry/Polyline",
    "esri/symbols/LineSymbol3D",
    "esri/symbols/LineSymbol3DLayer",
  ], (Graphic, Polyline, LineSymbol3D, LineSymbol3DLayer) => {
    pathLayer.removeAll();

    const coords = waypoints.map((wp) => [wp.longitude, wp.latitude, wp.altitude ?? 0]);

    const line = new Polyline({
      paths: [coords],
      spatialReference: { wkid: 4326 },
    });

    const symbol = new LineSymbol3D({
      symbolLayers: [
        new LineSymbol3DLayer({
          material: { color: [0, 200, 255, 0.7] },
          size: 3,
          pattern: {
            type: "style",
            style: "dash",
          },
        }),
      ],
    });

    pathLayer.add(new Graphic({ geometry: line, symbol }));
  });
}

/* ── 3D Features (extruded polygons) ─────────────────────────────── */

export function addFeature3D(rings, height, color, label) {
  return new Promise((resolve) => {
    require([
      "esri/Graphic",
      "esri/geometry/Polygon",
      "esri/symbols/PolygonSymbol3D",
      "esri/symbols/ExtrudeSymbol3DLayer",
    ], (Graphic, Polygon, PolygonSymbol3D, ExtrudeSymbol3DLayer) => {
      const polygon = new Polygon({
        rings,
        spatialReference: { wkid: 4326 },
      });

      const symbol = new PolygonSymbol3D({
        symbolLayers: [
          new ExtrudeSymbol3DLayer({
            size: height,
            material: { color: color || [0, 150, 255, 0.5] },
            edges: {
              type: "solid",
              color: [255, 255, 255, 0.3],
              size: 1,
            },
          }),
        ],
      });

      const graphic = new Graphic({
        geometry: polygon,
        symbol,
        attributes: { label: label || "Feature" },
      });

      featureLayer.add(graphic);
      resolve(graphic);
    });
  });
}

/* ── 3D Lines (standalone polylines, e.g. boundaries) ────────────── */

export function addLine3D(paths, color, width) {
  return new Promise((resolve) => {
    require([
      "esri/Graphic",
      "esri/geometry/Polyline",
      "esri/symbols/LineSymbol3D",
      "esri/symbols/LineSymbol3DLayer",
    ], (Graphic, Polyline, LineSymbol3D, LineSymbol3DLayer) => {
      const polyline = new Polyline({
        paths,
        spatialReference: { wkid: 4326 },
      });

      const symbol = new LineSymbol3D({
        symbolLayers: [
          new LineSymbol3DLayer({
            material: { color: color || [255, 100, 0, 0.8] },
            size: width || 2,
          }),
        ],
      });

      const graphic = new Graphic({ geometry: polyline, symbol });
      pathLayer.add(graphic);
      resolve(graphic);
    });
  });
}

/* ── Demo data ───────────────────────────────────────────────────── */

function addDemoData() {
  // A few demo waypoints near the Statue of Liberty for easy testing
  const demoWaypoints = [
    { lon: -74.0445, lat: 40.6892, alt: 5, label: "Liberty Island" },
    { lon: -74.0134, lat: 40.7128, alt: 10, label: "Manhattan South" },
    { lon: -74.006, lat: 40.7143, alt: 15, label: "Brooklyn Bridge" },
    { lon: -73.9857, lat: 40.7484, alt: 20, label: "Empire State" },
  ];

  demoWaypoints.forEach((wp) => addWaypoint(wp.lon, wp.lat, wp.alt, wp.label));

  // Demo 3D extruded feature (small box near Liberty Island)
  addFeature3D(
    [
      [
        [-74.046, 40.688],
        [-74.043, 40.688],
        [-74.043, 40.690],
        [-74.046, 40.690],
        [-74.046, 40.688],
      ],
    ],
    50,
    [0, 200, 100, 0.4],
    "Demo Zone"
  );

  // Demo standalone 3D line
  addLine3D(
    [
      [
        [-74.0445, 40.6892, 5],
        [-74.0134, 40.7128, 10],
        [-74.006, 40.7143, 15],
        [-73.9857, 40.7484, 20],
      ],
    ],
    [255, 200, 0, 0.8],
    4
  );
}

/* ── Layer visibility ────────────────────────────────────────────── */

export function setLayerVisibility(layerName, visible) {
  const layerMap = {
    waypoints: waypointLayer,
    paths: pathLayer,
    features: featureLayer,
  };
  const layer = layerMap[layerName];
  if (layer) layer.visible = visible;
}

export function getWaypoints() {
  return waypoints;
}
