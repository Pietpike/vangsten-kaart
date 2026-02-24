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

// Voer auth check uit EN laad data + fase 3
checkAuth().then(isAuthenticated => {
    if (isAuthenticated) {
        console.log('Gebruiker is geauthenticeerd, kaart en fase 3 worden geladen');
        loadAllData();
        initPhase3();
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
    snoek:      createIcon('green',   false),
    snoekbaars: createIcon('grey',    false),
    baars:      createIcon('red',     false),
    roofblei:   createIcon('orange',  false),
    meerval:    createIcon('brown',   false),
    winde:      createIcon('blue',    false),
    grondel:    createIcon('purple',  false),
    overig:     createIcon('violet',  false)
};

// Iconen voor waarnemingen (70% opacity via CSS .sighting-marker)
const sightingFishIcons = {
    snoek:      createIcon('green',   true),
    snoekbaars: createIcon('grey',    true),
    baars:      createIcon('red',     true),
    roofblei:   createIcon('orange',  true),
    meerval:    createIcon('brown',   true),
    winde:      createIcon('blue',    true),
    grondel:    createIcon('purple',  true),
    overig:     createIcon('violet',  true)
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
        console.log('Vangsten, waarnemingen en veld-vangsten ophalen van Supabase...');

        // Alle queries parallel uitvoeren
        const [catchesResult, sightingsResult, fieldCatchesResult] = await Promise.all([
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
                .select('*'),
            supabaseClient
                .from('field_catches')
                .select('*')
        ]);

        if (catchesResult.error) {
            console.error('Fout bij ophalen vangsten:', catchesResult.error);
        }
        if (sightingsResult.error) {
            console.error('Fout bij ophalen waarnemingen:', sightingsResult.error);
        }
        if (fieldCatchesResult.error) {
            console.error('Fout bij ophalen veld-vangsten:', fieldCatchesResult.error);
        }

        const catches      = catchesResult.data      || [];
        const sightings    = sightingsResult.data    || [];
        const fieldCatches = fieldCatchesResult.data || [];
        
        console.log('Vangsten geladen:', catches.length);
        console.log('Waarnemingen geladen:', sightings.length);
        console.log('Veld-vangsten geladen:', fieldCatches.length);

        if (catches.length === 0 && sightings.length === 0 && fieldCatches.length === 0) {
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

        // ---- Veld-vangsten markers maken ----
        fieldCatches.forEach(vangst => {
            if (!vangst.latitude || !vangst.longitude) {
                console.warn('Veld-vangst zonder GPS coordinaten:', vangst);
                return;
            }

            const vissoort = vangst.species ? vangst.species.toLowerCase() : 'overig';
            const icon = fishIcons[vissoort] || fishIcons.overig;

            const marker = L.marker([vangst.latitude, vangst.longitude], { icon: icon });

            let datumTekst = 'Onbekend';
            if (vangst.caught_at) {
                try {
                    const datum = new Date(vangst.caught_at);
                    datumTekst = datum.toLocaleDateString('nl-NL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch (e) {
                    datumTekst = vangst.caught_at;
                }
            }

            const popupContent = `
                <div style="min-width: 200px;">
                    <h3 style="margin: 0 0 10px 0; color: #2c3e50;">🎣 ${vangst.species || 'Onbekend'} (Veld)</h3>
                    <p style="margin: 5px 0;"><strong>📅 Datum:</strong> ${datumTekst}</p>
                    ${vangst.length_cm ? '<p style="margin: 5px 0;"><strong>📏 Lengte:</strong> ' + vangst.length_cm + ' cm</p>' : ''}
                    <p style="margin: 5px 0;"><strong>🔢 Aantal:</strong> ${vangst.count || '1'}</p>
                    ${vangst.notes ? '<p style="margin: 5px 0;"><strong>📝 Notities:</strong> ' + vangst.notes + '</p>' : ''}
                </div>
            `;

            marker.bindPopup(popupContent);
            marker.fishType     = vissoort;
            marker.activityType = 'catch';

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
        
        console.log('✅ Kaart succesvol geladen met', allMarkers.length, 'markers (catches:', catches.length, '+ sightings:', sightings.length, '+ field_catches:', fieldCatches.length, ')');
        
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

// ====================================
// FASE 3 — SESSIE & VANGST FUNCTIONALITEIT
// ====================================

// State voor actieve sessie
let activeSession = null;
let userLocation = null;
let userId = null;

// Initialiseer Fase 3 (bij pagina load)
async function initPhase3() {
    // Haal huidige user op
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        userId = data.session.user.id;
        console.log('Gebruiker ID:', userId);
    }

    // Laad vorige sessie uit localStorage (als deze bestaat)
    loadSessionFromStorage();

    // Check GPS perms
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            position => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
            },
            error => console.warn('GPS unavailable:', error),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    }

    // Setup slide-up panel drag
    setupPanelDrag();
}

// Laad sessie uit localStorage
function loadSessionFromStorage() {
    const stored = localStorage.getItem('activeSession');
    if (stored) {
        activeSession = JSON.parse(stored);
        updateSessionUI();
        showPanel();
    }
}

// Sla sessie op in localStorage
function saveSessionToStorage() {
    if (activeSession) {
        localStorage.setItem('activeSession', JSON.stringify(activeSession));
    } else {
        localStorage.removeItem('activeSession');
    }
}

// Update sessie UI
function updateSessionUI() {
    const sessionInfo = document.getElementById('sessionInfo');
    const statusSpan = sessionInfo.querySelector('span:first-child');
    const timeSpan = document.getElementById('sessionTime');
    const btnStart = document.getElementById('btnStartSession');
    const catchSection = document.getElementById('catchSection');
    const stopSessionSection = document.getElementById('stopSessionSection');
    const stopForm = document.getElementById('stopSessionForm');

    if (activeSession) {
        sessionInfo.classList.add('active');
        const elapsed = Math.floor((Date.now() - activeSession.start_time) / 1000 / 60);
        statusSpan.textContent = '✅ Sessie actief';
        timeSpan.textContent = `${elapsed} minuten`;
        btnStart.style.display = 'none';
        catchSection.style.display = 'block';
        stopSessionSection.style.display = 'block';
        stopForm.style.display = 'none';
        document.getElementById('btnAddCatch').disabled = false;

        // Update tijdweergave elke minuut
        if (!window.sessionUpdateInterval) {
            window.sessionUpdateInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - activeSession.start_time) / 1000 / 60);
                const timeEl = document.getElementById('sessionTime');
                if (timeEl) {
                    timeEl.textContent = `${elapsed} minuten`;
                }
            }, 60000);
        }
    } else {
        sessionInfo.classList.remove('active');
        statusSpan.textContent = 'Geen actieve sessie';
        timeSpan.textContent = '';
        btnStart.style.display = 'block';
        catchSection.style.display = 'none';
        stopSessionSection.style.display = 'none';
        stopForm.style.display = 'none';

        if (window.sessionUpdateInterval) {
            clearInterval(window.sessionUpdateInterval);
            window.sessionUpdateInterval = null;
        }
    }
}

// Start Sessie
async function startSession() {
    if (!userLocation) {
        alert('GPS niet beschikbaar. Zorg ervoor dat locatieservices ingeschakeld zijn.');
        return;
    }

    activeSession = {
        start_time: Date.now(),
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        user_id: userId,
        started_at: new Date().toISOString()
    };

    // Schrijf naar Supabase
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const insertData = {
            user_id: activeSession.user_id,
            start_tijd: activeSession.started_at,
            datum: today,
            gps_lat: activeSession.latitude,
            gps_lng: activeSession.longitude
        };
        console.log('Attempting to insert field_sessions with:', JSON.stringify(insertData, null, 2));

        const { data, error } = await supabaseClient
            .from('field_sessions')
            .insert(insertData)
            .select();

        if (error) {
            console.error('🔴 SUPABASE ERROR:', JSON.stringify(error, null, 2));
            console.error('Error message:', error.message);
            console.error('Error details:', error.details);
            console.error('Error hint:', error.hint);
            throw error;
        }

        // Sla gegenereerde ID op
        if (data && data.length > 0) {
            activeSession.id = data[0].id;
            console.log('✅ Sessie aangemaakt met ID:', activeSession.id);
        }

        saveSessionToStorage();
        updateSessionUI();
        showPanel();
        showSuccessMessage('Sessie gestart!');
    } catch (error) {
        console.error('Error starting session:', error);
        alert('Fout bij starten sessie: ' + error.message);
        activeSession = null;
    }
}

// Show Add Catch Form
function showAddCatchForm() {
    document.getElementById('catchForm').style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
}

// Hide Add Catch Form
function hideCatchForm() {
    document.getElementById('catchForm').style.display = 'none';
    document.getElementById('catchSpecies').value = '';
    document.getElementById('catchLength').value = '';
    document.getElementById('catchCount').value = '1';
    document.getElementById('catchNotes').value = '';
}

// Save Catch
async function saveCatch() {
    if (!activeSession) {
        alert('Geen actieve sessie!');
        return;
    }

    const species = document.getElementById('catchSpecies').value;
    if (!species) {
        alert('Selecteer een vissoort!');
        return;
    }

    if (!userLocation) {
        alert('GPS niet beschikbaar!');
        return;
    }

    const catchRecord = {
        session_id: activeSession.id,
        species: species,
        length_cm: parseInt(document.getElementById('catchLength').value) || null,
        count: parseInt(document.getElementById('catchCount').value) || 1,
        notes: document.getElementById('catchNotes').value || null,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        caught_at: new Date().toISOString()
    };

    try {
        const catchInsertData = {
            field_session_id: catchRecord.session_id,
            user_id: userId,
            vangst_tijd: catchRecord.caught_at,
            soort: catchRecord.species,
            lengte: catchRecord.length_cm,
            aantal: catchRecord.count,
            gps_lat: catchRecord.latitude,
            gps_lng: catchRecord.longitude,
            notities: catchRecord.notes
        };
        console.log('Attempting to insert field_catches with:', JSON.stringify(catchInsertData));

        const { error } = await supabaseClient
            .from('field_catches')
            .insert(catchInsertData);

        if (error) {
            console.error('Supabase field_catches error:', error);
            throw error;
        }

        showSuccessMessage(`Vangst opgeslagen: ${species}${catchRecord.length_cm ? ' (' + catchRecord.length_cm + 'cm)' : ''}`);
        hideCatchForm();
    } catch (error) {
        console.error('Error saving catch:', error);
        alert('Fout bij opslaan: ' + error.message);
    }
}

// Show Stop Session Form
function showStopSessionForm() {
    document.getElementById('stopSessionForm').style.display = 'block';
}

// Hide Stop Session Form
function hideStopSessionForm() {
    document.getElementById('stopSessionForm').style.display = 'none';
    // Reset formulier velden
    document.getElementById('stopLocation').value = '';
    document.getElementById('waterTemp').value = '';
    document.getElementById('clarity').value = '';
    document.getElementById('flowRate').value = '';
    document.getElementById('depth').value = '';
    document.getElementById('bottomType').value = '';
    document.getElementById('stopNotes').value = '';
}

// Stop Sessie
async function stopSession() {
    if (!activeSession) return;

    const sessionUpdate = {
        eind_tijd: new Date().toISOString(),
        locatie: document.getElementById('stopLocation').value || null,
        watertemperatuur: parseFloat(document.getElementById('waterTemp').value) || null,
        helderheid: document.getElementById('clarity').value || null,
        stroomsnelheid: document.getElementById('flowRate').value || null,
        diepte: parseFloat(document.getElementById('depth').value) || null,
        bodem_hardheid: document.getElementById('bottomType').value || null,
        notities: document.getElementById('stopNotes').value || null
    };

    try {
        console.log('Attempting to update field_sessions with:', sessionUpdate);

        const { error } = await supabaseClient
            .from('field_sessions')
            .update(sessionUpdate)
            .eq('id', activeSession.id);

        if (error) {
            console.error('Supabase field_sessions update error:', error);
            throw error;
        }

        activeSession = null;
        saveSessionToStorage();
        updateSessionUI();
        hideStopSessionForm();
        hidePanel();
        showSuccessMessage('Sessie beëindigd!');
    } catch (error) {
        console.error('Error stopping session:', error);
        alert('Fout bij beëindigen sessie: ' + error.message);
    }
}

// Panel Controls
function showPanel() {
    document.getElementById('bottomPanel').classList.add('active');
}

function hidePanel() {
    document.getElementById('bottomPanel').classList.remove('active');
}

function showSuccessMessage(message) {
    const msgEl = document.getElementById('successMessage');
    msgEl.textContent = message;
    msgEl.style.display = 'block';
    setTimeout(() => {
        msgEl.style.display = 'none';
    }, 3000);
}

// Setup drag handle voor slide-up panel (mouse + touch)
function setupPanelDrag() {
    const panel = document.getElementById('bottomPanel');
    const handle = document.querySelector('.panel-handle');
    if (!handle) {
        console.warn('Panel handle niet gevonden');
        return;
    }

    let isDragging = false;
    let startY = 0;
    let currentY = 0;

    // Mouse events
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        currentY = e.clientY - startY;

        if (currentY > 0) {
            panel.style.transform = `translateY(${currentY}px)`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;

        // Snap naar open/gesloten
        if (currentY > 50) {
            hidePanel();
        } else {
            showPanel();
        }
        panel.style.transform = '';
    });

    // Touch events
    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY - startY;

        if (currentY > 0) {
            panel.style.transform = `translateY(${currentY}px)`;
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;

        // Snap naar open/gesloten
        if (currentY > 50) {
            hidePanel();
        } else {
            showPanel();
        }
        panel.style.transform = '';
    });
}

// Fase 3 wordt nu aangeroepen vanuit checkAuth().then() hierboven
