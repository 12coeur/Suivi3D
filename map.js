// Déclarations globales
let tracking = false;
let watchId = null;
let accuracyCircle = null;
const traceSourceId = "user-trace";
const traceLayerId = "user-trace-layer";
const recordedTraceSourceId = "recorded-trace";
const recordedTraceLayerId = "recorded-trace-layer";
const key = "zv0cJDROvQbyb5SevYhh";

// Variables pour l'enregistrement GPS
let isRecording = false;
let recordedPoints = [];
let lastRecordedPoint = null;
const MIN_DISTANCE = 10; // mètres
const MIN_TIME = 10000; // 10 secondes
const MAX_DISTANCE = 100; // mètres

// Variables Wake Lock
let wakeLock = null;

// Variable pour centrage automatique
let autoCenterEnabled = false;

// 1. Initialisation Carte
const map = new maplibregl.Map({
  container: 'map',
  style: `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`,
  center: [2.5, 46.5], zoom: 5.5, pitch: 45, maxPitch: 85,
});

map.addControl(new maplibregl.NavigationControl());
map.addControl(new maplibregl.FullscreenControl());

// 2. Chargement Terrain & Menu Calques
map.on('load', () => {
  map.addSource('terrain', {
    type: 'raster-dem',
    url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${key}`,
    tileSize: 256
  });
  map.setTerrain({ source: 'terrain', exaggeration: 1.0 });
  generateLayerMenu();
});

// 3. WAKE LOCK - Empêcher la mise en veille
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock activé');
      
      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock libéré');
      });
    } else {
      console.warn('Wake Lock API non supportée');
    }
  } catch (err) {
    console.error(`Erreur Wake Lock: ${err.name}, ${err.message}`);
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release()
      .then(() => {
        wakeLock = null;
        console.log('Wake Lock libéré manuellement');
      });
  }
}

// Réactiver Wake Lock si la page redevient visible
document.addEventListener('visibilitychange', () => {
  if (wakeLock !== null && document.visibilityState === 'visible' && isRecording) {
    requestWakeLock();
  }
});

// 4. Gestion Relief & Eclairage
document.getElementById("zFactor").oninput = (e) => {
  const value = parseFloat(e.target.value);
  map.setTerrain({ source: 'terrain', exaggeration: value });
  document.getElementById("zFactorValue").textContent = value.toFixed(1);
};

function adjustColorBrightness(color, factor) {
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1]) * factor);
    const g = Math.min(255, parseInt(rgbMatch[2]) * factor);
    const b = Math.min(255, parseInt(rgbMatch[3]) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return color;
}

document.getElementById("light").oninput = (e) => {
  const factor = parseFloat(e.target.value);
  const style = map.getStyle();
  style.layers.forEach(layer => {
    if (layer.paint) {
      ["fill-color", "line-color", "text-color", "circle-color"].forEach(prop => {
        if (layer.paint[prop]) try { map.setPaintProperty(layer.id, prop, adjustColorBrightness(layer.paint[prop], factor)); } catch(e){}
      });
    }
  });
};

// 5. SCALING DE L'INTERFACE
document.getElementById("uiScale").oninput = (e) => {
  const scale = parseFloat(e.target.value);
  const percent = Math.round(scale * 100);
  document.getElementById("uiScaleValue").textContent = `${percent}%`;
  
  // Appliquer le scaling
  document.documentElement.style.setProperty('--ui-scale', scale);
  
  // Boutons de contrôle
  const controls = document.querySelectorAll('.map-btn');
  controls.forEach(btn => {
    btn.style.transform = `scale(${scale})`;
  });
  
  // Contrôles MapLibre
  const mapControls = document.querySelectorAll('.maplibregl-ctrl-group, .maplibregl-ctrl');
  mapControls.forEach(ctrl => {
    ctrl.style.transform = `scale(${scale})`;
    ctrl.style.transformOrigin = 'top right';
  });
  
  // Panneaux latéraux
  const panels = document.querySelectorAll('.panel-slide');
  panels.forEach(panel => {
    panel.style.fontSize = `${15 * scale}px`;
  });
};

// 6. Recherche & Styles
document.getElementById("btnSearch").onclick = async () => {
  const q = document.getElementById("search").value;
  const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${key}`);
  const data = await res.json();
  if (data.features?.length) map.flyTo({ center: data.features[0].center, zoom: 14 });
};

document.getElementById("styleSelect").onchange = (e) => {
  map.setStyle(`https://api.maptiler.com/maps/${e.target.value}/style.json?key=${key}`);
  map.once('styledata', () => {
    if (!map.getSource('terrain')) map.addSource('terrain', { type: 'raster-dem', url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${key}`, tileSize: 256 });
    map.setTerrain({ source: 'terrain', exaggeration: parseFloat(document.getElementById("zFactor").value) });
    generateLayerMenu();
  });
};

// 7. Menu Calques Dynamique
function generateLayerMenu() {
  const box = document.getElementById("layersBox");
  box.innerHTML = "";
  map.getStyle().layers.forEach(layer => {
    if (layer.layout) {
      const lb = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true;
      cb.onchange = () => map.setLayoutProperty(layer.id, "visibility", cb.checked ? "visible" : "none");
      lb.append(cb, " " + layer.id); box.appendChild(lb);
    }
  });
}

// 8. Toggle pour afficher/masquer la zone de chargement de trace
document.getElementById("traceToggleBtn").onclick = () => {
  const area = document.getElementById("traceLoadArea");
  if (area.style.display === "none") {
    area.style.display = "block";
    document.getElementById("traceToggleBtn").textContent = "Masquer le chargement";
  } else {
    area.style.display = "none";
    document.getElementById("traceToggleBtn").textContent = "Charger une trace existante";
  }
};

// 9. Trace GPS (GPX & GeoJSON) - Chargement de fichiers
document.getElementById("traceFile").onchange = (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = (evt) => {
    let geojson;
    if (file.name.endsWith('.gpx')) {
      const xml = new DOMParser().parseFromString(evt.target.result, "text/xml");
      const pts = Array.from(xml.getElementsByTagName("trkpt")).map(p => [parseFloat(p.getAttribute("lon")), parseFloat(p.getAttribute("lat"))]);
      geojson = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: pts }}]};
    } else { geojson = JSON.parse(evt.target.result); }
    
    if (map.getLayer(traceLayerId)) map.removeLayer(traceLayerId);
    if (map.getSource(traceSourceId)) map.removeSource(traceSourceId);
    map.addSource(traceSourceId, { type: "geojson", data: geojson });
    map.addLayer({ id: traceLayerId, type: "line", source: traceSourceId, paint: { "line-color": "#ff0000", "line-width": 4 }});
    const bounds = geojson.features[0].geometry.coordinates.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds());
    map.fitBounds(bounds, { padding: 40 });
  };
  reader.readAsText(file);
};

document.getElementById("clearTraceBtn").onclick = () => {
  if (map.getLayer(traceLayerId)) map.removeLayer(traceLayerId);
  if (map.getSource(traceSourceId)) map.removeSource(traceSourceId);
  
  // Effacer aussi le tracé enregistré
  if (map.getLayer(recordedTraceLayerId)) map.removeLayer(recordedTraceLayerId);
  if (map.getSource(recordedTraceSourceId)) map.removeSource(recordedTraceSourceId);
};

// 10. FONCTION DE CALCUL DE DISTANCE (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// 11. FONCTION DE CRÉATION DU FICHIER GPX
function createGPXFile(points) {
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Suivi 3D par 12coeur" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Parcours enregistré</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Mon parcours</name>
    <trkseg>`;

  const gpxPoints = points.map(point => 
    `      <trkpt lat="${point.latitude}" lon="${point.longitude}">
        <ele>${point.altitude || 0}</ele>
        <time>${point.timestamp}</time>
      </trkpt>`
  ).join('\n');

  const gpxFooter = `
    </trkseg>
  </trk>
</gpx>`;

  return gpxHeader + '\n' + gpxPoints + gpxFooter;
}

// 12. FONCTION DE TÉLÉCHARGEMENT DU FICHIER
function downloadGPXFile(gpxContent) {
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  a.download = `parcours_${dateStr}_${timeStr}.gpx`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 13. SAUVEGARDE LOCALE (localStorage) pour récupération en cas d'arrêt impromptu
function savePointsToLocal() {
  try {
    localStorage.setItem('gps_recording_points', JSON.stringify(recordedPoints));
    localStorage.setItem('gps_recording_time', new Date().toISOString());
  } catch(e) {
    console.error('Erreur sauvegarde locale:', e);
  }
}

function loadPointsFromLocal() {
  try {
    const saved = localStorage.getItem('gps_recording_points');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch(e) {
    console.error('Erreur chargement local:', e);
  }
  return null;
}

function clearLocalPoints() {
  localStorage.removeItem('gps_recording_points');
  localStorage.removeItem('gps_recording_time');
}

// Vérifier s'il y a des points sauvegardés au démarrage
window.addEventListener('load', () => {
  const savedPoints = loadPointsFromLocal();
  if (savedPoints && savedPoints.length > 0) {
    if (confirm(`${savedPoints.length} points GPS trouvés d'un enregistrement précédent. Voulez-vous les récupérer ?`)) {
      recordedPoints = savedPoints;
      updateRecordedTrace();
      alert('Points récupérés avec succès !');
    } else {
      clearLocalPoints();
    }
  }
});

// 14. MISE À JOUR DU TRACÉ SUR LA CARTE
function updateRecordedTrace() {
  if (recordedPoints.length < 2) return;

  const coordinates = recordedPoints.map(p => [p.longitude, p.latitude]);
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coordinates
      }
    }]
  };

  if (map.getSource(recordedTraceSourceId)) {
    map.getSource(recordedTraceSourceId).setData(geojson);
  } else {
    map.addSource(recordedTraceSourceId, {
      type: "geojson",
      data: geojson
    });
    map.addLayer({
      id: recordedTraceLayerId,
      type: "line",
      source: recordedTraceSourceId,
      paint: {
        "line-color": "#00ff00",
        "line-width": 4
      }
    });
  }
}

// 15. ENREGISTREMENT GPS AVEC TRACÉ
document.getElementById("trackBtn").onclick = () => {
  if (!isRecording) {
    // DÉMARRER L'ENREGISTREMENT
    isRecording = true;
    recordedPoints = [];
    lastRecordedPoint = null;
    document.getElementById("trackBtn").innerText = "Arrêter l'enregistrement";
    document.getElementById("trackBtn").style.background = "#dc3545";
    document.getElementById("trackBtn").classList.add("recording-blink");
    
    // Animation bouton Parcours
    document.getElementById("parcoursBtn").classList.add("parcours-recording");
    
    // Activer Wake Lock
    requestWakeLock();

    watchId = navigator.geolocation.watchPosition(pos => {
      const { longitude, latitude, altitude } = pos.coords;
      const timestamp = new Date().toISOString();
      const currentTime = Date.now();

      // Afficher le cercle pulsé en temps réel
      if (!accuracyCircle) {
        const el = document.createElement("div");
        el.className = "pulse-circle";
        accuracyCircle = new maplibregl.Marker({ 
            element: el,
            pitchAlignment: 'viewport',
            offset: [0, -5] // décalage vertical
        })
        .setLngLat([longitude, latitude])
        .addTo(map);
      } else {
        accuracyCircle.setLngLat([longitude, latitude]);
      }

      // Logique d'enregistrement des points
      let shouldRecord = false;
      if (!lastRecordedPoint) {
        shouldRecord = true;
      } else {
        const distance = calculateDistance(
          lastRecordedPoint.latitude,
          lastRecordedPoint.longitude,
          latitude,
          longitude
        );
        const timeDiff = currentTime - lastRecordedPoint.time;
        if (distance >= MIN_DISTANCE || timeDiff >= MIN_TIME || distance >= MAX_DISTANCE) {
          shouldRecord = true;
        }
      }

      if (shouldRecord) {
        recordedPoints.push({
          latitude,
          longitude,
          altitude,
          timestamp
        });
        lastRecordedPoint = {
          latitude,
          longitude,
          time: currentTime
        };
        updateRecordedTrace();
        savePointsToLocal();
      }
    }, (err) => {
      alert("Erreur GPS : " + err.message);
      isRecording = false;
      document.getElementById("trackBtn").innerText = "Enregistrer mon déplacement";
      document.getElementById("trackBtn").style.background = "#0066cc";
      document.getElementById("trackBtn").classList.remove("recording-blink");
      document.getElementById("parcoursBtn").classList.remove("parcours-recording");
      releaseWakeLock();
    }, { 
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

  } else {
    // ARRÊTER L'ENREGISTREMENT
    isRecording = false;
    document.getElementById("trackBtn").innerText = "Enregistrer mon déplacement";
    document.getElementById("trackBtn").style.background = "#0066cc";
    document.getElementById("trackBtn").classList.remove("recording-blink");
    document.getElementById("parcoursBtn").classList.remove("parcours-recording");
    navigator.geolocation.clearWatch(watchId);
    
    // Libérer Wake Lock
    releaseWakeLock();
    
    if (accuracyCircle) {
      accuracyCircle.remove();
      accuracyCircle = null;
    }

    const autoSave = document.getElementById("autoSaveCheck").checked;
    if (recordedPoints.length > 0) {
      if (autoSave) {
        const gpxContent = createGPXFile(recordedPoints);
        downloadGPXFile(gpxContent);
        alert(`Enregistrement terminé ! ${recordedPoints.length} points enregistrés.\nLe fichier GPX a été téléchargé.`);
        clearLocalPoints();
      } else {
        const save = confirm(`Enregistrement terminé ! ${recordedPoints.length} points enregistrés.\nVoulez-vous télécharger le fichier GPX ?`);
        if (save) {
          const gpxContent = createGPXFile(recordedPoints);
          downloadGPXFile(gpxContent);
          clearLocalPoints();
        }
      }
    } else {
      alert("Aucun point enregistré.");
    }
  }
};

// 16. BOUTONS CENTRAGE (Me centrer) - MODIFIÉ pour créer le cercle si absent
function centerOnUser() {
  if (accuracyCircle) {
    const lngLat = accuracyCircle.getLngLat();
    map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: 16, pitch: 45 });
  } else {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        // Créer le cercle s'il n'existe pas encore
        if (!accuracyCircle) {
          const el = document.createElement("div");
          el.className = "pulse-circle";
          accuracyCircle = new maplibregl.Marker({
            element: el,
            pitchAlignment: 'viewport',
            offset: [0, -5] // décalage vertical
          })
          .setLngLat([longitude, latitude])
          .addTo(map);
        } else {
          accuracyCircle.setLngLat([longitude, latitude]);
        }
        map.flyTo({ center: [longitude, latitude], zoom: 16, pitch: 45 });
      },
      (err) => {
        alert("Impossible d'obtenir votre position. Vérifiez les permissions GPS.");
        console.error("Erreur géolocalisation:", err);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  }
}

document.getElementById("centerBtn").onclick = centerOnUser;
document.getElementById("centerBtn2").onclick = centerOnUser;

// 17. Stations & Panoramique
document.getElementById("skiSelect").onchange = (e) => {
  if (e.target.value) map.flyTo({ center: e.target.value.split(",").map(Number), zoom: 13, pitch: 60 });
};

// ---- MODIFICATION : Panoramique (PanoBtn) limité à 360° ----
document.getElementById("PanoBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  map.stop();

  const durationPerStep = 2500;
  const steps = 4;               // 4 * 90° = 360°
  let currentStep = 0;

  const pitchValue = parseFloat(document.getElementById("rasantPitch").value);

  function rotateStep() {
    if (currentStep >= steps) return;
    const targetBearing = map.getBearing() + 90;
    map.easeTo({
      bearing: targetBearing,
      duration: durationPerStep,
      easing: (t) => t,
      pitch: pitchValue,
      essential: true
    });
    currentStep++;
    map.once('moveend', rotateStep);
  }
  rotateStep();
});

// ---- Application du pitch en temps réel ----
const rasantPitchSlider = document.getElementById("rasantPitch");
const rasantPitchValue = document.getElementById("rasantPitchValue");

if (rasantPitchSlider) {
  rasantPitchSlider.oninput = (e) => {
    rasantPitchValue.textContent = e.target.value;
  };
  rasantPitchSlider.addEventListener("input", (e) => {
    const pitch = parseFloat(e.target.value);
    map.easeTo({ pitch: pitch, duration: 0 });
  });
}

// ---- Raponamique (rotation 360° à pitch rasant) ----
const rapanoBtn = document.getElementById('rapanoBtn');
if (rapanoBtn) {
  rapanoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    map.stop();

    const originalCenter = map.getCenter();
    const originalZoom   = map.getZoom();
    const originalPitch  = map.getPitch();
    const originalBearing = map.getBearing();

    let targetCenter = originalCenter;
    if (accuracyCircle) {
      const lngLat = accuracyCircle.getLngLat();
      targetCenter = [lngLat.lng, lngLat.lat];
    }

    const closeZoom = 21.5;
    const rasantPitch = parseFloat(rasantPitchSlider ? rasantPitchSlider.value : 82);

    map.flyTo({
      center: targetCenter,
      zoom: closeZoom,
      pitch: rasantPitch,
      bearing: originalBearing,
      duration: 1800,
      essential: true
    });

    map.once('moveend', () => {
      const rotationDuration = 14000;
      const animationStart = performance.now();

      function animateRotation(timestamp) {
        const elapsed = timestamp - animationStart;
        const progress = Math.min(elapsed / rotationDuration, 1);

        if (progress >= 1) {
          map.flyTo({
            center: originalCenter,
            zoom: originalZoom,
            pitch: originalPitch,
            bearing: originalBearing,
            duration: 2200,
            essential: true
          });
          return;
        }

        const newBearing = originalBearing + 360 * progress;
        map.jumpTo({
          bearing: newBearing,
          pitch: rasantPitch,
          center: targetCenter,
          zoom: closeZoom
        });
        requestAnimationFrame(animateRotation);
      }
      requestAnimationFrame(animateRotation);
    });
  });
}

// 18. Gestion des menus
const toggle = (id) => {
  ["ui", "layersPanel", "parcoursPanel", "cameraPanel"].forEach(m => {
    document.getElementById(m).classList.toggle("closed", m !== id || !document.getElementById(m).classList.contains("closed"));
  });
};
document.getElementById("hamburger").onclick = () => toggle("ui");
document.getElementById("layersMenuBtn").onclick = () => toggle("layersPanel");
document.getElementById("parcoursBtn").onclick = () => toggle("parcoursPanel");
document.getElementById("cameraBtn").onclick = () => toggle("cameraPanel");
map.on('click', () => toggle(null));

// 19. Logo & Scrolltext
const logo = document.getElementById('logoBtn');
const txt = document.getElementById('scrollText');

logo.addEventListener("mouseenter", () => {
  txt.classList.add("visible");
});
logo.addEventListener("mouseleave", () => {
  txt.classList.remove("visible");
});
 
// 20. Animation Pitch
document.addEventListener('DOMContentLoaded', () => {
  const pitchBtn = document.getElementById('pitchBtn');
  if (!pitchBtn) return;

  let isPitchAnimating = false;
  let animationFrameId = null;
  let startTime = null;
  const minPitch = 10;
  const maxPitch = 60;
  const stepDuration = 4000;
  const numSteps = 3;
  const amplitudeFactors = [1.0, 0.60, 0.20];

  function animatePitchDamped(timestamp) {
    if (!isPitchAnimating) return;
    if (startTime === null) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const totalDuration = stepDuration * numSteps;

    if (elapsed >= totalDuration) {
      isPitchAnimating = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      startTime = null;
      if (map) {
        map.easeTo({ pitch: 0, duration: 1800, essential: true });
      }
      return;
    }

    const stepIndex = Math.floor(elapsed / stepDuration);
    const progressInStep = (elapsed % stepDuration) / stepDuration;
    const amplitude = amplitudeFactors[stepIndex];
    const eased = Math.sin(progressInStep * Math.PI);
    const delta = (maxPitch - minPitch) * amplitude * eased;
    const targetPitch = minPitch + delta;

    if (map && typeof map.jumpTo === 'function') {
      map.jumpTo({ pitch: targetPitch });
    }
    animationFrameId = requestAnimationFrame(animatePitchDamped);
  }

  function togglePitchAnimation() {
    if (isPitchAnimating) {
      isPitchAnimating = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      startTime = null;
      if (map) {
        map.easeTo({ pitch: 0, duration: 1200, essential: true });
      }
    } else {
      if (map) map.stop();
      isPitchAnimating = true;
      startTime = null;
      animationFrameId = requestAnimationFrame(animatePitchDamped);
    }
  }

  pitchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    togglePitchAnimation();
  });
});
