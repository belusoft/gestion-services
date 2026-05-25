/**
 * APPLICATION DE GESTION DES SERVICES
 * Frontend JavaScript - Client & Admin
 *
 * Fonctionnalités:
 * - Gestion des indisponibilités (calendrier interactif)
 * - Affichage du programme mensuel
 * - Synchronisation Google Sheets via Google Apps Script
 * - Interface administrateur sécurisée
 const CONFIG = {
    API_ENDPOINT: 'VOTRE_URL_ICI', // Remplacer par l'URL de l'étape 2.4
    CACHE_DURATION: 5 * 60 * 1000,
    // ...
};

// ============================================
// CONFIGURATION GLOBALE
// ============================================

const CONFIG = {
    API_ENDPOINT: 'https://script.google.com/macros/d/{SCRIPT_ID}/usercontent', // À remplacer
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    MONTHS_FR: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
    WEEKDAYS_SHORT: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
};

// ============================================
// ÉTAT GLOBAL DE L'APPLICATION
// ============================================

let appState = {
    freres: [],
    services: [],
    disponibilites: {},
    programme: {},
    selectedFrere: null,
    selectedDate: null,
    selectedEtat: 'Disponible',
    currentMonth: new Date(),
    isAdmin: false,
    lastSync: null,
    cache: {},
};

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadData();
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('Service Worker registration failed:', err);
    });
}

function initializeApp() {
    console.log('🚀 Initialisation application...');

    // Charger les données du cache local
    loadFromLocalStorage();

    // Vérifier si connecté en tant qu'admin
    checkAdminStatus();

    // Initialiser le calendrier
    renderCalendar();

    // Charger les données initiales
    updateLastSyncTime();
}

function setupEventListeners() {
    // Navigation par onglets
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Sélection du frère
    document.getElementById('selectFrere').addEventListener('change', (e) => {
        appState.selectedFrere = e.target.value;
        renderCalendar();
    });

    // Sélection état
    document.querySelectorAll('input[name="etat"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            appState.selectedEtat = e.target.value;
        });
    });

    // Navigation calendrier
    document.addEventListener('click', (e) => {
        if (e.target.dataset.prevMonth) {
            appState.currentMonth.setMonth(appState.currentMonth.getMonth() - 1);
            renderCalendar();
        }
        if (e.target.dataset.nextMonth) {
            appState.currentMonth.setMonth(appState.currentMonth.getMonth() + 1);
            renderCalendar();
        }
    });

    // Clic sur jour du calendrier
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('day') && !e.target.classList.contains('other-month')) {
            selectDate(e.target);
        }
    });

    // Sauvegarde disponibilité
    document.getElementById('btnSauvegarder').addEventListener('click', saveAvailability);

    // Synchronisation
    document.getElementById('btnSync').addEventListener('click', syncWithServer);

    // Admin
    document.getElementById('btnAdmin').addEventListener('click', toggleAdminPanel);

    // Export PDF
    document.getElementById('btnExportPDF').addEventListener('click', exportProgrammeToPDF);

    // Filtre programme
    document.getElementById('filterVue').addEventListener('change', loadProgramme);
}

// ============================================
// GESTION DES ONGLETS
// ============================================

function switchTab(tabName) {
    // Masquer tous les onglets
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Afficher l'onglet sélectionné
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Charger les données spécifiques à l'onglet
    if (tabName === 'programme') {
        loadProgramme();
    }
}

// ============================================
// CALENDRIER
// ============================================

function renderCalendar() {
    if (!appState.selectedFrere) {
        document.getElementById('calendarContainer').innerHTML =
            '<div class="empty-state"><p>⚠️ Sélectionnez un frère d\'abord</p></div>';
        return;
    }

    const month = appState.currentMonth;
    const year = month.getFullYear();
    const monthIndex = month.getMonth();

    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const prevLastDay = new Date(year, monthIndex, 0);

    const firstWeekday = firstDay.getDay();
    const lastDayNum = lastDay.getDate();
    const prevLastDayNum = prevLastDay.getDate();

    let html = `
        <div class="calendar">
            <div class="calendar-header">
                <h3>${CONFIG.MONTHS_FR[monthIndex]} ${year}</h3>
                <div class="calendar-nav">
                    <button data-prev-month>◀</button>
                    <button data-next-month>▶</button>
                </div>
            </div>
            <div class="weekdays">
                ${CONFIG.WEEKDAYS_SHORT.map(day => `<div class="weekday">${day}</div>`).join('')}
            </div>
            <div class="days">
    `;

    // Jours du mois précédent
    for (let i = firstWeekday - 1; i >= 0; i--) {
        html += `<div class="day other-month">${prevLastDayNum - i}</div>`;
    }

    // Jours du mois actuel
    for (let day = 1; day <= lastDayNum; day++) {
        const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dispo = appState.disponibilites[`${appState.selectedFrere}_${dateStr}`];
        const isToday = new Date().toISOString().split('T')[0] === dateStr;
        const isDisabled = new Date(year, monthIndex, day) < new Date().setHours(0, 0, 0, 0);

        let stateClass = '';
        if (dispo === 'Disponible') stateClass = 'dispo';
        else if (dispo === 'Indisponible') stateClass = 'indispo';
        else if (dispo === 'Participation_Exterieure') stateClass = 'participation';

        const selectedClass = appState.selectedDate === dateStr ? 'selected' : '';
        const disabledClass = isDisabled ? 'disabled' : '';

        html += `
            <div class="day ${stateClass} ${selectedClass} ${disabledClass}"
                 data-date="${dateStr}">${day}</div>
        `;
    }

    // Jours du mois suivant
    const remainingDays = 42 - (firstWeekday - 1 + lastDayNum);
    for (let day = 1; day <= remainingDays; day++) {
        html += `<div class="day other-month">${day}</div>`;
    }

    html += `</div></div>`;
    document.getElementById('calendarContainer').innerHTML = html;
}

function selectDate(dayElement) {
    document.querySelectorAll('.day.selected').forEach(el => {
        el.classList.remove('selected');
    });

    dayElement.classList.add('selected');
    appState.selectedDate = dayElement.dataset.date;
}

// ============================================
// GESTION DISPONIBILITÉS
// ============================================

async function saveAvailability() {
    if (!appState.selectedFrere || !appState.selectedDate) {
        showNotification('⚠️ Sélectionnez un frère et une date', 'error');
        return;
    }

    const commentaire = document.getElementById('commentaire').value || '';
    const btnSauvegarder = document.getElementById('btnSauvegarder');
    const btnText = document.getElementById('btnText');
    const originalText = btnText.textContent;

    btnSauvegarder.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span> Enregistrement...';

    try {
        const response = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                action: 'saveAvailability',
                frere_id: appState.selectedFrere,
                date: appState.selectedDate,
                etat: appState.selectedEtat,
                notes: commentaire,
                timestamp: new Date().toISOString(),
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Mettre à jour l'état local
            const key = `${appState.selectedFrere}_${appState.selectedDate}`;
            appState.disponibilites[key] = appState.selectedEtat;

            // Sauvegarder dans localStorage
            saveToLocalStorage();

            // Rafraîchir le calendrier
            renderCalendar();

            // Réinitialiser le formulaire
            document.getElementById('commentaire').value = '';
            appState.selectedDate = null;

            showNotification('✅ Disponibilité enregistrée avec succès', 'success');
        } else {
            throw new Error(data.message || 'Erreur serveur');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showNotification('❌ Erreur lors de l\'enregistrement', 'error');
    } finally {
        btnSauvegarder.disabled = false;
        btnText.textContent = originalText;
    }
}

// ============================================
// PROGRAMME MENSUEL
// ============================================

async function loadProgramme() {
    const filterType = document.getElementById('filterVue').value;
    const container = document.getElementById('programmeContainer');

    try {
        const response = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getProgramme',
                month: `${appState.currentMonth.getFullYear()}-${String(appState.currentMonth.getMonth() + 1).padStart(2, '0')}`,
                filterType: filterType,
                frere_id: appState.selectedFrere || null,
            })
        });

        const data = await response.json();

        if (data.status === 'success' && data.programme) {
            displayProgramme(data.programme, filterType);
        } else {
            container.innerHTML = '<div class="empty-state"><p>📅 Aucun programme disponible</p></div>';
        }
    } catch (error) {
        console.error('Erreur chargement programme:', error);
        container.innerHTML = '<div class="empty-state"><p>❌ Erreur lors du chargement</p></div>';
    }
}

function displayProgramme(programme, filterType) {
    const container = document.getElementById('programmeContainer');
    let html = '';

    if (filterType === 'date') {
        // Groupé par date
        Object.entries(programme).forEach(([date, services]) => {
            const dateObj = new Date(date);
            const dateFormatee = dateObj.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
            });

            html += `<div class="program-item">
                <div class="program-date">${dateFormatee}</div>`;

            services.forEach(service => {
                html += `
                    <div class="program-service">
                        <div class="program-service-title">🔹 ${service.nom} (${service.effectif} frères)</div>
                        <div class="program-service-members">${service.freres.join(', ')}</div>
                    </div>
                `;
            });

            html += '</div>';
        });
    } else if (filterType === 'service') {
        // Groupé par service
        const serviceMap = {};
        Object.entries(programme).forEach(([date, services]) => {
            services.forEach(service => {
                if (!serviceMap[service.id]) {
                    serviceMap[service.id] = { nom: service.nom, dates: [] };
                }
                serviceMap[service.id].dates.push({ date, freres: service.freres });
            });
        });

        Object.entries(serviceMap).forEach(([serviceId, serviceData]) => {
            html += `<div class="program-item">
                <div class="program-date">🔹 ${serviceData.nom}</div>`;

            serviceData.dates.forEach(item => {
                const dateObj = new Date(item.date);
                const dateFormatee = dateObj.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short'
                });
                html += `
                    <div class="program-service">
                        <div class="program-service-title">${dateFormatee}</div>
                        <div class="program-service-members">${item.freres.join(', ')}</div>
                    </div>
                `;
            });

            html += '</div>';
        });
    }

    container.innerHTML = html || '<div class="empty-state"><p>📅 Aucun élément à afficher</p></div>';
}

// ============================================
// SYNCHRONISATION
// ============================================

async function syncWithServer() {
    const btnSync = document.getElementById('btnSync');
    const originalContent = btnSync.innerHTML;

    btnSync.innerHTML = '⏳';
    btnSync.disabled = true;

    try {
        const response = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                action: 'sync',
                timestamp: new Date().toISOString(),
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            appState.freres = data.freres || [];
            appState.services = data.services || [];
            appState.disponibilites = data.disponibilites || {};
            appState.programme = data.programme || {};
            appState.lastSync = new Date();

            saveToLocalStorage();
            updateLastSyncTime();
            renderCalendar();
            loadProgramme();

            showNotification('✅ Synchronisation réussie', 'success');
        }
    } catch (error) {
        console.error('Erreur synchronisation:', error);
        showNotification('❌ Erreur de synchronisation', 'error');
    } finally {
        btnSync.innerHTML = originalContent;
        btnSync.disabled = false;
    }
}

// ============================================
// INTERFACE ADMINISTRATEUR
// ============================================

function checkAdminStatus() {
    const adminToken = localStorage.getItem('adminToken');
    appState.isAdmin = !!adminToken && isTokenValid(adminToken);
}

function toggleAdminPanel() {
    if (appState.isAdmin) {
        // Ouvrir le panneau admin
        showAdminPanel();
    } else {
        // Demander l'authentification
        showAdminLogin();
    }
}

function showAdminLogin() {
    const codeAdmin = prompt('🔐 Entrez le code administrateur:');

    if (!codeAdmin) return;

    // En production, vérifier avec le serveur
    // Pour la démo, code simple
    if (codeAdmin === 'ADMIN2026') {
        const token = btoa(JSON.stringify({ admin: true, timestamp: Date.now() }));
        localStorage.setItem('adminToken', token);
        appState.isAdmin = true;
        showNotification('✅ Connecté en tant qu\'administrateur', 'success');
        showAdminPanel();
    } else {
        showNotification('❌ Code incorrect', 'error');
    }
}

function showAdminPanel() {
    // Créer une modale admin
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 0.5rem;
            padding: 2rem;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        ">
            <h2>👨‍💼 Panneau Administrateur</h2>
            <div style="margin-top: 1.5rem;">
                <button id="btnFreres" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem;">
                    👥 Gestion Frères
                </button>
                <button id="btnServices" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem;">
                    🔹 Gestion Services
                </button>
                <button id="btnGenerer" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem;">
                    📅 Générer Programme
                </button>
                <button id="btnStats" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem;">
                    📊 Statistiques
                </button>
                <button id="btnFermer" style="width: 100%; padding: 0.75rem; background: #dc2626; color: white;">
                    Fermer
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnFermer').addEventListener('click', () => {
        modal.remove();
    });

    document.getElementById('btnGenerer').addEventListener('click', () => {
        generateProgrammeAdmin();
        modal.remove();
    });
}

async function generateProgrammeAdmin() {
    const confirm = window.confirm('Êtes-vous sûr de vouloir générer le programme du prochain mois?\n\nCette action ne peut pas être annulée.');

    if (!confirm) return;

    try {
        const response = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                action: 'generateProgramme',
                nextMonth: true,
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('✅ Programme généré et envoyé aux frères', 'success');
        } else {
            showNotification('❌ Erreur: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showNotification('❌ Erreur lors de la génération', 'error');
    }
}

// ============================================
// EXPORT PDF
// ============================================

async function exportProgrammeToPDF() {
    showNotification('📄 Génération du PDF en cours...', 'success');

    // Générer un PDF simple avec les données du programme
    // En production, utiliser une librairie comme jsPDF
    const month = CONFIG.MONTHS_FR[appState.currentMonth.getMonth()];
    const year = appState.currentMonth.getFullYear();

    let content = `PROGRAMME ${month.toUpperCase()} ${year}\n\n`;

    Object.entries(appState.programme).forEach(([date, services]) => {
        content += `${date}:\n`;
        services.forEach(s => {
            content += `  - ${s.nom}: ${s.freres.join(', ')}\n`;
        });
        content += '\n';
    });

    // Créer un fichier texte pour le moment
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', `programme-${month.toLowerCase()}-${year}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    showNotification('✅ PDF téléchargé', 'success');
}

// ============================================
// UTILITAIRES
// ============================================

function updateLastSyncTime() {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('lastSync').textContent = timeStr;
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function saveToLocalStorage() {
    localStorage.setItem('appState', JSON.stringify({
        freres: appState.freres,
        disponibilites: appState.disponibilites,
        programme: appState.programme,
        lastSync: appState.lastSync,
    }));
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('appState');
    if (saved) {
        const data = JSON.parse(saved);
        appState.freres = data.freres || [];
        appState.disponibilites = data.disponibilites || {};
        appState.programme = data.programme || {};
        appState.lastSync = data.lastSync;

        // Remplir le dropdown des frères
        populateFrereDropdown();
    }
}

function populateFrereDropdown() {
    const select = document.getElementById('selectFrere');
    select.innerHTML = '<option value="">-- Choisir --</option>';

    appState.freres.forEach(frere => {
        const option = document.createElement('option');
        option.value = frere.id;
        option.textContent = frere.nom;
        select.appendChild(option);
    });
}

function isTokenValid(token) {
    try {
        const data = JSON.parse(atob(token));
        const age = Date.now() - data.timestamp;
        return age < 24 * 60 * 60 * 1000; // 24 heures
    } catch {
        return false;
    }
}

// Charger les frères au démarrage
document.addEventListener('DOMContentLoaded', populateFrereDropdown);
