// ====================================
// AUTHENTICATION CHECK
// ====================================

// Check of gebruiker is ingelogd
async function checkAuth() {
    // Wacht tot Supabase client beschikbaar is
    let attempts = 0;
    const maxAttempts = 10;
    
    while ((!supabase || typeof supabase.auth === 'undefined') && attempts < maxAttempts) {
        console.log(`Wachten op Supabase... (poging ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }
    
    if (!supabase || typeof supabase.auth === 'undefined') {
        console.error('Supabase niet beschikbaar');
        return false;
    }
    
    try {
        const { data } = await supabase.auth.getSession();
        
        if (!data.session) {
            console.log('Niet ingelogd, redirect naar login');
            const currentUrl = encodeURIComponent(window.location.pathname);
            window.location.href = `login.html?return=${currentUrl}`;
            return false;
        }
        
        console.log('Ingelogd als:', data.session.user.email);
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Logout functie
async function logout() {
    const confirmLogout = confirm('Weet je zeker dat je wilt uitloggen?');
    if (!confirmLogout) return;
    
    try {
        await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
        console.warn('Logout warning:', error.message);
    }
    
    window.location.href = 'login.html';
}

// Check auth bij app start en laad dan data
checkAuth().then(isAuthenticated => {
    if (isAuthenticated) {
        console.log('Gebruiker geauthenticeerd, kaart wordt geladen');
        loadCatches(); // Laad data alleen NA succesvolle authenticatie
    }
});

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
// KAART INITIALISEREN
// ====================================

// Maak de kaart en centreer op Nederland
const map = L.map('map').setView([52.1326, 5.2913], 7);

// Voeg OpenStreetMap tiles toe
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// ====================================
// ICONEN DEFINIËREN
// ====================================

// Custom iconen per vissoort (verschillende kleuren)
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

// Bewaar alle markers voor filtering
let allMarkers = [];

// ====================================
// DATA OPHALEN EN MARKERS MAKEN
// ====================================

async function loadCatches() {
    try {
        console.log('Vangsten ophalen van Supabase...');
        
        // Haal alle vangsten op met JOIN naar aastabel voor aas naam
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
        console.log('Voorbeeld data:', data[0]); // Voor debugging
        
        if (data.length === 0) {
            console.warn('Geen vangsten gevonden in de database');
            alert('Er zijn nog geen vangsten in de database');
            return;
        }
        
        // Maak een marker voor elke vangst
        data.forEach(vangst => {
            // Check of GPS coordinaten aanwezig zijn
            if (!vangst.gps_lat || !vangst.gps_long) {
                console.warn('Vangst zonder GPS coordinaten:', vangst);
                return;
            }
            
            // Bepaal welk icoon te gebruiken
            // Database heeft hoofdletters (Snoek, Baars, Snoekbaars), we maken kleine letters voor matching
            const vissoort = vangst.soort ? vangst.soort.toLowerCase() : 'overig';
            const icon = fishIcons[vissoort] || fishIcons.overig;
            
            // Maak de marker
            const marker = L.marker([vangst.gps_lat, vangst.gps_long], {
                icon: icon
            });
            
            // Haal aas naam op uit de JOIN (of toon "Onbekend" als niet beschikbaar)
            const aasNaam = vangst.aastabel?.naam || 'Onbekend';
            
            // Formatteer datum als deze bestaat
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
            
            // Maak popup content
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
            
            // Bewaar extra info voor filtering
            marker.fishType = vissoort;
            marker.catchData = vangst;
            
            // Voeg toe aan onze lijst
            allMarkers.push(marker);
        });
        
        // Voeg alle markers toe aan de cluster groep
        markerClusterGroup.addLayers(allMarkers);
        
        // Voeg cluster groep toe aan de kaart
        map.addLayer(markerClusterGroup);
        
        // Zoom automatisch naar alle markers
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
    // Verwijder alle markers
    markerClusterGroup.clearLayers();
    
    // Filter markers
    let filteredMarkers;
    if (type === 'all') {
        filteredMarkers = allMarkers;
    } else {
        filteredMarkers = allMarkers.filter(marker => marker.fishType === type);
    }
    
    // Voeg gefilterde markers toe
    markerClusterGroup.addLayers(filteredMarkers);
    
    // Update actieve knop styling
    document.querySelectorAll('.filter-controls button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${type}`).classList.add('active');
    
    console.log(`Filter: ${type} - ${filteredMarkers.length} markers zichtbaar`);
}

// ====================================
// APP START
// ====================================
// Let op: loadCatches() wordt aangeroepen in checkAuth().then() bovenaan
// Niet hier onderaan, omdat we eerst moeten wachten op authenticatie
