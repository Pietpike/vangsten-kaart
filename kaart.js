// Supabase configuratie
const SUPABASE_URL = 'https://hezjtqaowjpyvkadeisp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlemp0cWFvd2pweXZrYWRlaXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MTQ3NTMsImV4cCI6MjA2ODk5MDc1M30.hq0IwhnnrJIXfTMGNE6PJkB0qhx2t7h3h0UOpZGi7wo';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Check authentication
async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

checkAuth();

// Leaflet kaart initialiseren
const map = L.map('map').setView([52.3676, 4.9041], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Marker clustering
const markerClusterGroup = L.markerClusterGroup();

// Arrays voor markers
let allMarkers = [];

// Activity type filters
let activeActivityTypes = new Set(['catch', 'sighting']);

// Fish iconen voor catches (solid/opaque)
const fishIcons = {
    snoek: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    }),
    snoekbaars: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    }),
    baars: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    }),
    overig: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    })
};

// Sighting iconen (transparanter dan catches)
const sightingIcons = {
    snoek: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
        className: 'sighting-marker'
    }),
    snoekbaars: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
        className: 'sighting-marker'
    }),
    baars: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
        className: 'sighting-marker'
    }),
    overig: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
        className: 'sighting-marker'
    })
};

// Vangsten en sightings laden
async function loadCatches() {
    try {
        console.log('Vangsten en sightings ophalen van Supabase...');
        
        // Laad catches en sightings parallel
        const [catchesResult, sightingsResult] = await Promise.all([
            supabase.from('catches').select('*, aastabel:aas_id(naam)'),
            supabase.from('sightings').select('*')
        ]);
        
        if (catchesResult.error) {
            console.error('Fout bij ophalen catches:', catchesResult.error);
            alert('Kon vangsten niet laden.');
            return;
        }
        
        if (sightingsResult.error) {
            console.error('Fout bij ophalen sightings:', sightingsResult.error);
        }
        
        const catches = catchesResult.data || [];
        const sightings = sightingsResult.data || [];
        
        console.log(`Aantal vangsten geladen: ${catches.length}`);
        console.log(`Aantal sightings geladen: ${sightings.length}`);
        
        // Catches verwerken
        catches.forEach(vangst => {
            if (!vangst.gps_lat || !vangst.gps_long) {
                return;
            }
            
            const vissoort = vangst.soort ? vangst.soort.toLowerCase() : 'overig';
            const icon = fishIcons[vissoort] || fishIcons.overig;
            
            const marker = L.marker([vangst.gps_lat, vangst.gps_long], {
                icon: icon,
                opacity: 1.0
            });
            
            const aasNaam = vangst.aastabel?.naam || 'Onbekend';
            
            let datumTekst = 'Onbekend';
            if (vangst.catch_datetime) {
                try {
                    const datum = new Date(vangst.catch_datetime);
                    datumTekst = datum.toLocaleDateString('nl-NL', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch (e) {
                    datumTekst = vangst.catch_datetime;
                }
            }
            
            const popupContent = `
                <div style="min-width: 200px;">
                    <h3 style="margin: 0 0 10px 0; color: #2c3e50;">
                        ${vangst.soort || 'Onbekend'}
                    </h3>
                    <p style="margin: 5px 0;"><strong>📅 Datum:</strong> ${datumTekst}</p>
                    <p style="margin: 5px 0;"><strong>🎣 Aas:</strong> ${aasNaam}</p>
                    <p style="margin: 5px 0;"><strong>📏 Lengte:</strong> ${vangst.lengte ? vangst.lengte + ' cm' : 'Onbekend'}</p>
                    <p style="margin: 5px 0;"><strong>🔢 Aantal:</strong> ${vangst.aantal || '1'}</p>
                    ${vangst.techniek ? `<p style="margin: 5px 0;"><strong>⚙️ Techniek:</strong> ${vangst.techniek}</p>` : ''}
                </div>
            `;
            
            marker.bindPopup(popupContent);
            marker.fishType = vissoort;
            marker.activityType = 'catch';
            marker.catchData = vangst;
            
            allMarkers.push(marker);
        });
        
        // Sightings verwerken
        sightings.forEach(sighting => {
            if (!sighting.gps_lat || !sighting.gps_long) {
                return;
            }
            
            const vissoort = sighting.soort ? sighting.soort.toLowerCase() : 'overig';
            const icon = sightingIcons[vissoort] || sightingIcons.overig;
            
            // Opacity op basis van zekerheid
            let opacity = 0.7;
            if (sighting.zekerheid === 'waarschijnlijk') opacity = 0.55;
            if (sighting.zekerheid === 'mogelijk') opacity = 0.4;
            
            const marker = L.marker([sighting.gps_lat, sighting.gps_long], {
                icon: icon,
                opacity: opacity
            });
            
            let datumTekst = 'Onbekend';
            if (sighting.sighting_datetime) {
                try {
                    const datum = new Date(sighting.sighting_datetime);
                    datumTekst = datum.toLocaleDateString('nl-NL', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch (e) {
                    datumTekst = sighting.sighting_datetime;
                }
            }
            
            const typeLabels = {
                'live': 'Live gezien',
                'camera': 'Op foto',
                'video': 'Op video',
                'drone': 'Drone opname'
            };
            
            const zekerheidLabels = {
                'zeker': 'Zeker',
                'waarschijnlijk': 'Waarschijnlijk',
                'mogelijk': 'Mogelijk'
            };
            
            const popupContent = `
                <div style="min-width: 200px;">
                    <h3 style="margin: 0 0 10px 0; color: #FF9800;">
                        ${sighting.soort || 'Onbekend'} 👁
                    </h3>
                    <p style="margin: 5px 0; color: #FF9800; font-weight: bold;">Waarneming</p>
                    <p style="margin: 5px 0;"><strong>📅 Datum:</strong> ${datumTekst}</p>
                    <p style="margin: 5px 0;"><strong>👀 Type:</strong> ${typeLabels[sighting.waarneming_type] || sighting.waarneming_type}</p>
                    <p style="margin: 5px 0;"><strong>✓ Zekerheid:</strong> ${zekerheidLabels[sighting.zekerheid] || sighting.zekerheid}</p>
                    ${sighting.geschatte_grootte ? `<p style="margin: 5px 0;"><strong>📏 Grootte:</strong> ${sighting.geschatte_grootte}</p>` : ''}
                    ${sighting.notities ? `<p style="margin: 5px 0;"><strong>📝 Notities:</strong> ${sighting.notities}</p>` : ''}
                    ${sighting.media_url ? `<p style="margin: 5px 0;"><a href="${sighting.media_url}" target="_blank">📸 Bekijk media</a></p>` : ''}
                </div>
            `;
            
            marker.bindPopup(popupContent);
            marker.fishType = vissoort;
            marker.activityType = 'sighting';
            marker.sightingData = sighting;
            
            allMarkers.push(marker);
        });
        
        // Voeg alle markers toe aan cluster groep
        markerClusterGroup.addLayers(allMarkers);
        map.addLayer(markerClusterGroup);
        
        // Zoom naar alle markers
        if (allMarkers.length > 0) {
            const group = L.featureGroup(allMarkers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
        
        console.log(`Kaart geladen met ${catches.length} vangsten en ${sightings.length} sightings`);
        
    } catch (error) {
        console.error('Onverwachte fout:', error);
        alert('Er ging iets mis. Check de console voor details.');
    }
}

// Filter functie
function filterFish(type) {
    markerClusterGroup.clearLayers();
    
    let filteredMarkers;
    if (type === 'all') {
        filteredMarkers = allMarkers.filter(m => activeActivityTypes.has(m.activityType));
    } else {
        filteredMarkers = allMarkers.filter(m => 
            m.fishType === type && activeActivityTypes.has(m.activityType)
        );
    }
    
    markerClusterGroup.addLayers(filteredMarkers);
    
    document.querySelectorAll('.filter-controls button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${type}`).classList.add('active');
    
    console.log(`Filter: ${type} - ${filteredMarkers.length} markers zichtbaar`);
}

// Toggle activity type
function toggleActivityType(type) {
    if (activeActivityTypes.has(type)) {
        activeActivityTypes.delete(type);
    } else {
        activeActivityTypes.add(type);
    }
    
    const activeBtn = document.querySelector('.filter-controls button.active');
    const fishType = activeBtn ? activeBtn.id.replace('btn-', '') : 'all';
    filterFish(fishType);
    
    document.getElementById(`check-${type}`).checked = activeActivityTypes.has(type);
}

// Laad alles
loadCatches();
