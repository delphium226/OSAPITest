const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;
// Using the HTK Horizon Host identified from reference project
const SEPA_API_HOST = 'eu2-apigateway.htkhorizon.com';
const SEPA_API_BASE_PATH = '/sepa/ffims/v1';
// WMS Host
const SEPA_WMS_HOST = 'map.sepa.org.uk';

const server = http.createServer((req, res) => {
    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Accept');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    console.log(`[Proxy] Request: ${req.method} ${req.url}`);

    // Route: /sepa-proxy/... -> forwarding to SEPA host
    // We expect the client to request: http://localhost:3000/sepa-proxy/areas/location?...
    if (parsedUrl.pathname.startsWith('/sepa-proxy')) {
        const subPath = parsedUrl.pathname.replace('/sepa-proxy', '');
        const upstreamPath = SEPA_API_BASE_PATH + subPath + (parsedUrl.search || '');

        const options = {
            hostname: SEPA_API_HOST,
            path: upstreamPath,
            method: 'GET',
            headers: {
                // Forward the API Key if provided in request headers, 
                // OR we could try to read it from the request if the client sends it.
                // The client passes 'x-api-key' in the header.
                'x-api-key': req.headers['x-api-key'] || '',
                'Accept': 'application/json'
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            console.log(`[Proxy] Response: ${proxyRes.statusCode}`);
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (e) => {
            console.error(`[Proxy] Error: ${e.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        });

        proxyReq.end();
    } else if (parsedUrl.pathname.startsWith('/sepa-wms')) {
        // Route: /sepa-wms/... -> forwarding to SEPA WMS host
        // Client requests: http://localhost:3000/sepa-wms/server/services/...
        const subPath = parsedUrl.pathname.replace('/sepa-wms', '');
        // Note: WMS usually sends query params for GetFeatureInfo
        const upstreamPath = subPath + (parsedUrl.search || '');

        console.log(`[Proxy] Forwarding to WMS: ${upstreamPath}`);

        const options = {
            hostname: SEPA_WMS_HOST,
            path: upstreamPath,
            method: 'GET',
            headers: {
                'Accept': '*/*', // WMS might return XML, HTML, or JSON
                'User-Agent': 'NodeProxy/1.0' // Good practice
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            console.log(`[Proxy] WMS Response: ${proxyRes.statusCode}`);
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (e) => {
            console.error(`[Proxy] WMS Error: ${e.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        });

        proxyReq.end();
    } else {
        res.writeHead(404);
        res.end('Not Found. Use /sepa-proxy endpoint.');
    }
});

server.listen(PORT, () => {
    console.log(`SEPA Proxy running at http://localhost:${PORT}`);
    console.log(`Use endpoint: http://localhost:${PORT}/sepa-proxy/...`);
});
