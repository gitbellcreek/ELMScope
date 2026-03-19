/**
 * portal-auth.js
 * Handles ArcGIS Online OAuth 2.0 authentication and portal map browsing.
 * Users provide their own OAuth App Client ID to sign in.
 */

let portal = null;
let credential = null;

/**
 * Register OAuth and sign in via popup.
 * @param {string} clientId - The user's registered ArcGIS OAuth App ID
 * @returns {Promise<{portal: object, credential: object}>}
 */
export function signIn(clientId) {
  return new Promise((resolve, reject) => {
    require([
      "esri/identity/OAuthInfo",
      "esri/identity/IdentityManager",
      "esri/portal/Portal",
    ], (OAuthInfo, IdentityManager, Portal) => {
      const oauthInfo = new OAuthInfo({
        appId: clientId,
        portalUrl: "https://www.arcgis.com",
        popup: true,
        flowType: "authorization-code",
        popupCallbackUrl: getCallbackUrl(),
      });

      IdentityManager.registerOAuthInfos([oauthInfo]);

      IdentityManager.getCredential("https://www.arcgis.com/sharing")
        .then((cred) => {
          credential = cred;
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

/**
 * Build the OAuth callback URL relative to the current page.
 */
function getCallbackUrl() {
  const loc = window.location;
  const path = loc.pathname.replace(/\/[^/]*$/, "/oauth-callback.html");
  return `${loc.origin}${path}`;
}
