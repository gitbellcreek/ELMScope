/**
 * portal-auth.js
 * Handles ArcGIS Online authentication and portal map browsing.
 * Uses simple token-based auth — user signs in with their ArcGIS
 * Online username and password, no OAuth app registration needed.
 */

let portal = null;
let credential = null;

/**
 * Sign in with ArcGIS Online username and password.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{portal: object, credential: object}>}
 */
export function signIn(username, password) {
  return new Promise((resolve, reject) => {
    require([
      "esri/identity/IdentityManager",
      "esri/portal/Portal",
    ], (IdentityManager, Portal) => {
      // Call the ArcGIS Online token endpoint directly
      const tokenUrl = "https://www.arcgis.com/sharing/rest/generateToken";
      const body = new URLSearchParams({
        username,
        password,
        referer: window.location.origin,
        expiration: 120,
        f: "json",
      });

      fetch(tokenUrl, { method: "POST", body })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            throw new Error(data.error.message || "Token generation failed");
          }

          credential = {
            userId: username,
            server: "https://www.arcgis.com/sharing",
            token: data.token,
            expires: data.expires,
          };

          IdentityManager.registerToken(credential);

          portal = new Portal({ url: "https://www.arcgis.com" });
          portal.authMode = "immediate";
          return portal.load();
        })
        .then(() => {
          resolve({ portal, credential });
        })
        .catch((err) => {
          reject(err);
        });
    });
  });
}

/**
 * Sign out and destroy credentials.
 */
export function signOut() {
  return new Promise((resolve) => {
    require(["esri/identity/IdentityManager"], (IdentityManager) => {
      IdentityManager.destroyCredentials();
      portal = null;
      credential = null;
      resolve();
    });
  });
}

/**
 * Query the authenticated user's web maps from their portal.
 * @param {string} [query] - Optional search text to filter maps
 * @returns {Promise<Array>} Array of portal item objects
 */
export function fetchUserWebMaps(query) {
  if (!portal) throw new Error("Not signed in");

  const searchQuery = query
    ? `owner:${portal.user.username} type:"Web Map" ${query}`
    : `owner:${portal.user.username} type:"Web Map"`;

  return portal
    .queryItems({
      query: searchQuery,
      sortField: "modified",
      sortOrder: "desc",
      num: 50,
    })
    .then((result) => result.results);
}

/**
 * Query the portal's public/org web maps (not limited to user's own).
 * @param {string} query - Search text
 * @returns {Promise<Array>}
 */
export function searchPortalMaps(query) {
  if (!portal) throw new Error("Not signed in");

  return portal
    .queryItems({
      query: `type:"Web Map" ${query || ""}`.trim(),
      sortField: "num-views",
      sortOrder: "desc",
      num: 50,
    })
    .then((result) => result.results);
}

/**
 * Load a WebMap's operational layers into an existing Map/SceneView.
 * Returns the loaded WebMap so callers can inspect layers.
 * @param {string} itemId - The portal item ID of the web map
 * @param {object} sceneMap - The existing esri/Map instance
 * @returns {Promise<object>} The loaded WebMap
 */
export function loadWebMapLayers(itemId, sceneMap) {
  return new Promise((resolve, reject) => {
    require(["esri/WebMap"], (WebMap) => {
      const webMap = new WebMap({ portalItem: { id: itemId } });

      webMap
        .load()
        .then(() => {
          // Add each operational layer from the web map to our AR scene
          const layers = webMap.layers.toArray();
          layers.forEach((layer) => {
            // Drape 2D web map features on the ground surface
            layer.elevationInfo = { mode: "on-the-ground" };
            sceneMap.add(layer);
          });
          resolve({ webMap, layers });
        })
        .catch(reject);
    });
  });
}

/**
 * Remove previously loaded web map layers from the scene.
 * @param {object} sceneMap - The existing esri/Map instance
 * @param {Array} layers - Layers to remove
 */
export function removeWebMapLayers(sceneMap, layers) {
  if (!layers) return;
  layers.forEach((layer) => {
    sceneMap.remove(layer);
  });
}

export function getPortal() {
  return portal;
}

export function isSignedIn() {
  return portal !== null && credential !== null;
}

export function getToken() {
  return credential ? credential.token : null;
}

