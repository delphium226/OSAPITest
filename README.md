# Scotland Flood Zone Test Harness

An interactive test harness for exploring Ordnance Survey (OS) Names/Maps APIs and SEPA Flood Warnings/Maps APIs. This tool allows users to search for locations in Scotland, visualize flood risk zones on a map, and check for real-time flood warnings.

## Features

*   **Location Search**: Search for any UK postcode using the **OS Names API** to pinpoint locations.
*   **Interactive Mapping**: 
    *   Base layer provided by **OS Maps API** (requires key).
    *   Flood risk overlay provided by **SEPA Flood Maps WMS** (ArcGIS).
    *   Click on the map to query flood risk details (GetFeatureInfo).
*   **Active Flood Warnings**: Check for live flood warnings in a specified radius around a location using the **SEPA FFIMS API**.
*   **Areas in Radius**: View a detailed list of all flood areas within the search radius, including full raw data for each area.
*   **API Inspection**: A built-in "API Calls Log" panel displays every network request made by the application, including status codes and response payloads, making it excellent for debugging and understanding the underlying APIs.

## Prerequisites

*   **Node.js**: Required to run the local proxy server (no external dependencies required, uses standard libraries).
*   **API Keys**:
    *   **OS Data Hub API Key**: Required for geocoding and base maps. ([Get one here](https://osdatahub.os.uk/))
    *   **SEPA API Key** (Optional): Required for some SEPA data endpoints.

## Installation & Setup

1.  **Clone/Download** this repository.
2.  **Start the Proxy Server**:
    *   The application uses a local Node.js proxy to handle CORS and forwarding requests to SEPA APIs.
    *   Double-click `start_proxy.bat` (Windows) OR run `node proxy.js` in your terminal.
    *   The proxy will start on `http://localhost:3000`.

## Usage

1.  **Open the Application**:
    *   Open `index.html` in your preferred web browser.
2.  **Configure Keys**:
    *   Enter your **OS API Key** in the sidebar input.
    *   (Optional) Enter your **SEPA API Key**.
3.  **Search**:
    *   Enter a **Postcode** (e.g., `EH1 1YZ` for Edinburgh).
    *   Adjust the **Radius** if needed.
    *   Click **Search Flood Zones**.
4.  **View Results**:
    *   The map ("Flood zones in radius" tab) will fly to the location and display flood risk layers.
    *   Use the **Areas in radius** tab to see a text list of all flood areas found.
    *   Use the **Active Warnings** tab (or button) to check for current flood alerts in that area.

## Project Structure

*   `index.html`: Main user interface.
*   `app.js`: Frontend logic for map interaction, API calls, and logging.
*   `proxy.js`: Simple Node.js proxy server to forward requests to SEPA endpoints (`eu2-apigateway.htkhorizon.com` and `map.sepa.org.uk`) to bypass CORS restrictions during development.
*   `style.css`: Application styling.
