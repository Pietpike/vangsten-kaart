// ====================================
// SUPABASE CONFIGURATIE
// ====================================

const SUPABASE_URL = 'https://hezjtqaowjpyvkadeisp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlemp0cWFvd2pweXZrYWRlaXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MTQ3NTMsImV4cCI6MjA2ODk5MDc1M30.hq0IwhnnrJIXfTMGNE6PJkB0qhx2t7h3h0UOpZGi7wo';

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL, 
    SUPABASE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    }
);

// ====================================
// AUTHENTICATION CHECK
// ====================================

async function checkAuth() {
    const { data } = await supabaseClient.auth.getSession();
    
    if (!data.session) {
        console.log('Niet ingelogd, redirect naar login pagina');
        window.location.href = 'login.html';
        return false;
    }
    
    console.log('Ingelogd als:', data.session.user.email);
    return true;
}

async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Logout error:', error);
    } else {
        window.location.href = 'login.html';
    }
}

// Voer auth check uit EN laad data
checkAuth().then(isAuthenticated => {
    if (isAuthenticated) {
        console.log('Gebruiker is geauthenticeerd, kaart wordt geladen');
        loadAllData();
    }
});

// ====================================
// KAART INITIALISEREN
// ====================================

const map = L.map('map').setView([52.1326, 5.2913], 7);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// ====================================
// ICONEN DEFINIËREN
// ====================================

// Helper: maak een Leaflet icon aan voor een bepaalde kleur en type
function createIcon(color, isSighting) {
    return L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
        // className wordt toegevoegd aan het icon img-element zodat CSS opacity werkt
        className: isSighting ? 'sighting-marker' : ''
    });
}

// Iconen voor vangsten (volledige opacity)
const fishIcons = {
    snoek:      createIcon('green',  false),
    snoekbaars: createIcon('grey',   false),
    baars:      createIcon('red',    false),
    overig:     createIcon('violet', false)
};

// Iconen voor waarnemingen (70% opacity via CSS .sighting-marker)
const sightingFishIcons = {
    snoek:      createIcon('green',  true),
    snoekbaars: createIcon('grey',   true),
    baars:      createIcon('red',    true),
    overig:     createIcon('violet', true)
};

// ====================================
// MARKER CLUSTER GROEP MAKEN
// ====================================

let markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 80,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
});

let allMarkers = [];

// Actieve filters bijhouden
let activeSpeciesFilter = 'all';
let activeActivityTypes = { catch: true, sighting: true };

// ====================================
// DATA OPHALEN EN MARKERS MAKEN
// ====================================

async function loadAllData() {
    try {
        console.log('Vangsten en waarnemingen ophalen van Supabase...');
        
        // Beide queries parallel uitvoeren
        const [catchesResult, sightingsResult] = await Promise.all([
            supabaseClient
                .from('catches')
                .select(`
                    *,
                    aastabel:aas_id (
                        naam
                    )
                `),
            supabaseClient
                .from('sightings')
                .select('*')
        ]);
        
        if (catchesResult.error) {
            console.error('Fout bij ophalen vangsten:', catchesResult.error);
        }
        if (sightingsResult.error) {
            console.error('Fout bij ophalen waarnemingen:', sightingsResult.error);
        }
        
        const catches   = catchesResult.data   || [];
        const sightings = sightingsResult.data || [];
        
        console.log('Vangsten geladen:', catches.length);
        console.log('Waarnemingen geladen:', sightings.length);
        
        if (catches.length === 0 && sightings.length === 0) {
            console.warn('Geen data gevonden in de database');
            alert('Er zijn nog geen vangsten of waarnemingen in de database');
            return;
        }
        
        // ---- Vangsten markers maken ----
        catches.forEach(vangst => {
            if (!vangst.gps_lat || !vangst.gps_long) {
                console.warn('Vangst zonder GPS coordinaten:', vangst);
                return;
            }
            
            const vissoort = vangst.soort ? vangst.soort.toLowerCase() : 'overig';
            const icon = fishIcons[vissoort] || fishIcons.overig;
            
            const marker = L.marker([vangst.gps_lat, vangst.gps_long], { icon: icon });
            
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
                    <h3 style="margin: 0 0 10px 0; color: #2c3e50;">🎣 ${vangst.soort || 'Onbekend'}</h3>
                    <p style="margin: 5px 0;"><strong>📅 Datum:</strong> ${datumTekst}</p>
                    <p style="margin: 5px 0;"><strong>🎣 Aas:</strong> ${aasNaam}</p>
                    <p style="margin: 5px 0;"><strong>📏 Lengte:</strong> ${vangst.lengte ? vangst.lengte + ' cm' : 'Onbekend'}</p>
                    <p style="margin: 5px 0;"><strong>🔢 Aantal:</strong> ${vangst.aantal || '1'}</p>
                    ${vangst.techniek ? '<p style="margin: 5px 0;"><strong>⚙️ Techniek:</strong> ' + vangst.techniek + '</p>' : ''}
                </div>
            `;
            
            marker.bindPopup(popupContent);
            marker.fishType     = vissoort;
            marker.activityType = 'catch';
            
            allMarkers.push(marker);
        });
        
        // ---- Waarnemingen markers maken ----
        sightings.forEach(waarneming => {
            if (!waarneming.gps_lat || !waarneming.gps_long) {
                console.warn('Waarneming zonder GPS coordinaten:', waarneming);
                return;
            }
            
            const vissoort = waarneming.soort ? waarneming.soort.toLowerCase() : 'overig';
            const icon = sightingFishIcons[vissoort] || sightingFishIcons.overig;
            
            const marker = L.marker([waarneming.gps_lat, waarneming.gps_long], { icon: icon });
            
            let datumTekst = 'Onbekend';
            if (waarneming.sighting_datetime) {
                try {
                    const datum = new Date(waarneming.sighting_datetime);
                    datumTekst = datum.toLocaleDateString('nl-NL', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch (e) {
                    datumTekst = waarneming.sighting_datetime;
                }
            }
            
            // Waarneming type vertalen naar leesbare tekst
            const waarnemingTypen = {
                'live':   'Live op locatie',
                'camera': 'Op foto',
                'video':  'Op video',
                'drone':  'Drone opname'
            };
            
            const popupContent = `
                <div style="min-width: 200px;">
                    <h3 style="margin: 0 0 10px 0; color: #E65100;">👁️ Waarneming: ${waarneming.soort || 'Onbekend'}</h3>
                    <p style="margin: 5px 0;"><strong>📅 Datum:</strong> ${datumTekst}</p>
                    <p style="margin: 5px 0;"><strong>👁️ Gezien:</strong> ${waarnemingTypen[waarneming.waarneming_type] || waarneming.waarneming_type || 'Onbekend'}</p>
                    <p style="margin: 5px 0;"><strong>✅ Zekerheid:</strong> ${waarneming.zekerheid || 'Onbekend'}</p>
                    ${waarneming.geschatte_grootte ? '<p style="margin: 5px 0;"><strong>📏 Grootte:</strong> ' + waarneming.geschatte_grootte + '</p>' : ''}
                    ${waarneming.notities ? '<p style="margin: 5px 0;"><strong>📝 Notities:</strong> ' + waarneming.notities + '</p>' : ''}
                    ${waarneming.media_url ? '<p style="margin: 5px 0;"><strong>📸 Media:</strong> <a href="' + waarneming.media_url + '" target="_blank" style="color:#E65100;">Bekijk</a></p>' : ''}
                </div>
            `;
            
            marker.bindPopup(popupContent);
            marker.fishType     = vissoort;
            marker.activityType = 'sighting';
            
            allMarkers.push(marker);
        });
        
        // Cluster groep op de kaart zetten en filters toepassen
        map.addLayer(markerClusterGroup);
        applyFilters();
        
        // Zoom naar alle markers
        if (allMarkers.length > 0) {
            const group = L.featureGroup(allMarkers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
        
        console.log('✅ Kaart succesvol geladen met', allMarkers.length, 'markers!');
        
    } catch (error) {
        console.error('Onverwachte fout:', error);
        alert('Er ging iets mis. Check de console (F12) voor details.\n\nError: ' + error.message);
    }
}

// ====================================
// FILTERS TOEPASSEN
// ====================================

// Centrale filterfunctie: combineert soort-filter en activiteit-filter
function applyFilters() {
    markerClusterGroup.clearLayers();
    
    const filteredMarkers = allMarkers.filter(marker => {
        // Filter op vissoort
        const speciesMatch = (activeSpeciesFilter === 'all') || (marker.fishType === activeSpeciesFilter);
        // Filter op activiteit type (vangst / waarneming)
        const activityMatch = activeActivityTypes[marker.activityType] === true;
        
        return speciesMatch && activityMatch;
    });
    
    markerClusterGroup.addLayers(filteredMarkers);
    
    console.log(`Filters: soort=${activeSpeciesFilter}, vangsten=${activeActivityTypes.catch}, waarnemingen=${activeActivityTypes.sighting} — ${filteredMarkers.length} markers zichtbaar`);
}

// Filter op vissoort (knoppen bovenaan)
function filterFish(type) {
    activeSpeciesFilter = type;
    
    // Update knop-styling
    document.querySelectorAll('.filter-controls button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${type}`).classList.add('active');
    
    applyFilters();
}

// Toggle activiteit type aan/uit (checkboxes: Vangsten / Waarnemingen)
function toggleActivityType(type) {
    const checkbox = document.getElementById(`check-${type}`);
    activeActivityTypes[type] = checkbox.checked;
    applyFilters();
}
