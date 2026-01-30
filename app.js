// State
let map;
let radiusCircle;
let floodLayer;

// Constants
const OS_NAMES_API_URL = 'https://api.os.uk/search/names/v1/find';
const SEPA_WMS_URL = 'https://map.sepa.org.uk/arcgis/services/FloodMaps/FloodMaps/MapServer/WMSServer';

// Search Handler
async function handleSearch() {
    const osKey = document.getElementById('os-key').value.trim();
    const sepaKey = document.getElementById('sepa-key').value.trim();
    const postcode = document.getElementById('postcode').value.trim();
    const radius = document.getElementById('radius').value;

    if (!osKey) {
        alert('Please enter an OS API Key.');
        return;
    }
    if (!postcode) {
        alert('Please enter a postcode.');
        return;
    }

    searchBtn.textContent = "Searching...";
    searchBtn.disabled = true;

    try {
        // 1. Search using OS Names API
        const query = encodeURIComponent(postcode);
        // names API usually takes just 'query'
        const namesUrl = `${OS_NAMES_API_URL}?query=${query}&key=${osKey}`;

        const response = await fetchWithLog(namesUrl);
        const data = await response.json();

        if (response.ok && data.results && data.results.length > 0) {
            const result = data.results[0].GAZETTEER_ENTRY;
            const easting = result.GEOMETRY_X;
            const northing = result.GEOMETRY_Y;
            const { lat, lng } = bngToLatLng(easting, northing);

            // 2. Update Map View
            map.flyTo([lat, lng], 13);

            // Update Base Layer to OS Maps
            L.tileLayer(`https://api.os.uk/maps/raster/v1/zxy/Light_3857/{z}/{x}/{y}.png?key=${osKey}`, {
                maxZoom: 20,
                attribution: '&copy; Crown copyright and database rights ' + new Date().getFullYear() + ' Ordnance Survey.'
            }).addTo(map);

            // Draw Radius
            if (radiusCircle) map.removeLayer(radiusCircle);
            radiusCircle = L.circle([lat, lng], {
                color: 'var(--accent-color)',
                fillColor: 'var(--accent-color)',
                fillOpacity: 0.1,
                radius: parseInt(radius)
            }).addTo(map);

            // --- SEPA FFIMS API Integration ---
            if (floodLayer) {
                floodLayer.clearLayers();
            } else {
                floodLayer = L.featureGroup().addTo(map);
            }

            if (sepaKey) {
                // Get Test Data Toggle State
                const includeTest = document.getElementById('sepa-test-toggle').checked;

                // Construct SEPA FFIMS URL (Using Local Proxy)
                const sepaUrl = `http://localhost:3000/sepa-proxy/areas/location?x=${easting}&y=${northing}&radius=${radius}&includeTestAreas=${includeTest}`;

                const sepaOptions = {
                    method: 'GET',
                    headers: {
                        'x-api-key': sepaKey,
                        'Accept': 'application/json'
                    }
                };

                try {
                    const sepaResponse = await fetchWithLog(sepaUrl, sepaOptions);

                    if (sepaResponse.ok) {
                        const sepaData = await sepaResponse.json();

                        if (Array.isArray(sepaData) && sepaData.length > 0) {
                            // Populate List Tab
                            renderAreasList(sepaData);

                            sepaData.forEach(area => {
                                // Draw Shape if available
                                if (area.shape) {
                                    try {
                                        const geoJsonGeometry = parseWKTToGeoJSON(area.shape);
                                        if (geoJsonGeometry) {
                                            const layer = L.geoJSON(geoJsonGeometry, {
                                                style: { color: '#ff4d4d', weight: 2, fillOpacity: 0.3 }
                                            }).bindPopup(`<strong>${area.name}</strong><br>${area.description || ''}`);
                                            floodLayer.addLayer(layer);
                                        }
                                    } catch (e) { console.warn('Could not parse shape', e); }
                                }
                            });
                        } else {
                            renderAreasList([]); // Clear list if no results
                        }
                    } else {
                        if (sepaResponse.status === 401 || sepaResponse.status === 403) {
                            alert('SEPA API Key Invalid or Unauthorized.');
                        }
                    }
                } catch (err) {
                    console.error('SEPA API Error', err);
                }
            }
        } else {
            alert('Postcode not found or API Error.');
        }

    } catch (error) {
        console.error(error);
        alert('An error occurred. See logs.');
    } finally {
        searchBtn.textContent = "Search Flood Zones";
        searchBtn.disabled = false;
    }
}

// DOM Elements
const searchBtn = document.getElementById('search-btn');
const logsTableBody = document.querySelector('#api-log-table tbody');

// Initialize Map
function initMap() {
    // Start centered on Scotland (approx)
    map = L.map('map').setView([56.4907, -4.2026], 7);

    // Initial placeholder tile layer (OSM)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // SEPA Flood Risk WMS Layer (Medium Likelihood)
    // Source: map.sepa.org.uk (ArcGIS Server)
    const wmsUrl = 'https://map.sepa.org.uk/server/services/Open/Flood_Maps/MapServer/WMSServer';
    const floodWms = L.tileLayer.wms(wmsUrl, {
        layers: 'River_Flooding_Medium_Likelihood22646,Coastal_Flooding_Medium_Likelihood21859,Surface_Water_and_Small_Watercourses_Flooding_Medium_Likelihood29035',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        crs: L.CRS.EPSG4326,
        attribution: 'SEPA Flood Maps'
    });
    floodWms.addTo(map);

    // Log the WMS usage for visibility
    console.log("SEPA WMS Layer initialized:", wmsUrl);

    // Feature Info Click Handler
    map.on('click', (e) => {
        getFeatureInfo(e, floodWms);
    });
}

// LOGGING FUNCTIONS
let apiCallCount = 0;
function logApiCall(method, url, status, data = null, apiName = 'Unknown API') {
    apiCallCount++;
    const row = document.createElement('tr');
    const displayUrl = url.length > 50 ? '...' + url.substring(url.length - 50) : url;
    let dataDisplay = '-';
    // Sanitize HTML if it's not JSON
    if (data) {
        try {
            const jsonStr = JSON.stringify(data, null, 2);
            dataDisplay = `<details><summary>View JSON</summary><pre>${jsonStr}</pre></details>`;
        } catch (e) {
            // It's a string, possibly HTML. Escape it!
            const escapedData = String(data)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            // Limit length for display
            const shortData = escapedData.length > 200 ? escapedData.substring(0, 200) + '...' : escapedData;

            dataDisplay = `<details><summary>View Response</summary><pre>${shortData}</pre></details>`;
        }
    }
    row.innerHTML = `<td>${apiCallCount}</td><td><strong>${apiName}</strong></td><td><span class="method">${method}</span></td><td class="${status >= 200 && status < 300 ? 'status-success' : 'status-error'}">${status}</td><td title="${url}"><a href="${url}" target="_blank" style="color: inherit; text-decoration: none;">${displayUrl}</a></td><td>${dataDisplay}</td>`;
    logsTableBody.prepend(row);
}

async function fetchWithLog(url, options = {}) {
    const method = options.method || 'GET';
    let apiName = 'External API';
    if (url.includes('api.os.uk/search/names')) apiName = 'OS Names API';
    else if (url.includes('api.os.uk/maps')) apiName = 'OS Maps API';
    else if (url.includes('map.sepa.org.uk') || url.includes('api.sepa.org.uk') || url.includes('htkhorizon.com')) apiName = 'SEPA Flood API';

    try {
        const response = await fetch(url, options);
        // Clone for reading
        const clone = response.clone();
        let data = null;
        try {
            const text = await clone.text();
            try { data = JSON.parse(text); } catch { data = text; }
        } catch (e) { data = "(Cannot read response body)"; }

        logApiCall(method, url, response.status, data, apiName);
        return response;
    } catch (error) {
        logApiCall(method, url, 'ERR', error.message, apiName);
        throw error;
    }
}

// Helper: Resolve Location (Geocode)
async function resolveLocation(postcode, osKey) {
    const query = encodeURIComponent(postcode);
    const namesUrl = `${OS_NAMES_API_URL}?query=${query}&key=${osKey}`;

    const response = await fetchWithLog(namesUrl);
    const data = await response.json();

    if (response.ok && data.results && data.results.length > 0) {
        const result = data.results[0].GAZETTEER_ENTRY;
        const easting = result.GEOMETRY_X;
        const northing = result.GEOMETRY_Y;
        const { lat, lng } = bngToLatLng(easting, northing);
        return { easting, northing, lat, lng };
    } else {
        throw new Error('Postcode not found');
    }
}

// Active Warnings Handler
async function handleWarningsSearch() {
    const osKey = document.getElementById('os-key').value.trim();
    const sepaKey = document.getElementById('sepa-key').value.trim();
    const postcode = document.getElementById('postcode').value.trim();
    const radius = document.getElementById('radius').value;

    if (!osKey) { alert('Please enter an OS API Key.'); return; }
    if (!postcode) { alert('Please enter a postcode.'); return; }

    switchTab('flood-warnings');

    const statusEl = document.getElementById('warnings-status');
    const tableBody = document.querySelector('#warnings-table tbody');
    const warningsBtn = document.getElementById('warnings-btn');

    statusEl.textContent = "Searching for active warnings...";
    tableBody.innerHTML = '';
    warningsBtn.disabled = true;

    // Reset API Logs
    const logBody = document.querySelector('#api-log-table tbody');
    if (logBody) logBody.innerHTML = '';
    apiCallCount = 0;

    try {
        const { easting, northing } = await resolveLocation(postcode, osKey);

        // Get Test Data Toggle State
        const includeTest = document.getElementById('sepa-test-toggle').checked;

        const sepaUrl = `http://localhost:3000/sepa-proxy/warnings/location?x=${easting}&y=${northing}&radius=${radius}&includeTestAreas=${includeTest}`;
        const sepaOptions = {
            method: 'GET',
            headers: {
                'x-api-key': sepaKey,
                'Accept': 'application/json'
            }
        };

        const response = await fetchWithLog(sepaUrl, sepaOptions);

        if (response.ok) {
            const data = await response.json();
            let warnings = [];
            if (Array.isArray(data)) warnings = data;
            else if (data.warnings) warnings = data.warnings;

            if (warnings.length === 0) {
                statusEl.textContent = "No active flood warnings in this area.";
            } else {
                statusEl.textContent = `Found ${warnings.length} active warning(s).`;
                warnings.forEach(w => {
                    const row = document.createElement('tr');
                    const severity = (w.severity || 'Low').toLowerCase(); // default to low
                    // Simple mapping or class usage
                    let sevClass = 'severity-low';
                    if (severity.includes('high')) sevClass = 'severity-high';
                    else if (severity.includes('medium')) sevClass = 'severity-medium';

                    row.innerHTML = `
                        <td class="${sevClass}"><strong>${w.severity || 'Info'}</strong></td>
                        <td>
                            <strong>${w.area_name || w.name || 'Unknown Area'}</strong><br>
                            <span style="font-size:0.9em">${w.message || w.description || ''}</span>
                        </td>
                        <td>${w.raised || w.time || '-'}</td>
                        <td>
                            <details>
                                <summary>View JSON</summary>
                                <pre style="font-size:0.75em; max-height: 150px; overflow: auto; background:#f0f0f0; color:#212529; padding:8px; border:1px solid #ccc; border-radius: 4px;">${JSON.stringify(w, null, 2)}</pre>
                            </details>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            }
        } else {
            statusEl.textContent = "Error fetching warnings.";
        }
    } catch (e) {
        console.error(e);
        statusEl.textContent = "Error: " + e.message;
    } finally {
        warningsBtn.disabled = false;
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = content.id === tabId ? 'block' : 'none';
        if (content.id === 'flood-zones' && content.style.display === 'block') {
            if (map) setTimeout(() => map.invalidateSize(), 100);
        }
    });
}
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    initTabs();
    searchBtn.addEventListener('click', handleSearch);
    document.getElementById('warnings-btn').addEventListener('click', handleWarningsSearch);
});


// COORD CONVERSION HELPER (Approximate BNG to LatLng for display)
// Using Helmert Transform for better accuracy if possible, or simple proj4. 
// Since we don't have proj4 lib imported, we will use a known lightweight conversion function.
// Source: A simplified version of OSTN15 is invalid here, so we use Helmert ref logic.
function bngToLatLng(easting, northing) {
    // ETRS89 constants
    const a = 6378137;
    const b = 6356752.3141;
    const F0 = 0.9996012717;
    const lat0 = 49 * Math.PI / 180;
    const lon0 = -2 * Math.PI / 180;
    const N0 = -100000;
    const E0 = 400000;
    const e2 = 1 - (b * b) / (a * a);
    const n = (a - b) / (a + b);

    let lat, lon;
    lat = lat0;
    let M = 0;

    do {
        lat = (northing - N0 - M) / (a * F0) + lat;
        const Ma = (1 + n + (5 / 4) * n * n + (5 / 4) * n * n * n) * (lat - lat0);
        const Mb = (3 * n + 3 * n * n + (21 / 8) * n * n * n) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
        const Mc = ((15 / 8) * n * n + (15 / 8) * n * n * n) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
        const Md = (35 / 24) * n * n * n * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
        M = b * F0 * (Ma - Mb + Mc - Md);
    } while (northing - N0 - M > 0.00001);

    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
    const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
    const eta2 = nu / rho - 1;

    const VII = Math.tan(lat) / (2 * rho * nu);
    const VIII = Math.tan(lat) / (24 * rho * nu * nu * nu) * (5 + 3 * Math.tan(lat) * Math.tan(lat) + eta2 - 9 * Math.tan(lat) * Math.tan(lat) * eta2);
    const IX = Math.tan(lat) / (720 * rho * nu * nu * nu * nu * nu) * (61 + 90 * Math.tan(lat) * Math.tan(lat) + 45 * Math.tan(lat) * Math.tan(lat) * Math.tan(lat) * Math.tan(lat));
    const X = (1 / cosLat) / nu;
    const XI = (1 / cosLat) / (6 * nu * nu * nu) * (nu / rho + 2 * Math.tan(lat) * Math.tan(lat));
    const XII = (1 / cosLat) / (120 * nu * nu * nu * nu * nu) * (5 + 28 * Math.tan(lat) * Math.tan(lat) + 24 * Math.tan(lat) * Math.tan(lat) * Math.tan(lat) * Math.tan(lat));
    const XIII = (1 / cosLat) / (5040 * nu * nu * nu * nu * nu * nu * nu) * (61 + 662 * Math.tan(lat) * Math.tan(lat) + 1320 * Math.tan(lat) * Math.tan(lat) * Math.tan(lat) * Math.tan(lat) + 720 * Math.tan(lat) * Math.tan(lat) * Math.tan(lat) * Math.tan(lat) * Math.tan(lat) * Math.tan(lat));

    const dE = easting - E0;
    lat = lat - VII * dE * dE + VIII * dE * dE * dE * dE - IX * dE * dE * dE * dE * dE * dE;
    lon = lon0 + X * dE - XI * dE * dE * dE + XII * dE * dE * dE * dE * dE - XIII * dE * dE * dE * dE * dE * dE * dE;

    return {
        lat: lat * 180 / Math.PI,
        lng: lon * 180 / Math.PI
    };
}

// Helper: Parse WKT to GeoJSON (Polygon/MultiPolygon)
function parseWKTToGeoJSON(wkt) {
    // Example WKT: "POLYGON ((x y, x y, ...))"
    if (!wkt.startsWith('POLYGON') && !wkt.startsWith('MULTIPOLYGON')) return null;

    const isMulti = wkt.startsWith('MULTIPOLYGON');
    const content = wkt.substring(wkt.indexOf('((') + 2, wkt.lastIndexOf('))'));

    // Very basic parser for single polygon for now, or use library
    try {


        const coordsText = content.replace(/\)/g, '').replace(/\(/g, '');
        const pairs = coordsText.split(',');
        const coordinates = [];

        pairs.forEach(pair => {
            const [x, y] = pair.trim().split(/\s+/);
            const latLng = bngToLatLng(parseFloat(x), parseFloat(y));
            coordinates.push([latLng.lng, latLng.lat]); // GeoJSON is [lng, lat]
        });

        // Close ring
        return {
            "type": "Polygon",
            "coordinates": [coordinates]
        };

    } catch (e) {
        return null;
    }
}

// Feature Info from WMS
function getFeatureInfo(evt, layer) {
    const url = getFeatureInfoUrl(
        map,
        layer,
        evt.latlng,
        {
            'info_format': 'text/plain' // Changed to text/plain for reliability
        }
    );

    // Transform URL to use local proxy
    // Original: https://map.sepa.org.uk/server/services/.../WMSServer?....
    // Proxy: http://localhost:3000/sepa-wms/server/services/...?....

    const proxyUrl = url.replace('https://map.sepa.org.uk', 'http://localhost:3000/sepa-wms');

    fetchWithLog(proxyUrl)
        .then(response => response.text()) // Use text as it might be HTML/XML
        .then(data => {
            // Direct HTML injection - simpler and often more reliable for Leaflet popups
            // than managing iframes (if the content is simple HTML/Table)
            const contentDiv = document.createElement('div');
            contentDiv.style.maxHeight = "250px";
            contentDiv.style.overflowY = "auto";

            const trimmedData = data ? data.trim() : '';
            if (!trimmedData) {
                contentDiv.innerHTML = '<p>No info available (Empty Response)</p>';
            } else {
                // Wrap plain text in pre for readability with high contrast
                contentDiv.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace; color: #000000; background-color: #ffffff; padding: 5px; border-radius: 4px;">${trimmedData}</pre>`;
            }

            L.popup()
                .setLatLng(evt.latlng)
                .setContent(contentDiv)
                .openOn(map);
        });
}

// WMS GetFeatureInfo URL Builder
function getFeatureInfoUrl(map, layer, latlng, params) {
    const point = map.latLngToContainerPoint(latlng, map.getZoom());
    const size = map.getSize();

    const defaultParams = {
        request: 'GetFeatureInfo',
        service: 'WMS',
        srs: 'EPSG:4326',
        styles: '',
        transparent: true,
        version: layer.options.version,
        format: layer.options.format,
        bbox: (layer.options.version === '1.3.0' && layer.options.crs === L.CRS.EPSG4326)
            ? `${map.getBounds().getSouth()},${map.getBounds().getWest()},${map.getBounds().getNorth()},${map.getBounds().getEast()}`
            : map.getBounds().toBBoxString(),
        height: size.y,
        width: size.x,
        layers: layer.options.layers,
        query_layers: layer.options.layers,
        info_format: 'text/html'
    };

    // WMS 1.3.0 uses 'i' and 'j' instead of 'x' and 'y'
    defaultParams[defaultParams.version === '1.3.0' ? 'i' : 'x'] = Math.round(point.x);
    defaultParams[defaultParams.version === '1.3.0' ? 'j' : 'y'] = Math.round(point.y);

    // Add additional params
    // ESRI WMS sometimes wants 'crs' instead of 'srs' for 1.3.0
    if (defaultParams.version === '1.3.0') {
        defaultParams.crs = defaultParams.srs;
        delete defaultParams.srs;
    }

    const allParams = { ...defaultParams, ...params };
    const queryString = Object.keys(allParams)
        .map(key => key + '=' + encodeURIComponent(allParams[key]))
        .join('&');

    return layer._url + '?' + queryString;
}

// Render Areas List in Tab
function renderAreasList(data) {
    const statusEl = document.getElementById('areas-status');
    const tableBody = document.querySelector('#areas-table tbody');

    // Check if elements exist before proceeding (safety)
    if (!statusEl || !tableBody) return;

    tableBody.innerHTML = ''; // Clear previous

    if (!data || data.length === 0) {
        statusEl.textContent = "No flood areas found in this radius.";
        return;
    }

    statusEl.textContent = `Found ${data.length} area(s).`;

    data.forEach(area => {
        const row = document.createElement('tr');

        // Name Column
        const nameCell = document.createElement('td');
        // Use a safe check for properties
        const name = area.name || area.NAME || 'Unknown Area';
        const desc = area.description || area.DESCRIPTION || '';
        nameCell.innerHTML = `<strong>${name}</strong><br><span style="font-size:0.9em; color:#666;">${desc}</span>`;

        // Data Column (JSON dump for "all fields")
        const dataCell = document.createElement('td');
        const jsonStr = JSON.stringify(area, null, 2);
        dataCell.innerHTML = `
            <details>
                <summary>View All Fields</summary>
                <pre style="font-size:0.75em; max-height: 150px; overflow: auto; background:#f0f0f0; color:#212529; padding:8px; border:1px solid #ccc; border-radius: 4px;">${jsonStr}</pre>
            </details>
        `;

        row.appendChild(nameCell);
        row.appendChild(dataCell);
        tableBody.appendChild(row);
    });
}
