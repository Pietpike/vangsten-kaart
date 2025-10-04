// Supabase configuratie
const SUPABASE_URL = 'https://hezjtqaowjpyvkadeisp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlemp0cWFvd2pweXZrYWRlaXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MTQ3NTMsImV4cCI6MjA2ODk5MDc1M30.hq0IwhnnrJIXfTMGNE6PJkB0qhx2t7h3h0UOpZGi7wo';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// GPS variabelen
let currentLat = null;
let currentLong = null;
let manualLat = null;
let manualLong = null;

// Kaart variabelen
let manualMap = null;
let manualMarker = null;

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

// GPS ophalen
function getLocation() {
    const gpsDisplay = document.getElementById('gps_display');
    gpsDisplay.textContent = 'GPS wordt opgehaald...';
    
    if (!navigator.geolocation) {
        gpsDisplay.textContent = 'GPS niet beschikbaar op dit apparaat';
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        position => {
            currentLat = position.coords.latitude;
            currentLong = position.coords.longitude;
            gpsDisplay.textContent = `${currentLat.toFixed(6)}, ${currentLong.toFixed(6)}`;
        },
        error => {
            console.error('GPS error:', error);
            gpsDisplay.textContent = 'GPS fout: ' + error.message;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

getLocation();

// Initialize manual map
function initManualMap() {
    if (manualMap) return;
    
    // Default centrum Nederland
    manualMap = L.map('manual_map').setView([52.1326, 5.2913], 8);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(manualMap);
    
    // Click event op kaart
    manualMap.on('click', function(e) {
        manualLat = e.latlng.lat;
        manualLong = e.latlng.lng;
        
        // Verwijder oude marker
        if (manualMarker) {
            manualMap.removeLayer(manualMarker);
        }
        
        // Voeg nieuwe marker toe
        manualMarker = L.marker([manualLat, manualLong]).addTo(manualMap);
        
        // Update display
        document.getElementById('manual_coords_display').textContent = 
            `${manualLat.toFixed(6)}, ${manualLong.toFixed(6)}`;
    });
}

// Toggle datetime input
function toggleDatetime() {
    const tijdType = document.querySelector('input[name="tijd_type"]:checked').value;
    const customDatetime = document.getElementById('custom_datetime');
    
    if (tijdType === 'custom') {
        customDatetime.classList.remove('hidden');
        customDatetime.required = true;
    } else {
        customDatetime.classList.add('hidden');
        customDatetime.required = false;
    }
}

// Toggle GPS input
function toggleGPS() {
    const gpsType = document.querySelector('input[name="gps_type"]:checked').value;
    const currentGPS = document.getElementById('current_gps_display');
    const manualGPS = document.getElementById('manual_gps_input');
    
    if (gpsType === 'manual') {
        currentGPS.classList.add('hidden');
        manualGPS.classList.remove('hidden');
        
        // Initialize kaart als het nog niet bestaat
        setTimeout(() => {
            initManualMap();
            manualMap.invalidateSize();
        }, 100);
    } else {
        currentGPS.classList.remove('hidden');
        manualGPS.classList.add('hidden');
    }
}

// Show message
function showMessage(type, message) {
    const successEl = document.getElementById('successMessage');
    const errorEl = document.getElementById('errorMessage');
    
    if (type === 'success') {
        successEl.textContent = message;
        successEl.style.display = 'block';
        errorEl.style.display = 'none';
    } else {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        successEl.style.display = 'none';
    }
    
    setTimeout(() => {
        successEl.style.display = 'none';
        errorEl.style.display = 'none';
    }, 5000);
}

// Go to map
function goToMap() {
    window.location.href = 'index.html';
}

// Form submit
document.getElementById('spotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig met opslaan...';
    
    try {
        // Haal huidige user op
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            showMessage('error', 'Je bent niet ingelogd');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Opslaan & Klaar';
            return;
        }
        
        // Datum/tijd bepalen
        const tijdType = document.querySelector('input[name="tijd_type"]:checked').value;
        let sightingDatetime;
        
        if (tijdType === 'nu') {
            sightingDatetime = new Date().toISOString();
        } else {
            const customDatetime = document.getElementById('custom_datetime').value;
            if (!customDatetime) {
                showMessage('error', 'Vul een datum in');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Opslaan & Klaar';
                return;
            }
            sightingDatetime = new Date(customDatetime).toISOString();
        }
        
        // GPS bepalen
        const gpsType = document.querySelector('input[name="gps_type"]:checked').value;
        let lat, long;
        
        if (gpsType === 'current') {
            if (!currentLat || !currentLong) {
                showMessage('error', 'Wacht tot GPS locatie is gevonden of kies handmatig');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Opslaan & Klaar';
                return;
            }
            lat = currentLat;
            long = currentLong;
        } else {
            if (!manualLat || !manualLong) {
                showMessage('error', 'Klik op de kaart om een locatie te kiezen');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Opslaan & Klaar';
                return;
            }
            lat = manualLat;
            long = manualLong;
        }
        
        // Verzamel data
        const sightingData = {
            soort: document.getElementById('soort').value,
            gps_lat: lat,
            gps_long: long,
            sighting_datetime: sightingDatetime,
            waarneming_type: document.getElementById('waarneming_type').value,
            zekerheid: document.getElementById('zekerheid').value,
            geschatte_grootte: document.getElementById('grootte').value || null,
            notities: document.getElementById('notities').value || null,
            media_url: document.getElementById('media_url').value || null,
            created_by: user.id
        };
        
        console.log('Sighting data:', sightingData);
        
        // Insert in database
        const { data, error } = await supabase
            .from('sightings')
            .insert(sightingData)
            .select();
        
        if (error) {
            throw error;
        }
        
        console.log('Sighting opgeslagen:', data);
        showMessage('success', 'Sighting opgeslagen! Redirect over 2 seconden...');
        
        // Reset form
        document.getElementById('spotForm').reset();
        
        // Reset GPS
        getLocation();
        
        // Reset manual map
        if (manualMarker) {
            manualMap.removeLayer(manualMarker);
            manualMarker = null;
        }
        manualLat = null;
        manualLong = null;
        document.getElementById('manual_coords_display').textContent = 'Klik op de kaart...';
        
        // Redirect naar kaart na 2 seconden
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        
    } catch (error) {
        console.error('Error:', error);
        showMessage('error', 'Fout bij opslaan: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Opslaan & Klaar';
    }
});
