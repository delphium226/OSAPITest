// State
let map;
let radiusCircle;
let floodLayer;

// Constants
const OS_NAMES_API_URL = 'https://api.os.uk/search/names/v1/find';
const SEPA_WMS_URL = 'https://map.sepa.org.uk/arcgis/services/FloodMaps/FloodMaps/MapServer/WMSServer';

// ... (DOM Elements and Init Map remain same)

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

            // Extract Coordinates
            const easting = result.GEOMETRY_X;
            const northing = result.GEOMETRY_Y;

            // Need Lat/Lng for Leaflet.
            // OS Names API typically returns Easting/Northing (EPSG:27700).
            // We need to convert or check if Lat/Lng provided.
            // *If* OS Names doesn't provide Lat/Lng, we need a converter.
            // For now, let's assume valid X/Y for SEPA but we need Lat/Lng for Map.

            // Simple approximation or hard requirement for Proj4?
            // "Lightweight" harness... 
            // Let's assume for a moment the user might want to see the error or I need to fix it.
            // I'll grab Lat/Lng if available, else alert.
            // Actually, OS Names API *does* support `output_srs` in some versions or I might require proj4.
            // *Wait*, let's assume I need proj4. I'll inject it.

            // TEMPORARY: Attempt to read Lat/Lng if they exist in a hidden field, else use a placeholder or convert.
            // Actually, most OS JSON APIs return 'GEOMETRY_X' and 'GEOMETRY_Y'.
            // I will add a conversion function for BNG to WGS84. It's complex math but I can include a small function.
            // OR I can use PROJ4 via CDN.

            // Let's defer map centering to after I confirm I have coords.
            // But SEPA API *NOT_USEDS* Easting/Northing, so we are GOOD for SEPA.
            // Map needs Lat/Lng.

            // I'll do a quick approximate conversion or look for CDN in next step if this fails to render.
            // For now, let's update the API call first.

            // ... (Rest of logic)

            // We will use X/Y for SEPA.
            // We need Lat/Lng for Map.

        } else {
            alert('Postcode not found or API Error.');
        }

    } catch (error) {
        // ...
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

// Logging State
let apiCallCount = 0;

// Log API Call to Table
function logApiCall(method, url, status, data = null, apiName = 'Unknown API') {
    apiCallCount++;
    const row = document.createElement('tr');

    // Truncate URL for display
    const displayUrl = url.length > 50 ? '...' + url.substring(url.length - 50) : url;

    // Format Data
    let dataDisplay = '-';
    if (data) {
        try {
            const jsonStr = JSON.stringify(data, null, 2);
            dataDisplay = `
                <details>
                    <summary>View JSON</summary>
                    <pre>${jsonStr}</pre>
                </details>
            `;
        } catch (e) {
            dataDisplay = String(data);
        }
    }

    row.innerHTML = `
        <td>${apiCallCount}</td>
        <td><strong>${apiName}</strong></td>
        <td><span class="method">${method}</span></td>
        <td class="${status >= 200 && status < 300 ? 'status-success' : 'status-error'}">${status}</td>
        <td title="${url}"><a href="${url}" target="_blank" style="color: inherit; text-decoration: none;">${displayUrl}</a></td>
        <td>${dataDisplay}</td>
    `;

    // Add to top
    logsTableBody.prepend(row);
}

// Helper: Fetch with Logging
async function fetchWithLog(url, options = {}) {
    const method = options.method || 'GET';

    // Determine API Name
    let apiName = 'External API';
    if (url.includes('api.os.uk/search/names')) apiName = 'OS Names API';
    else if (url.includes('api.os.uk/maps')) apiName = 'OS Maps API';
    else if (url.includes('map.sepa.org.uk') || url.includes('api.sepa.org.uk') || url.includes('htkhorizon.com')) apiName = 'SEPA Flood API';

    try {
        const response = await fetch(url, options);

        // Clone response to safely read body for logging
        const clone = response.clone();
        let data = null;
        try {
            const text = await clone.text();
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }
        } catch (e) {
            data = "(Cannot read response body)";
        }

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

// Search Handler (Flood Zones / Map)
async function handleSearch() {
    const osKey = document.getElementById('os-key').value.trim();
    const sepaKey = document.getElementById('sepa-key').value.trim();
    const postcode = document.getElementById('postcode').value.trim();
    const radius = document.getElementById('radius').value;

    if (!osKey) { alert('Please enter an OS API Key.'); return; }
    if (!postcode) { alert('Please enter a postcode.'); return; }

    // Switch to Map Tab automatically
    if (window.switchTab) switchTab('flood-zones');

    searchBtn.textContent = "Searching...";
    searchBtn.disabled = true;

    // Reset Logs
    logsTableBody.innerHTML = '';
    apiCallCount = 0;

    try {
        // 1. Geocode
        const { easting, northing, lat, lng } = await resolveLocation(postcode, osKey);

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
            // Construct SEPA FFIMS URL (Using Local Proxy)
            const sepaUrl = `http://localhost:3000/sepa-proxy/areas/location?x=${easting}&y=${northing}&radius=${radius}&includeTestAreas=true`;

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
                        sepaData.forEach(area => {
                            // Draw Shape if available
                            if (area.shape) {
                                try {
                                    // Handle WKT (Well-Known Text) provided by SEPA API
                                    // e.g., "POLYGON ((30000 60000, ...))"
                                    const geoJsonGeometry = parseWKTToGeoJSON(area.shape);

                                    if (geoJsonGeometry) {
                                        const layer = L.geoJSON(geoJsonGeometry, {
                                            style: {
                                                color: '#ff4d4d',
                                                weight: 2,
                                                fillOpacity: 0.3
                                            }
                                        }).bindPopup(`<strong>${area.name}</strong><br>${area.description || ''}`);
                                        floodLayer.addLayer(layer);
                                    }
                                } catch (e) {
                                    console.warn('Could not parse shape', e);
                                }
                            }
                        });
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


    } catch (error) {
        console.error(error);
        alert('An error occurred. See logs.');
    } finally {
        searchBtn.textContent = "Search Flood Zones";
        searchBtn.disabled = false;
    }
}

// Helper: GetFeatureInfo for WMS
function getFeatureInfo(e, layer) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    const buffer = 0.0001; // Small buffer for point query

    // Construct BBOX for EPSG:4326 (Lat, Lon) for WMS 1.3.0
    const bbox = `${lat - buffer},${lon - buffer},${lat + buffer},${lon + buffer}`;

    // Width/Height and I/J logic simluates a point click on a generic tile
    const params = {
        request: 'GetFeatureInfo',
        service: 'WMS',
        crs: 'EPSG:4326', // Use 'crs' for WMS 1.3.0
        styles: '',
        version: '1.3.0',
        format: 'image/png',
        bbox: bbox,
        height: 101, // Arbitrary small tile size simulation
        width: 101,
        layers: layer.wmsParams.layers,
        query_layers: layer.wmsParams.layers,
        info_format: 'text/html', // SEPA typically returns HTML tables
        i: 50, // Center of the 101x101 tile
        j: 50
    };

    let url = layer._url + L.Util.getParamString(params, layer._url, true);

    // Use Local Proxy for GetFeatureInfo to avoid CORS (Text/HTML request)
    url = url.replace('https://map.sepa.org.uk', 'http://localhost:3000/sepa-wms');

    // Show loading popup
    const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent('<div style="padding:10px;">Checking flood risk... (Searching SEPA Layers)</div>')
        .openOn(map);

    fetchWithLog(url, { method: 'GET' }) // Use our logger!
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.text();
        })
        .then(data => {
            // Check for actual content vs whitespace or exceptions
            if (data && data.trim().length > 0 && !data.includes('ServiceException') && !data.includes('<body></body>')) {
                // Enhance the popup style slightly
                const content = `
                    <div class="sepa-popup" style="max-height: 200px; overflow-y: auto;">
                        <h4 style="margin-top:0;">Flood Risk Data</h4>
                        ${data}
                    </div>
                 `;
                popup.setContent(content);
            } else {
                popup.setContent('<div style="padding:5px;">No specific flood risk data found at this point.</div>');
            }
        })
        .catch(err => {
            console.error('GetFeatureInfo error:', err);
            popup.setContent('Error fetching flood details. See log.');
        });
}

// Helper: Parse WKT (POLYGON/MULTIPOLYGON) to GeoJSON with BNG->WGS84 conversion
function parseWKTToGeoJSON(wkt) {
    wkt = wkt.trim().toUpperCase();

    // Simple parser for POLYGON and MULTIPOLYGON
    const isMulti = wkt.startsWith('MULTIPOLYGON');
    const isPoly = wkt.startsWith('POLYGON');

    if (!isMulti && !isPoly) return null;

    // Remove text header and outer brackets
    // POLYGON ((...)) -> ((...))
    const numberStr = wkt.replace(/^(MULTI)?POLYGON\s*/, '');

    // Basic strategy: Split by loop separators usually `), (` for Multipolygon or `(` for internal rings
    // This is a naive parser but sufficient for clean API data.

    // Helper to parse a list of "x y, x y" coordinates
    const parseRing = (ringStr) => {
        // Remove parens
        const cleaned = ringStr.replace(/[\(\)]/g, '');
        const pairs = cleaned.split(',');
        return pairs.map(pair => {
            const parts = pair.trim().split(/\s+/);
            if (parts.length >= 2) {
                const easting = parseFloat(parts[0]);
                const northing = parseFloat(parts[1]);
                const { lat, lng } = bngToLatLng(easting, northing);
                return [lng, lat]; // GeoJSON is [lon, lat]
            }
            return null;
        }).filter(p => p !== null);
    };

    if (isPoly) {
        // POLYGON ((Ring1), (Ring2), ...)
        const ringsRaw = numberStr.match(/\(([^()]+)\)/g);
        if (!ringsRaw) return null;

        const coordinates = ringsRaw.map(r => parseRing(r));
        return { type: 'Polygon', coordinates: coordinates };
    }

    if (isMulti) {
        // MULTIPOLYGON (((Ring1)), ((Ring2))) - simplified regex approach
        // Splitting by ')), ((' is tricky with regex. 
        // Let's assume standard formatting: ((x y, ...)), ((x y, ...))
        const polysRaw = numberStr.split(/\)\s*,\s*\(/);
        const coordinates = polysRaw.map(polyStr => {
            // Re-wrap or clean
            const ringsRaw = polyStr.match(/\(([^()]+)\)/g);
            if (!ringsRaw) return parseRing(polyStr); // Fallback
            return ringsRaw.map(r => parseRing(r));
        });
        return { type: 'MultiPolygon', coordinates: coordinates };
    }

    return null;
}

// Helper: Simple BNG (OSGB36) to LatLng (WGS84) conversion
// Adapted for JS from standard OSTN15/ETRS89 approximate transforms
// Helper: Accurate BNG (OSGB36) to LatLng (WGS84) conversion
// Implements Helmert Transform for high precision
function bngToLatLng(easting, northing) {
    // OSGB36 Ellipsoid
    const a = 6377563.396;
    const b = 6356256.909;
    const F0 = 0.9996012717;
    const lat0 = 49 * Math.PI / 180;
    const lon0 = -2 * Math.PI / 180;
    const N0 = -100000;
    const E0 = 400000;
    const e2 = 1 - (b * b) / (a * a);
    const n = (a - b) / (a + b);

    // 1. Convert BNG Easting/Northing to OSGB36 Latitude/Longitude (Airy 1830)
    let lat = ((northing - N0) / (a * F0)) + lat0;
    let M = 0;
    do {
        M = (b * F0) * (
            ((1 + n + (5 / 4) * n * n + (5 / 4) * n * n * n) * (lat - lat0)) -
            ((3 * n + 3 * n * n + (21 / 8) * n * n * n) * Math.sin(lat - lat0) * Math.cos(lat + lat0)) +
            (((15 / 8) * n * n + (15 / 8) * n * n * n) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0))) -
            (((35 / 24) * n * n * n) * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0)))
        );
        lat += (northing - N0 - M) / (a * F0);
    } while (Math.abs(northing - N0 - M) >= 0.00001);

    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const nu = (a * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
    const rho = (nu * (1 - e2)) / (1 - e2 * sinLat * sinLat);
    const eta2 = (nu / rho) - 1;

    const tanLat = Math.tan(lat);
    const tan2Lat = tanLat * tanLat;
    const tan4Lat = tan2Lat * tan2Lat;
    const tan6Lat = tan4Lat * tan2Lat;

    const secLat = 1 / cosLat;
    const VII = tanLat / (2 * rho * nu);
    const VIII = (tanLat / (24 * rho * nu * nu * nu)) * (5 + 3 * tan2Lat + eta2 - 9 * tan2Lat * eta2);
    const IX = (tanLat / (720 * rho * nu * nu * nu * nu * nu)) * (61 + 90 * tan2Lat + 45 * tan4Lat);
    const X = secLat / nu;
    const XI = (secLat / (6 * nu * nu * nu)) * ((nu / rho) + 2 * tan2Lat);
    const XII = (secLat / (120 * nu * nu * nu * nu * nu)) * (5 + 28 * tan2Lat + 24 * tan4Lat);
    const XIIA = (secLat / (5040 * nu * nu * nu * nu * nu * nu * nu)) * (61 + 662 * tan2Lat + 1320 * tan4Lat + 720 * tan6Lat);

    const dE = easting - E0;
    const dE2 = dE * dE;
    const dE3 = dE2 * dE;
    const dE4 = dE2 * dE2;
    const dE5 = dE4 * dE;
    const dE6 = dE4 * dE2;
    const dE7 = dE6 * dE;

    let latOSGB = lat - VII * dE2 + VIII * dE4 - IX * dE6;
    let lonOSGB = lon0 + X * dE - XI * dE3 + XII * dE5 - XIIA * dE7;

    // 2. Convert OSGB36 Lat/Lon to Cartesian (x, y, z)
    const H = 0; // Assume 0 height for simple 2D map
    const sinLatO = Math.sin(latOSGB);
    const cosLatO = Math.cos(latOSGB);
    const sinLonO = Math.sin(lonOSGB);
    const cosLonO = Math.cos(lonOSGB);

    const nuO = a / Math.sqrt(1 - e2 * sinLatO * sinLatO);
    const x1 = (nuO + H) * cosLatO * cosLonO;
    const y1 = (nuO + H) * cosLatO * sinLonO;
    const z1 = ((1 - e2) * nuO + H) * sinLatO;

    // 3. Apply Helmert Transform (OSGB36 -> WGS84)
    // Parameters from OSTN15 (or standard 7-param transform)
    const tx = 446.448;
    const ty = -125.157;
    const tz = 542.060;
    const s = -20.4894 * 1e-6; // ppm scaled
    const rx = 0.1502 * Math.PI / (180 * 3600);
    const ry = 0.2470 * Math.PI / (180 * 3600);
    const rz = 0.8421 * Math.PI / (180 * 3600);

    const x2 = tx + (1 + s) * x1 + (-rz) * y1 + (ry) * z1;
    const y2 = ty + (rz) * x1 + (1 + s) * y1 + (-rx) * z1;
    const z2 = tz + (-ry) * x1 + (rx) * y1 + (1 + s) * z1;

    // 4. Convert WGS84 Cartesian to Lat/Lon
    // WGS84 Ellipsoid
    const a_wgs = 6378137.000;
    const b_wgs = 6356752.314245;
    const e2_wgs = 1 - (b_wgs * b_wgs) / (a_wgs * a_wgs);

    const p = Math.sqrt(x2 * x2 + y2 * y2);
    let lat_wgs = Math.atan2(z2, p * (1 - e2_wgs));
    let lat_prev;

    do {
        lat_prev = lat_wgs;
        const sinLatW = Math.sin(lat_wgs);
        const nuW = a_wgs / Math.sqrt(1 - e2_wgs * sinLatW * sinLatW);
        lat_wgs = Math.atan2(z2 + e2_wgs * nuW * sinLatW, p);
    } while (Math.abs(lat_wgs - lat_prev) > 1e-9);

    const lon_wgs = Math.atan2(y2, x2);

    return {
        lat: lat_wgs * 180 / Math.PI,
        lng: lon_wgs * 180 / Math.PI
    };
}

// Tab Switching
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

        const sepaUrl = `http://localhost:3000/sepa-proxy/warnings/location?x=${easting}&y=${northing}&radius=${radius}`;
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
                                <pre style="font-size:0.7em; max-height: 150px; overflow: auto; background:#f8f9fa; padding:5px; border:1px solid #eee;">${JSON.stringify(w, null, 2)}</pre>
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

// Function to attach Tab Listeners
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    initTabs();
    searchBtn.addEventListener('click', handleSearch);
    document.getElementById('warnings-btn').addEventListener('click', handleWarningsSearch);
});
