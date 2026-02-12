const key = "zv0cJDROvQbyb5SevYhh";

let userMarker = null;
let accuracyCircle = null;

// ---------------------------
// 1. Initialisation
// ---------------------------
const map = new maplibregl.Map({
  container: 'map',
style: `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`,
  center: [2.5, 46.5],
  zoom: 5.5,
  pitch: 45
});

map.addControl(new maplibregl.NavigationControl());
map.addControl(new maplibregl.FullscreenControl());
map.addControl(new maplibregl.ScaleControl());

// ---------------------------
// 2. Terrain 3D
// ---------------------------
map.on('load', () => {
  map.addSource('terrain', {
    type: 'raster-dem',
    url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${key}`,
    tileSize: 256
  });

  map.setTerrain({ source: 'terrain', exaggeration: 1.0 });
});

document.getElementById("zFactor").oninput = (e) => {
  map.setTerrain({ source: 'terrain', exaggeration: parseFloat(e.target.value) });
};

// ---------------------------
// 3. ÉCLAIRAGE GLOBAL (Solution B)
// ---------------------------

function adjustColorBrightness(color, factor) {
  if (!color || !color.startsWith("rgb")) return color;

  const nums = color.match(/\d+/g).map(Number);
  const r = Math.min(255, nums[0] * factor);
  const g = Math.min(255, nums[1] * factor);
  const b = Math.min(255, nums[2] * factor);

  return `rgb(${r}, ${g}, ${b})`;
}

function applyLighting(factor) {
  const style = map.getStyle();

  style.layers.forEach(layer => {
    const paint = layer.paint;
    if (!paint) return;

    const props = [
      "fill-color",
      "line-color",
      "text-color",
      "background-color",
      "circle-color",
      "icon-color"
    ];

    props.forEach(prop => {
      if (paint[prop]) {
        try {
          const newColor = adjustColorBrightness(paint[prop], factor);
          map.setPaintProperty(layer.id, prop, newColor);
        } catch(e) {}
      }
    });
  });
}

document.getElementById("light").oninput = (e) => {
  applyLighting(parseFloat(e.target.value));
};

// ---------------------------
// 4. Recherche
// ---------------------------
async function searchAddress(query) {
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.features?.length) {
    const [lon, lat] = data.features[0].center;
    map.flyTo({ center: [lon, lat], zoom: 14 });
  }
}

document.getElementById("btnSearch").onclick = () => {
  const q = document.getElementById("search").value.trim();
  if (q) searchAddress(q);
};

// ---------------------------
// 5. Changer de style (Jour/Nuit)
// ---------------------------
document.getElementById("styleSelect").onchange = (e) => {
  const style = e.target.value;
  map.setStyle(`https://api.maptiler.com/maps/${style}/style.json?key=${key}`);

  map.once('styledata', () => {
    if (!map.getSource('terrain')) {
      map.addSource('terrain', {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${key}`,
        tileSize: 256
      });
    }

    map.setTerrain({
      source: 'terrain',
      exaggeration: parseFloat(document.getElementById("zFactor").value)
    });

    applyLighting(parseFloat(document.getElementById("light").value));
  });
};

// ---------------------------
// 6. Layers
// ---------------------------
document.querySelectorAll('#layersBox input').forEach(cb => {
  cb.addEventListener('change', (e) => {
    const id = e.target.dataset.layer;
    const visibility = e.target.checked ? 'visible' : 'none';

    map.getStyle().layers.forEach(l => {
      if (l.id.includes(id)) {
        try { map.setLayoutProperty(l.id, 'visibility', visibility); } catch(e) {}
      }
    });
  });
});

// ---------------------------
// 7. Suivi GPS + pointeur au-dessus du relief
// ---------------------------
let tracking = false;
let watchId = null;

document.getElementById("trackBtn").onclick = () => {
  if (!tracking) {
    tracking = true;
    document.getElementById("trackBtn").innerText = "Arrêter le suivi";

    watchId = navigator.geolocation.watchPosition(pos => {
      const { longitude, latitude } = pos.coords;

      // Marker flottant au-dessus du relief
      if (!userMarker) {
        userMarker = new maplibregl.Marker({
          color: "#007bff",
          scale: 1.5,
          pitchAlignment: "map",
          rotationAlignment: "map"
        })
        .setLngLat([longitude, latitude])
        .addTo(map);
      } else {
        userMarker.setLngLat([longitude, latitude]);
      }

      // Cercle pulsé
      if (!accuracyCircle) {
        const el = document.createElement("div");
        el.className = "pulse-circle";
        accuracyCircle = new maplibregl.Marker({ element: el })
          .setLngLat([longitude, latitude])
          .addTo(map);
      } else {
        accuracyCircle.setLngLat([longitude, latitude]);
      }

      map.flyTo({ center: [longitude, latitude], zoom: 14 });
    });

  } else {
    tracking = false;
    document.getElementById("trackBtn").innerText = "Activer le suivi";
    navigator.geolocation.clearWatch(watchId);

    if (userMarker) userMarker.remove();
    if (accuracyCircle) accuracyCircle.remove();

    userMarker = null;
    accuracyCircle = null;
  }
};

// ---------------------------
// 8. Menu hamburger
// ---------------------------
document.getElementById("hamburger").onclick = () => {
  document.getElementById("ui").classList.toggle("closed");
};

// ---------------------------
// 9. Stations de ski
// ---------------------------
document.getElementById("skiSelect").onchange = (e) => {
  if (!e.target.value) return;

  const [lon, lat] = e.target.value.split(",").map(Number);
  map.flyTo({ center: [lon, lat], zoom: 13, pitch: 60, bearing: -20 });
};
