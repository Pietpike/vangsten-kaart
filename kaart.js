// ====================================
// SUPABASE CONFIGURATIE
// ====================================

const SUPABASE_URL = 'https://hezjtqaowjpyvkadeisp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlemp0cWFvd2pweXZrYWRlaXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MTQ3NTMsImV4cCI6MjA2ODk5MDc1M30.hq0IwhnnrJIXfTMGNE6PJkB0qhx2t7h3h0UOpZGi7wo';

const supabase = window.supabase.createClient(
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
    const { data } = await supabase.auth.getSession();
    
    if (!data.session) {
        console.log('Niet ingelogd, redirect naar login pagina');
        window.location.href = 'login.html';
        return false;
    }
    
    console.log('Ingelogd als:', data.session.user.email);
    return true;
}

async function logout() {
    const { error } = await supabase.auth.signOut();
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
        loadCatches();
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

// ====================================
// DATA OPHALEN EN MARKERS MAKEN
// ====================================

async function loadCatches() {
    try {
        console.log('Vangsten ophalen van Supabase...');
        
        const { data, error } = await supabase
            .from('catches')
            .select(`
                *,
                aastabel:aas_id (
                    naam
                )
            `);
        
        if (error) {
            console.error('Fout bij ophalen data:', error);
            alert('Kon vangsten niet laden. Check de console (F12) voor details.\n\nError: ' + error.message);
            return;
        }
        
        console.log('Aantal vangsten geladen:', data.length);
        console.log('Voorbeeld data:', data[0]);
        
        if (data.length === 0) {
            console.warn('Geen vangsten gevonden in de database');
            alert('Er zijn nog geen vangsten in de database');
            return;
        }
        
        data.forEach(vangst => {
            if (!vangst.gps_lat || !vangst.gps_long) {
                console.warn('Vangst zonder GPS coordinaten:', vangst);
                return;
            }
            
            const vissoort = vangst.soort ? vangst.soort.toLowerCase() : 'overig';
            const icon = fishIcons[vissoort] || fishIcons.overig;
            
            const marker = L.marker([vangst.gps_lat, vangst.gps_long], {
                icon: icon
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
                    <h3 style="margin: 0 0 10px 0; color: #2c3e50;">${vangst.soort || 'Onbekend'}</h3>
                    <p style="margin: 5px 0;"><strong>📅 Datum:</strong> ${datumTekst}</p>
                    <p style="margin: 5px 0;"><strong>🎣 Aas:</strong> ${aasNaam}</p>
                    <p style="margin: 5px 0;"><strong>📏 Lengte:</strong> ${vangst.lengte ? vangst.lengte + ' cm' : 'Onbekend'}</p>
                    <p style="margin: 5px 0;"><strong>🔢 Aantal:</strong> ${vangst.aantal || '1'}</p>
                    ${vangst.techniek ? `<p style="margin: 5px 0;"><strong>⚙️ Techniek:</strong> ${vangst.techniek}</p>` : ''}
                </div>
            `;
            
            marker.bindPopup(popupContent);
            marker.fishType = vissoort;
            marker.catchData = vangst;
            
            allMarkers.push(marker);
        });
        
        markerClusterGroup.addLayers(allMarkers);
        map.addLayer(markerClusterGroup);
        
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
// FILTER FUNCTIE
// ====================================

function filterFish(type) {
    markerClusterGroup.clearLayers();
    
    let filteredMarkers;
    if (type === 'all') {
        filteredMarkers = allMarkers;
    } else {
        filteredMarkers = allMarkers.filter(marker => marker.fishType === type);
    }
    
    markerClusterGroup.addLayers(filteredMarkers);
    
    document.querySelectorAll('.filter-controls button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${type}`).classList.add('active');
    
    console.log(`Filter: ${type} - ${filteredMarkers.length} markers zichtbaar`);
}
