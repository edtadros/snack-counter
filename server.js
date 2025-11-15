const express = require('express');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;

// Multi-room access control (each access code creates its own counter)
function getDataFile(accessCode) {
  // Sanitize access code for filename
  const sanitizedCode = accessCode.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(__dirname, `counter-data-${sanitizedCode}.json`);
}

// Web Push Configuration
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BDefault_Public_Key_For_Development',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'Default_Private_Key_For_Development'
};

// Set VAPID details
webpush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple cookie parser (basic implementation)
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value !== undefined) {
        req.cookies[name.trim()] = decodeURIComponent(value.trim());
      }
    });
  }
  next();
});

// Access control middleware
app.use((req, res, next) => {
  // Allow API calls and static assets
  if (req.path.startsWith('/api/') ||
      req.path.includes('.css') ||
      req.path.includes('.js') ||
      req.path === '/login' ||
      req.method === 'POST' && req.path === '/') {
    return next();
  }

  // Check for access code in URL parameter or cookie
  let accessCode = req.query.access || (req.cookies && req.cookies.accessCode);

  if (accessCode) {
    // Validate access code (alphanumeric, underscore, dash only)
    if (/^[a-zA-Z0-9_-]+$/.test(accessCode)) {
      // Set access code cookie for future requests
      res.cookie('accessCode', accessCode, {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
      });
      // Store access code and username on request for use in routes
      req.accessCode = accessCode;
      req.username = req.cookies && req.cookies.username ? req.cookies.username : 'Anonymous';
      console.log('Middleware: accessCode:', accessCode, 'username:', req.username, 'all cookies:', req.cookies);
      return next();
    }
  }

  // If accessing root, show login page
  if (req.path === '/') {
    return res.redirect('/login');
  }

  // For other routes, redirect to login
  res.redirect('/login');
});

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle login form submission
app.post('/login', (req, res) => {
  const { password: accessCode, username } = req.body;

  // Validate access code format
  if (!accessCode || !/^[a-zA-Z0-9_-]+$/.test(accessCode)) {
    const loginPage = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf8')
      .replace('<div class="error" id="error-message" style="display: none;">Invalid access code. Please try again.</div>',
               '<div class="error" id="error-message">Invalid access code format. Use only letters, numbers, underscores, and dashes.</div>');
    return res.send(loginPage);
  }

  // Validate username
  if (!username || username.trim().length === 0) {
    const loginPage = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf8')
      .replace('<div class="error" id="error-message" style="display: none;">Invalid access code. Please try again.</div>',
               '<div class="error" id="error-message">Please enter your name.</div>');
    return res.send(loginPage);
  }

  // Sanitize username (remove potentially harmful characters)
  const cleanUsername = username.trim().substring(0, 50).replace(/[<>\"'&]/g, '');

  // Set cookies and redirect
  res.cookie('accessCode', accessCode, {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  });

  res.cookie('username', cleanUsername, {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: false, // Allow JavaScript to read this for display
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  });

  res.redirect(`/?access=${accessCode}`);
});

// Logout route
app.post('/logout', (req, res) => {
  res.clearCookie('accessCode');
  res.clearCookie('username');
  res.redirect('/login');
});

app.use(express.static('public'));

// Data files are now created on-demand when access codes are first used

// Helper function to read data with integrity checks
function readData(accessCode) {
  const dataFile = getDataFile(accessCode);

  try {
    if (!fs.existsSync(dataFile)) {
      console.log(`Data file for ${accessCode} does not exist, initializing...`);
      return initializeData(accessCode);
    }

    const data = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(data);

    // Validate data structure
    if (!parsed || typeof parsed !== 'object') {
      console.error('Invalid data structure, reinitializing...');
      return initializeData(accessCode);
    }

    // Ensure required fields exist
    if (typeof parsed.count !== 'number') parsed.count = 0;
    if (!Array.isArray(parsed.log)) parsed.log = [];
    if (typeof parsed.lastIncrementTime !== 'number') parsed.lastIncrementTime = 0;
    if (!Array.isArray(parsed.pushSubscriptions)) parsed.pushSubscriptions = [];
    if (typeof parsed.accessCode !== 'string') parsed.accessCode = accessCode;

    return parsed;
  } catch (error) {
    console.error('Error reading data file, attempting recovery:', error);

    // Try to restore from backup
    const backupData = tryRestoreFromBackup(accessCode);
    if (backupData) {
      console.log('Restored from backup successfully');
      return backupData;
    }

    // If all else fails, initialize fresh
    console.log('Initializing fresh data...');
    return initializeData(accessCode);
  }
}

// Initialize fresh data for a specific access code
function initializeData(accessCode) {
  const initialData = {
    accessCode: accessCode,
    count: 0,
    log: [],
    lastIncrementTime: 0,
    pushSubscriptions: []
  };
  writeData(accessCode, initialData);
  return initialData;
}

// Try to restore from backup for a specific access code
function tryRestoreFromBackup(accessCode) {
  const dataFile = getDataFile(accessCode);
  const backupFile = dataFile + '.backup';
  try {
    if (fs.existsSync(backupFile)) {
      const backupData = fs.readFileSync(backupFile, 'utf8');
      return JSON.parse(backupData);
    }
  } catch (error) {
    console.error('Failed to restore from backup:', error);
  }
  return null;
}

// Atomic write with backup for a specific access code
function writeData(accessCode, data) {
  const dataFile = getDataFile(accessCode);
  const tempFile = dataFile + '.tmp';
  const backupFile = dataFile + '.backup';

  try {
    // Validate data before writing
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data structure');
    }

    // Create backup of current data if it exists
    if (fs.existsSync(dataFile)) {
      fs.copyFileSync(dataFile, backupFile);
    }

    // Write to temporary file first (atomic operation)
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));

    // Atomic rename (this is atomic on POSIX systems)
    fs.renameSync(tempFile, dataFile);

    console.log(`Data saved for ${accessCode}: ${data.count} snacks, ${data.log.length} log entries`);
  } catch (error) {
    console.error('Error writing data file:', error);

    // Clean up temp file if it exists
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupError) {
        console.error('Failed to clean up temp file:', cleanupError);
      }
    }

    throw error; // Re-throw so calling code knows write failed
  }
}

// API Routes
app.get('/api/counter', (req, res) => {
  const data = readData(req.accessCode);
  res.json(data);
});

app.get('/api/button-state', (req, res) => {
  const data = readData(req.accessCode);
  const now = Date.now();
  const timeSinceLastIncrement = now - data.lastIncrementTime;
  const RATE_LIMIT_MS = 20000; // 20 seconds

  const isEnabled = timeSinceLastIncrement >= RATE_LIMIT_MS;
  const remainingTime = isEnabled ? 0 : Math.ceil((RATE_LIMIT_MS - timeSinceLastIncrement) / 1000);

  res.json({
    isEnabled: isEnabled,
    remainingTime: remainingTime,
    lastIncrementTime: data.lastIncrementTime
  });
});

// User info endpoint
app.get('/api/user-info', (req, res) => {
  const username = req.username || 'Guest';
  res.json({ username: username });
});

// Push notification routes
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  const data = readData(req.accessCode);

  // Remove any existing subscription with the same endpoint
  data.pushSubscriptions = data.pushSubscriptions.filter(sub =>
    sub.endpoint !== subscription.endpoint
  );

  // Add the new subscription
  data.pushSubscriptions.push(subscription);

  // Keep only the last 50 subscriptions to prevent file bloat
  if (data.pushSubscriptions.length > 50) {
    data.pushSubscriptions = data.pushSubscriptions.slice(-50);
  }

  writeData(data);
  res.status(201).json({ message: 'Subscription added successfully' });
});

// Function to send push notifications
async function sendPushNotifications(accessCode, message, title = 'Snack Counter') {
  const data = readData(accessCode);
  const payload = JSON.stringify({
    title: title,
    body: message,
    icon: '/icon.png',
    badge: '/badge.png'
  });

  const promises = data.pushSubscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (error) {
      console.error('Error sending push notification:', error);
      // If subscription is invalid, remove it
      if (error.statusCode === 410 || error.statusCode === 400) {
        removeInvalidSubscription(accessCode, subscription.endpoint);
      }
    }
  });

  await Promise.all(promises);
}

// Remove invalid subscriptions
function removeInvalidSubscription(accessCode, endpoint) {
  const data = readData(accessCode);
  data.pushSubscriptions = data.pushSubscriptions.filter(sub =>
    sub.endpoint !== endpoint
  );
  writeData(accessCode, data);
}

// Data export endpoint for backups
app.get('/api/export-data', (req, res) => {
  try {
    const data = readData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="snack-counter-data.json"');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Data import endpoint for restores
app.post('/api/import-data', (req, res) => {
  try {
    const importedData = req.body;

    // Validate imported data structure
    if (!importedData || typeof importedData !== 'object') {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // Ensure required fields
    if (typeof importedData.count !== 'number') importedData.count = 0;
    if (!Array.isArray(importedData.log)) importedData.log = [];
    if (typeof importedData.lastIncrementTime !== 'number') importedData.lastIncrementTime = 0;

    // Save the imported data
    writeData(importedData);

    res.json({
      success: true,
      message: `Imported ${importedData.count} snacks and ${importedData.log.length} log entries`
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

app.post('/api/increment', (req, res) => {
  const data = readData();
  const now = Date.now();
  const timeSinceLastIncrement = now - data.lastIncrementTime;
  const RATE_LIMIT_MS = 20000; // 20 seconds

  // Check if enough time has passed since last increment
  if (timeSinceLastIncrement < RATE_LIMIT_MS) {
    const remainingTime = Math.ceil((RATE_LIMIT_MS - timeSinceLastIncrement) / 1000);
    return res.status(429).json({
      error: 'Rate limited',
      remainingTime: remainingTime,
      message: `Please wait ${remainingTime} seconds before the next snack!`
    });
  }

  // Allow increment
  data.count += 1;
  data.lastIncrementTime = now;

  const timestamp = new Date().toLocaleString();
  const id = Date.now().toString();
  const username = req.username || 'Anonymous';
  console.log('Increment by user:', username, 'Cookies:', req.cookies);

  data.log.unshift({
    id: id,
    timestamp: timestamp,
    count: data.count,
    username: username
  });

  // Keep only last 20 entries in log
  if (data.log.length > 20) {
    data.log = data.log.slice(0, 20);
  }

  writeData(data);

  // Send push notifications asynchronously (don't wait for it)
  sendPushNotifications(req.accessCode, `Snack #${data.count} has been eaten! 🐷`, 'Snack Counter')
    .catch(error => console.error('Failed to send push notifications:', error));

  res.json(data);
});

app.delete('/api/log/:id', (req, res) => {
  const data = readData();
  const logId = req.params.id;

  // Find the log entry to delete
  const logIndex = data.log.findIndex(entry => entry.id === logId);
  if (logIndex !== -1) {
    // Remove the log entry
    data.log.splice(logIndex, 1);

    // Recalculate count based on remaining log entries
    data.count = data.log.length;

    // Recalculate lastIncrementTime based on the most recent remaining log entry
    if (data.log.length > 0) {
      // Sort log entries by ID (timestamp) to find the most recent
      const sortedLog = [...data.log].sort((a, b) => parseInt(b.id) - parseInt(a.id));
      data.lastIncrementTime = parseInt(sortedLog[0].id);
    } else {
      // No log entries left, reset lastIncrementTime
      data.lastIncrementTime = 0;
    }

    writeData(data);
    res.json(data);
  } else {
    res.status(404).json({ error: 'Log entry not found' });
  }
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  console.log('Data persistence: All snack data is automatically saved to counter-data.json');
  console.log('Backup available: counter-data.json.backup');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  console.log('Data persistence: All snack data is automatically saved to counter-data.json');
  console.log('Backup available: counter-data.json.backup');
  process.exit(0);
});

// Start server on all interfaces (0.0.0.0) for local network access
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Snack Counter running at:`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://YOUR_LOCAL_IP:${PORT}`);
  console.log(`\nData persistence:`);
  console.log(`- Primary: counter-data.json`);
  console.log(`- Backup: counter-data.json.backup`);
  console.log(`- Data survives server restarts and software updates`);
  console.log(`\nTo find your local IP address, run: ifconfig | grep inet`);
});
