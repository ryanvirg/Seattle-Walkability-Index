# Seattle Walkability Index

An interactive map for comparing walkability across Seattle and exploring how personal preferences change the results.

**Web app:** [smileshey.github.io/Seattle-Walkability-Index](https://smileshey.github.io/Seattle-Walkability-Index/)

The browser application is a static React site. It uses MapLibre GL JS, an OpenFreeMap basemap, and GeoJSON files stored in this repository, so viewing the deployed app does not require an ArcGIS Online subscription or an application server.

## How it works

![Seattle Walkability Index animation](UI/images/WalkscoreAnimation.gif)

Seattle is divided into small fishnet cells. The original GIS analysis calculates infrastructure and environmental measures for each cell, including sidewalks, parks, trails, bicycle infrastructure, slope, street speeds, crashes, business density, and crime density.

The positive infrastructure foundation was calculated as:

```text
unadjusted score =
  0.50 × sidewalk area
  + 0.40 × park area
  + 0.05 × trail area
  + 0.05 × bicycle-infrastructure area
```

The web app then applies preference-dependent scalers to that precomputed foundation:

```text
personalized raw score =
  unadjusted score
  × slope scaler
  × effective-speed scaler
  × business-density scaler
  × crime-density scaler
  × crash-density scaler
```

Fishnet scores are rank-normalized to 0–100. They are then summed by neighborhood, adjusted by `neighborhood_area ^ 0.85`, and rank-normalized again. The resulting scores are comparative planning indicators; they are not guarantees about accessibility, personal safety, or current route conditions.

The four controls let a visitor change the importance of:

- Flat ground
- Calm streets, including street speed and crashes
- Business density
- Low crime

Click **Recalculate walkscore** to apply the preferences. Use the map toggle to compare fishnet cells and neighborhoods, and click any map area to inspect its score.

## Run locally

Node.js 20 or newer is required.

```bash
git clone https://github.com/smileshey/Seattle-Walkability-Index.git
cd Seattle-Walkability-Index/UI
nvm install
nvm use
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/`.

To test the production build locally:

```bash
npm run build
npm run preview
```

## GitHub Pages deployment

The workflow at `.github/workflows/deploy-pages.yml` builds and deploys the app whenever `main` is pushed.

For the first deployment, open **Repository settings → Pages**, set **Source** to **GitHub Actions**, and then run the workflow or push a commit to `main`. The deployed URL is:

```text
https://smileshey.github.io/Seattle-Walkability-Index/
```

No DigitalOcean service is needed after the Pages site has been verified.

## Web data

The deployable files are committed under `UI/public/data/`:

- `walkscore_fishnet.geojson` contains the precomputed cell geometry and the fields required by the scoring controls.
- `walkscore_neighborhoods.geojson` contains Seattle neighborhood polygons and base scores.

The app downloads these files from its own GitHub Pages deployment. The only live mapping request is for the open basemap style and tiles served by OpenFreeMap.

To regenerate the deployable GeoJSON:

```bash
cd UI
npm run prepare:data
```

The preparation script converts the repository's `walkscore_fishnet.json` export from Web Mercator to WGS84 and retains only the fields the browser needs. It also refreshes the neighborhood polygons from the project's existing public ArcGIS REST layer. That request occurs only during data preparation; the deployed app does not query ArcGIS Online.

The original spatial preprocessing can be reproduced from `notebooks/PreProcessing.ipynb`, `notebooks/WalkscoreCalculator.ipynb`, and the ArcGIS project files. ArcGIS Pro is needed only to reproduce that upstream analysis, not to run or host the website.

## Technology

- React and TypeScript
- Vite
- MapLibre GL JS
- OpenFreeMap and OpenStreetMap basemap data
- Local GeoJSON scoring layers
- GitHub Actions and GitHub Pages

## Project structure

```text
Seattle-Walkability-Index/
├── .github/workflows/deploy-pages.yml
├── UI/
│   ├── public/data/                  # Static GeoJSON used by the deployed app
│   ├── scripts/prepare_web_data.mjs  # Web-data preparation
│   ├── src/app.tsx                   # Interface and MapLibre map
│   ├── src/scoring.ts                # Personalized scoring and ranking
│   ├── src/scaler_calculations.tsx   # Preference-scaler definitions
│   ├── package.json
│   └── vite.config.ts
├── notebooks/                        # Original GIS preprocessing and scoring
├── Walkability_Seattle.aprx
└── README.md
```

## Data sources

- [Seattle Open Data](https://data.seattle.gov/) for municipal GIS inputs
- [OpenStreetMap](https://www.openstreetmap.org/) for business and public-amenity inputs
- [OpenFreeMap](https://openfreemap.org/) for the web basemap

Review the original datasets' metadata and licenses before redistributing refreshed data.

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International license. See [license.txt](license.txt).
