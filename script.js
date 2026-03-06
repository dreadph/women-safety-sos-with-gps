// Initialize Lucide Icons
lucide.createIcons();

// DOM Elements
const sosBtn = document.getElementById('sos-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const settingsForm = document.getElementById('settings-form');
const locationStatus = document.getElementById('location-status');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const toastIcon = document.getElementById('toast-icon');

// Form Inputs
const botTokenInput = document.getElementById('bot-token');
const chatIdInput = document.getElementById('chat-id');
const customMessageInput = document.getElementById('custom-message');

// State
let currentLocation = null;
let toastTimeout;
let locationWatchId = null;

// Initialize
function init() {
    loadSettings();
    requestLocationPermission();
}

// Settings Management
function loadSettings() {
    const token = localStorage.getItem('tg_bot_token');
    const chat = localStorage.getItem('tg_chat_id');
    const msg = localStorage.getItem('tg_custom_message');

    if (token) botTokenInput.value = token;
    if (chat) chatIdInput.value = chat;
    if (msg) customMessageInput.value = msg;

    if (!token || !chat) {
        showSettings();
        showToast('Please configure Telegram settings to use SOS', 'warning');
    }
}

function saveSettings(e) {
    e.preventDefault();
    localStorage.setItem('tg_bot_token', botTokenInput.value.trim());
    localStorage.setItem('tg_chat_id', chatIdInput.value.trim());
    localStorage.setItem('tg_custom_message', customMessageInput.value.trim());

    hideSettings();
    showToast('Configuration saved successfully!', 'success');
}

// UI Controls
function showSettings() {
    settingsModal.classList.remove('hidden');
}

function hideSettings() {
    settingsModal.classList.add('hidden');
}

function showToast(message, type = 'info') {
    clearTimeout(toastTimeout);

    toastMessage.textContent = message;
    toast.className = `toast ${type}`;

    // Set appropriate icon
    if (type === 'success') {
        toastIcon.setAttribute('data-lucide', 'check-circle');
    } else if (type === 'error') {
        toastIcon.setAttribute('data-lucide', 'alert-circle');
    } else if (type === 'warning') {
        toastIcon.setAttribute('data-lucide', 'alert-triangle');
    } else {
        toastIcon.setAttribute('data-lucide', 'info');
    }
    lucide.createIcons();

    toast.classList.remove('hidden');

    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

// Location Services
function updateLocationStatus(status, message) {
    locationStatus.className = `status-badge ${status}`;
    locationStatus.innerHTML = `
        <i data-lucide="${status === 'error' ? 'alert-triangle' : 'map-pin'}" class="status-icon"></i>
        ${message}
    `;
    lucide.createIcons();
}

function requestLocationPermission() {
    if (!("geolocation" in navigator)) {
        updateLocationStatus('error', 'Geolocation not supported');
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };

    updateLocationStatus('checking', 'Finding Location...');

    locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                acc: position.coords.accuracy
            };
            updateLocationStatus('ready', 'Location Ready');
        },
        (error) => {
            console.error("Geolocation error:", error);
            let msg = "Location Error";
            if (error.code === 1) msg = "Location Access Denied";
            if (error.code === 2) msg = "Location Unavailable";
            if (error.code === 3) msg = "Location Timeout";
            updateLocationStatus('error', msg);
            currentLocation = null;
        },
        options
    );
}

// Telegram Integration
async function sendTelegramSOS() {
    const token = localStorage.getItem('tg_bot_token');
    const chat = localStorage.getItem('tg_chat_id');
    const customMsg = localStorage.getItem('tg_custom_message') || 'Help! I need immediate assistance. This is my current location:';

    if (!token || !chat) {
        showToast('Please configure Telegram Bot Token and Chat ID first', 'error');
        showSettings();
        return;
    }

    // UI Feedback
    sosBtn.classList.add('loading');
    sosBtn.querySelector('.sos-text').textContent = '...';
    sosBtn.querySelector('.sos-subtext').textContent = 'Sending...';

    try {
        let messageToSend = `🚨 <b>EMERGENCY SOS</b> 🚨\n\n${customMsg}\n`;
        let locationValid = false;

        // Ensure we try to get an immediate location if watchPosition hasn't fired yet
        if (!currentLocation) {
            try {
                // Increase timeout to 10 seconds to give the device more time to acquire a GPS lock
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    });
                });
                currentLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    acc: pos.coords.accuracy
                };
            } catch (e) {
                console.warn("Could not fetch immediate position", e);
                // Try one more time with lower accuracy as a fallback
                try {
                    const fallbackPos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: false,
                            timeout: 5000
                        });
                    });
                    currentLocation = {
                        lat: fallbackPos.coords.latitude,
                        lng: fallbackPos.coords.longitude,
                        acc: fallbackPos.coords.accuracy
                    };
                } catch (fallbackError) {
                    console.error("Fallback location also failed", fallbackError);
                }
            }
        }

        if (currentLocation) {
            const mapsLink = `https://www.google.com/maps?q=${currentLocation.lat},${currentLocation.lng}`;
            messageToSend += `\n📍 <b>Location:</b> <a href="${mapsLink}">View on Google Maps</a>`;
            messageToSend += `\n🎯 <b>Accuracy:</b> ~${Math.round(currentLocation.acc)} meters`;
            locationValid = true;
        } else {
            messageToSend += `\n\n⚠️ <i>Location data currently unavailable. The application failed to fetch GPS coordinates.</i>`;
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chat,
                text: messageToSend,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });

        const data = await response.json();

        if (data.ok) {
            if (locationValid) {
                showToast('SOS Sent Successfully with Location!', 'success');
            } else {
                showToast('SOS Sent, but Location was NOT available!', 'warning');
            }
        } else {
            throw new Error(data.description || 'API Error');
        }

    } catch (error) {
        console.error('Telegram API Error:', error);
        showToast(`Failed to send SOS: ${error.message}`, 'error');
    } finally {
        // Reset Button UI
        setTimeout(() => {
            sosBtn.classList.remove('loading');
            sosBtn.querySelector('.sos-text').textContent = 'SOS';
            sosBtn.querySelector('.sos-subtext').textContent = 'Tap to send alert';
        }, 1500);
    }
}

// Event Listeners
settingsBtn.addEventListener('click', showSettings);
closeModalBtn.addEventListener('click', hideSettings);
settingsForm.addEventListener('submit', saveSettings);
sosBtn.addEventListener('click', sendTelegramSOS);

// Run on start
init();
