/**
 * TraceConverter - Convertisseur universel de traces GPS
 * Supporte: GPX, KML, IGC, TCX
 */

const TraceConverter = {
  
  /**
   * Parse une trace brute (string) pour extraire les points GPS
   * Détecte automatiquement le format
   */
  parse: function(fileContent, format) {
    const cleanFormat = format.toLowerCase().trim();
    
    switch(cleanFormat) {
      case 'gpx':
        return this.parseGPX(fileContent);
      case 'kml':
        return this.parseKML(fileContent);
      case 'tcx':
        return this.parseTCX(fileContent);
      default:
        throw new Error(`Format non supporté: ${format}`);
    }
  },

  /**
   * Parse un fichier GPX
   */
  parseGPX: function(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('XML invalide');
    }

    const points = [];
    const trkpts = xmlDoc.querySelectorAll('trkpt');
    
    trkpts.forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      const eleNode = pt.querySelector('ele');
      const timeNode = pt.querySelector('time');
      
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({
          lat,
          lon,
          elevation: eleNode ? parseFloat(eleNode.textContent) : 0,
          timestamp: timeNode ? new Date(timeNode.textContent) : null
        });
      }
    });

    return {
      format: 'GPX',
      points,
      name: xmlDoc.querySelector('trk > name')?.textContent || 'Trace GPS',
      description: xmlDoc.querySelector('trk > desc')?.textContent || ''
    };
  },

  /**
   * Parse un fichier KML
   */
  parseKML: function(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('XML invalide');
    }

    const points = [];
    const placemarks = xmlDoc.querySelectorAll('Placemark');
    
    placemarks.forEach(pm => {
      const lineString = pm.querySelector('LineString');
      if (lineString) {
        const coordsText = lineString.querySelector('coordinates')?.textContent || '';
        const coords = coordsText.trim().split('\n').filter(c => c.trim());
        
        coords.forEach(coord => {
          const [lon, lat, elevation] = coord.trim().split(',').map(parseFloat);
          if (!isNaN(lat) && !isNaN(lon)) {
            points.push({
              lat,
              lon,
              elevation: elevation || 0,
              timestamp: null
            });
          }
        });
      }
    });

    return {
      format: 'KML',
      points,
      name: xmlDoc.querySelector('Placemark > name')?.textContent || 'Trace GPS',
      description: xmlDoc.querySelector('Placemark > description')?.textContent || ''
    };
  },

  /**
   * Parse un fichier IGC (format aviation)
  
  parseIGC: function(fileContent) {
    const lines = fileContent.split('\n');
    const points = [];
    let name = 'Trace IGC';
    let date = null;

    lines.forEach(line => {
      const code = line.substring(0, 1);
      
      // Ligne de fixation (point GPS)
      if (code === 'B') {
        const hour = parseInt(line.substring(1, 3));
        const minute = parseInt(line.substring(3, 5));
        const second = parseInt(line.substring(5, 7));
        const latDeg = parseInt(line.substring(7, 9));
        const latMin = parseFloat(line.substring(9, 14));
        const latHem = line.substring(14, 15);
        const lonDeg = parseInt(line.substring(15, 18));
        const lonMin = parseFloat(line.substring(18, 23));
        const lonHem = line.substring(23, 24);
        const pressureAlt = parseInt(line.substring(25, 30));
        const gpsAlt = parseInt(line.substring(30, 35));

        const lat = latDeg + (latMin / 60);
        const lon = lonDeg + (lonMin / 60);

        points.push({
          lat: latHem === 'S' ? -lat : lat,
          lon: lonHem === 'W' ? -lon : lon,
          elevation: gpsAlt || pressureAlt,
          timestamp: null
        });
      }
      
      // Ligne de date
      if (code === 'H' && line.includes('HFDTE')) {
        const dateStr = line.substring(6, 12);
        const day = parseInt(dateStr.substring(0, 2));
        const month = parseInt(dateStr.substring(2, 4));
        const year = parseInt(dateStr.substring(4, 6)) + 2000;
        date = new Date(year, month - 1, day);
      }

      // Nom du vol
      if (code === 'H' && line.includes('HFPLT')) {
        name = line.substring(8).trim();
      }
    });

    return {
      format: 'IGC',
      points,
      name: name || 'Trace IGC',
      description: `Date: ${date ? date.toLocaleDateString() : 'Inconnue'}`
    };
  },
 */
  /**
   * Parse un fichier TCX (Garmin Training Center)
   */
  parseTCX: function(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('XML invalide');
    }

    const points = [];
    const trackpoints = xmlDoc.querySelectorAll('Trackpoint');
    
    trackpoints.forEach(tp => {
      const posNode = tp.querySelector('Position');
      const altNode = tp.querySelector('AltitudeMeters');
      const timeNode = tp.querySelector('Time');
      
      if (posNode) {
        const lat = parseFloat(posNode.querySelector('LatitudeDegrees')?.textContent);
        const lon = parseFloat(posNode.querySelector('LongitudeDegrees')?.textContent);
        
        if (!isNaN(lat) && !isNaN(lon)) {
          points.push({
            lat,
            lon,
            elevation: altNode ? parseFloat(altNode.textContent) : 0,
            timestamp: timeNode ? new Date(timeNode.textContent) : null
          });
        }
      }
    });

    return {
      format: 'TCX',
      points,
      name: xmlDoc.querySelector('Activity > Id')?.textContent || 'Trace TCX',
      description: ''
    };
  },

  /**
   * Convertit une trace parsée en GPX
   */
  toGPX: function(traceData) {
    const header = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="TraceConverter" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      `  <metadata>\n` +
      `    <name>${this.escapeXml(traceData.name)}</name>\n` +
      `    <desc>${this.escapeXml(traceData.description)}</desc>\n` +
      `    <time>${new Date().toISOString()}</time>\n` +
      `  </metadata>\n`;

    let trkpts = '';
    traceData.points.forEach(pt => {
      trkpts += `    <trkpt lat="${pt.lat}" lon="${pt.lon}">\n`;
      if (pt.elevation !== 0) {
        trkpts += `      <ele>${pt.elevation.toFixed(2)}</ele>\n`;
      }
      if (pt.timestamp) {
        trkpts += `      <time>${pt.timestamp.toISOString()}</time>\n`;
      }
      trkpts += `    </trkpt>\n`;
    });

    const footer = '  </trkseg>\n' +
      '  </trk>\n' +
      '</gpx>';

    return header + 
      '  <trk>\n' +
      '    <trkseg>\n' +
      trkpts +
      footer;
  },

  /**
   * Convertit une trace parsée en KML
   */
  toKML: function(traceData) {
    const coordsStr = traceData.points
      .map(pt => `${pt.lon},${pt.lat}${pt.elevation ? ',' + pt.elevation : ''}`)
      .join('\n      ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${this.escapeXml(traceData.name)}</name>
    <Placemark>
      <name>${this.escapeXml(traceData.name)}</name>
      <description>${this.escapeXml(traceData.description)}</description>
      <LineString>
        <coordinates>
      ${coordsStr}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
  },

  /**
   * Convertit une trace parsée en IGC
   */
  toIGC: function(traceData) {
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}` +
                    `${String(now.getMonth() + 1).padStart(2, '0')}` +
                    `${String(now.getFullYear()).slice(-2)}`;

    let igc = 'AXXX Generated by TraceConverter\n';
    igc += `HFDTE:${dateStr}\n`;
    igc += `HFPLT:${this.escapeIGC(traceData.name)}\n`;
    igc += 'HFGPS:Converted\n';

    traceData.points.forEach((pt, idx) => {
      const latDeg = Math.floor(Math.abs(pt.lat));
      const latMin = (Math.abs(pt.lat) - latDeg) * 60;
      const latHem = pt.lat >= 0 ? 'N' : 'S';

      const lonDeg = Math.floor(Math.abs(pt.lon));
      const lonMin = (Math.abs(pt.lon) - lonDeg) * 60;
      const lonHem = pt.lon >= 0 ? 'E' : 'W';

      const alt = Math.round(pt.elevation);
      const time = `${String((idx * 5) % 86400 / 3600 | 0).padStart(2, '0')}` +
                   `${String(((idx * 5) % 3600) / 60 | 0).padStart(2, '0')}` +
                   `${String((idx * 5) % 60).padStart(2, '0')}`;

      igc += `B${time}` +
             `${String(latDeg).padStart(2, '0')}${latMin.toFixed(3).substring(0, 5).padStart(5, '0')}${latHem}` +
             `${String(lonDeg).padStart(3, '0')}${lonMin.toFixed(3).substring(0, 5).padStart(5, '0')}${lonHem}` +
             `A${String(alt).padStart(5, '0')}${String(alt).padStart(5, '0')}\n`;
    });

    return igc;
  },

  /**
   * Convertit une trace parsée en TCX
   */
  toTCX: function(traceData) {
    let trackpoints = '';
    traceData.points.forEach((pt, idx) => {
      const time = new Date(Date.now() + idx * 1000).toISOString();
      trackpoints += `      <Trackpoint>\n` +
        `        <Time>${time}</Time>\n` +
        `        <Position>\n` +
        `          <LatitudeDegrees>${pt.lat}</LatitudeDegrees>\n` +
        `          <LongitudeDegrees>${pt.lon}</LongitudeDegrees>\n` +
        `        </Position>\n`;
      if (pt.elevation !== 0) {
        trackpoints += `        <AltitudeMeters>${pt.elevation}</AltitudeMeters>\n`;
      }
      trackpoints += `      </Trackpoint>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Other">
      <Id>${new Date().toISOString()}</Id>
      <Lap StartTime="${new Date().toISOString()}">
        <Track>
${trackpoints}        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
  },

  /**
   * Utilitaires
   */
  escapeXml: function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  escapeIGC: function(str) {
    if (!str) return '';
    return String(str).replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 20);
  }
};

// Rendre TraceConverter accessible globalement
window.TraceConverter = TraceConverter;

// Export pour utilisation en module (optionnel)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TraceConverter;
}

console.log("✅ TraceConverter chargé et disponible");
