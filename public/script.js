// DOM Elements
const countDisplay = document.getElementById('count');
const incrementBtn = document.getElementById('incrementBtn');
const logContainer = document.getElementById('log');
const pig = document.getElementById('pig');
const flyingPig = document.getElementById('flyingPig');
const darkModeToggle = document.getElementById('darkModeToggle');
const logoutBtn = document.getElementById('logoutBtn');
const currentUserDisplay = document.getElementById('currentUser');

// State
let currentCount = 0;
let currentLog = [];
let isDarkMode = false;
let buttonEnabled = true;
let countdownInterval = null;
let notificationsEnabled = false;

// Initialize the app
async function init() {
    try {
        await loadCounterData();
        updateDisplay();
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

// Load counter data from server
async function loadCounterData() {
    try {
        const response = await fetch('/api/counter');
        const data = await response.json();
        currentCount = data.count;
        currentLog = data.log;
    } catch (error) {
        console.error('Failed to load counter data:', error);
        // Fallback to local storage if server is unavailable
        const localData = localStorage.getItem('snackCounter');
        if (localData) {
            const data = JSON.parse(localData);
            currentCount = data.count;
            currentLog = data.log;
        }
    }
}

// Check button state from server
async function checkButtonState() {
    try {
        const response = await fetch('/api/button-state');
        const data = await response.json();
        updateButtonState(data.isEnabled, data.remainingTime);
    } catch (error) {
        console.error('Failed to check button state:', error);
    }
}

// Update button state (enabled/disabled)
function updateButtonState(isEnabled, remainingTime) {
    buttonEnabled = isEnabled;

    if (isEnabled) {
        incrementBtn.disabled = false;
        incrementBtn.textContent = '+';
        incrementBtn.style.opacity = '1';
        incrementBtn.style.cursor = 'pointer';

        // Clear any countdown
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    } else {
        incrementBtn.disabled = true;
        incrementBtn.textContent = remainingTime > 0 ? `${remainingTime}s` : '+';
        incrementBtn.style.opacity = '0.5';
        incrementBtn.style.cursor = 'not-allowed';

        // Start countdown if not already running
        if (remainingTime > 0 && !countdownInterval) {
            startCountdown(remainingTime);
        }
    }
}

// Start countdown timer
function startCountdown(initialTime) {
    let timeLeft = initialTime;
    countdownInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            incrementBtn.textContent = `${timeLeft}s`;
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            checkButtonState(); // Check if button should be re-enabled
        }
    }, 1000);
}

// Save counter data to local storage (fallback)
function saveLocalData() {
    const data = {
        count: currentCount,
        log: currentLog
    };
    localStorage.setItem('snackCounter', JSON.stringify(data));
}

// Increment counter
async function incrementCounter() {
    if (!buttonEnabled) {
        return; // Button is disabled, don't attempt increment
    }

    try {
        const response = await fetch('/api/increment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentCount = data.count;
            currentLog = data.log;
            updateDisplay();
            animatePig();
            // Immediately check button state after successful increment
            setTimeout(checkButtonState, 100);
        } else if (response.status === 429) {
            // Rate limited - update button state with remaining time
            const errorData = await response.json();
            updateButtonState(false, errorData.remainingTime);
            console.log('Rate limited:', errorData.message);
        } else {
            throw new Error('Server responded with error');
        }
    } catch (error) {
        console.error('Failed to increment counter:', error);
        // Fallback: increment locally and save
        currentCount++;
        const timestamp = new Date().toLocaleString();
        const id = Date.now().toString();
        currentLog.unshift({
            id: id,
            timestamp: timestamp,
            count: currentCount
        });
        if (currentLog.length > 20) {
            currentLog = currentLog.slice(0, 20);
        }
        saveLocalData();
        updateDisplay();
        animatePig();
    }
}

// Update the display
function updateDisplay() {
    countDisplay.textContent = currentCount;

    // Update pig size based on current count
    updatePigSize();

    // Update log
    logContainer.innerHTML = '';
    if (currentLog.length === 0) {
        logContainer.innerHTML = '<div class="log-entry"><span class="log-text">Welcome to the Snack Counter!</span></div>';
    } else {
        currentLog.forEach(entry => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';

            const logText = document.createElement('span');
            logText.className = 'log-text';
            const username = entry.username || 'Anonymous';
            logText.textContent = `${entry.timestamp} - ${username} ate Snack #${entry.count}`;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = () => deleteLogEntry(entry.id);

            logEntry.appendChild(logText);
            logEntry.appendChild(deleteBtn);
            logContainer.appendChild(logEntry);
        });
    }
}

// Delete log entry
async function deleteLogEntry(logId) {
    try {
        const response = await fetch(`/api/log/${logId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const data = await response.json();
            currentCount = data.count;
            currentLog = data.log;
            updateDisplay();
        } else {
            throw new Error('Server responded with error');
        }
    } catch (error) {
        console.error('Failed to delete log entry:', error);
        // Fallback: remove locally and save
        currentLog = currentLog.filter(entry => entry.id !== logId);
        currentCount = currentLog.length;
        saveLocalData();
        updateDisplay();
    }
}

// Update pig size based on current count
function updatePigSize() {
    // Calculate width based on count (only horizontal scaling)
    // Pig gets wider with positive counts, narrower with zero/negative
    const scaleX = Math.max(0.5, 1 + (currentCount * 0.01)); // Min 50% width, max unlimited
    pig.style.transform = `scaleX(${scaleX})`;
}

// Animate the pig (just the bounce effect, size is handled separately)
function animatePig() {
    pig.classList.add('fat');

    // Remove animation class after animation completes
    setTimeout(() => {
        pig.classList.remove('fat');
    }, 500);
}

// Flying pig animation
function startFlyingPig() {
    let x = Math.random() * (window.innerWidth - 40);
    let y = Math.random() * (window.innerHeight - 30);
    let dx = (Math.random() - 0.5) * 4; // Random horizontal speed
    let dy = (Math.random() - 0.5) * 4; // Random vertical speed

    function animateFlyingPig() {
        x += dx;
        y += dy;

        // Bounce off walls
        if (x <= 0 || x >= window.innerWidth - 40) {
            dx = -dx;
            x = Math.max(0, Math.min(x, window.innerWidth - 40));
        }
        if (y <= 0 || y >= window.innerHeight - 30) {
            dy = -dy;
            y = Math.max(0, Math.min(y, window.innerHeight - 30));
        }

        flyingPig.style.left = x + 'px';
        flyingPig.style.top = y + 'px';

        // Randomly change direction occasionally
        if (Math.random() < 0.01) { // 1% chance each frame
            dx = (Math.random() - 0.5) * 4;
            dy = (Math.random() - 0.5) * 4;
        }

        requestAnimationFrame(animateFlyingPig);
    }

    animateFlyingPig();
}

// Event listeners
incrementBtn.addEventListener('click', incrementCounter);
darkModeToggle.addEventListener('click', toggleDarkMode);
logoutBtn.addEventListener('click', logout);

// Touch events for mobile
incrementBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    incrementBtn.style.transform = 'scale(0.95)';
});

incrementBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    incrementBtn.style.transform = 'scale(1)';
    incrementCounter();
});

// Dark mode toggle
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    darkModeToggle.textContent = isDarkMode ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDarkMode);
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to log out?')) {
        // Create a form to POST to logout endpoint
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/logout';
        document.body.appendChild(form);
        form.submit();
    }
}

// Initialize dark mode from localStorage
function initDarkMode() {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️';
    }
}

// Get username from cookies and display it
function initUserDisplay() {
    // Try to get username from document.cookie (client-side cookies)
    const cookies = document.cookie.split(';');
    let username = 'Guest';

    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'username') {
            username = decodeURIComponent(value);
            break;
        }
    }

    currentUserDisplay.textContent = username;
}

// Push notification functions
async function initPushNotifications() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            // Register service worker
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration);

            // Check if already subscribed
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                // Ask user for permission and subscribe
                await requestNotificationPermission(registration);
            } else {
                console.log('Already subscribed to push notifications');
                notificationsEnabled = true;
            }
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    } else {
        console.log('Push notifications not supported');
    }
}

async function requestNotificationPermission(registration) {
    try {
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            console.log('Notification permission granted');

            // Get VAPID public key from server
            const response = await fetch('/api/vapid-public-key');
            const { publicKey } = await response.json();

            // Subscribe to push notifications
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });

            // Send subscription to server
            await fetch('/api/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription)
            });

            notificationsEnabled = true;
            console.log('Successfully subscribed to push notifications');
        } else {
            console.log('Notification permission denied');
        }
    } catch (error) {
        console.error('Error requesting notification permission:', error);
    }
}

// Utility function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    init();
    initDarkMode();
    initUserDisplay(); // Display current user
    startFlyingPig();
    checkButtonState(); // Check initial button state
    initPushNotifications(); // Initialize push notifications
});

// Periodic refresh to sync with other users
setInterval(async () => {
    try {
        await loadCounterData();
        updateDisplay();
        await checkButtonState(); // Also check button state
    } catch (error) {
        // Silent fail for periodic updates
    }
}, 5000); // Refresh every 5 seconds
