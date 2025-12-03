import './style.css'
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { layers, sprite, glyphs } from './mapStyle.js';

const hoursMinutesSince = (passedTimeInMS) => {
  const minutes = Math.floor((passedTimeInMS) / 1000 / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let finalString = '';

  if (minutes < 1 && hours < 1) return 'Just Now';
  if (days > 0) finalString += `${days} days `;
  if (hours % 24 > 0 || days > 0) finalString += `${hours % 24} hours `;
  if (minutes % 60 > 0 || days > 0) finalString += `${minutes % 60} minutes`;
  finalString += ' ago';

  return finalString.trim();
};

let routesMeta = {};

const map = new maplibregl.Map({
  container: 'map',
  style: {
    zoom: 0,
    pitch: 0,
    center: [-87.6279871036212, 41.884579601743276],
    glyphs: glyphs,
    sprite: sprite,
    layers: layers,
    bearing: 0,
    sources: {
      protomaps: {
        type: "vector",
        tiles: [
          "https://v4mapa.transitstat.us/20251018/{z}/{x}/{y}.mvt",
          "https://v4mapb.transitstat.us/20251018/{z}/{x}/{y}.mvt",
          "https://v4mapc.transitstat.us/20251018/{z}/{x}/{y}.mvt",
          "https://v4mapd.transitstat.us/20251018/{z}/{x}/{y}.mvt"
        ],
        maxzoom: 15,
        attribution:
          "Map Data &copy; OpenStreetMap Contributors | &copy; Transitstatus | &copy; Protomaps | Plow Data &copy; City of Chicago",
      },
      plow_routes: {
        type: 'geojson',
        data: 'https://store.transitstat.us/chicago_snowplow_routes/shape'
      },
      plows: {
        type: 'geojson',
        data: 'https://store.transitstat.us/chicago_snowplows/shape'
      }
    },
    version: 8,
    metadata: {},
  },
  center: [-87.6279871036212, 41.87433196355158],
  zoom: 12.67,
  maxZoom: 20,
});

map.on('load', async () => {
  // loading additional metadata for snow routes
  const fetchedRoutesData = await fetch('https://store.transitstat.us/chicago_snowplow_routes/meta').then((res) => res.json());
  routesMeta = fetchedRoutesData;

  // icon
  const image = await map.loadImage('/images/plow_default.png');
  map.addImage('plowIconDefault', image.data);

  // mouse events
  map.on("mouseenter", "plows", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "plows", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("mouseenter", "plow_routes", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "plow_routes", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("moveend", () => {
    console.log(
      `Map moved to ${map.getCenter()} with zoom ${map.getZoom()}`
    );
  });

  // controls
  map.addControl(
    new maplibregl.NavigationControl({
      visualizePitch: true,
    }),
    "top-right"
  );
  map.addControl(new maplibregl.FullscreenControl());
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    })
  );

  // handling clicks
  map.on('click', (e) => {
    let f = map.queryRenderedFeatures(e.point, {
      layers: ["plows", "plow_routes"], // order matters! we prefer plows over plow routes
    });

    console.log(e)

    if (f.length == 0) return; // nothing to show

    const feature = f[0];

    console.log(f[0].geometry.type, f[0].geometry.coordinates)

    // getting point or wherever user clicked on line
    const coordinates = feature.geometry.type == 'Point' ?
      feature.geometry.coordinates.slice() :
      e.lngLat;

    const vinData = feature.properties.vinData ? JSON.parse(feature.properties.vinData) : null;

    const description = feature.geometry.type == 'Point' ? `
      <h1>Snow Plow ${feature.properties.vehicleName}</h1>
      ${feature.properties.vehicleNickName ?? ''}
      <h2>Position Info</h2>
      <ul>
        <li>Updated: ${new Date(feature.properties.dateTime).toLocaleString()}</li>
        <li>Device: ${feature.properties.deviceType} (${feature.properties.device_id})</li>
        <li>Speed: ${feature.properties.speed}mph</li>
      </ul>
      <h2>Vehicle Info</h2>
      <ul>
        <li><b>${vinData.modelYear} ${vinData.make} ${vinData.model}</b></li>
        <li>${vinData.engineManufacturer ? vinData.engineManufacturer + ' ' : ''}${vinData.engineModel}</li>
        <li>${vinData.engineConfiguration} ${vinData.engineCylinders}  ${vinData.fuelTypePrimary}${vinData.engineHP ? ` (${vinData.engineHP}${vinData.engineHP_to ? 'hp - ' + vinData.engineHP_to : ''}hp)` : ''}</li>
        ${vinData.plantCity || vinData.plantState ?
        `<li>Built: ${[vinData.plantCity, vinData.plantState, vinData.plantCountry].filter(n => n).join(', ')}</li>` :
        ''}
      </ul>
      ` : `
      <h2>${routesMeta.filterValues.streets[feature.properties.roadname]}</h2>
      <ul>
        <li>Plowed at ${feature.properties.lastserviced ? new Date(feature.properties.lastserviced).toLocaleString() : 'Not Logged'}</li>
        <ul><li>${feature.properties.lastserviced ? hoursMinutesSince(feature.properties.timeSinceLastUpdate) : '8+ hours ago'}</li></ul>
        <li>Priority: ${routesMeta.filterValues.priorities[feature.properties.routepriority]}</li>
      </ul>
      `

    new maplibregl.Popup({
      offset: 16
    })
      .setLngLat(coordinates)
      .setHTML(description)
      .addTo(map);
  });

  // update frequency
  setInterval(async () => {
    map.getSource('plow_routes').setData('https://store.transitstat.us/chicago_snowplow_routes/shape?t=' + Date.now());
    map.getSource('plows').setData('https://store.transitstat.us/chicago_snowplows/shape?t=' + Date.now());
    const fetchedRoutesData = await fetch('https://store.transitstat.us/chicago_snowplow_routes/meta?t=' + Date.now()).then((res) => res.json());
    routesMeta = fetchedRoutesData;
    console.log('Updated data')
  }, 10000);
});