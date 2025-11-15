const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'counter-data.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  const initialData = {
    count: 0,
    log: [],
    lastIncrementTime: 0
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Helper function to read data with integrity checks
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log('Data file does not exist, initializing...');
      return initializeData();
    }

    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);

    // Validate data structure
    if (!parsed || typeof parsed !== 'object') {
      console.error('Invalid data structure, reinitializing...');
      return initializeData();
    }

    // Ensure required fields exist
    if (typeof parsed.count !== 'number') parsed.count = 0;
    if (!Array.isArray(parsed.log)) parsed.log = [];
    if (typeof parsed.lastIncrementTime !== 'number') parsed.lastIncrementTime = 0;

    return parsed;
  } catch (error) {
    console.error('Error reading data file, attempting recovery:', error);

    // Try to restore from backup
    const backupData = tryRestoreFromBackup();
    if (backupData) {
      console.log('Restored from backup successfully');
      return backupData;
    }

    // If all else fails, initialize fresh
    console.log('Initializing fresh data...');
    return initializeData();
  }
}

// Initialize fresh data
function initializeData() {
  const initialData = {
    count: 0,
    log: [],
    lastIncrementTime: 0
  };
  writeData(initialData);
  return initialData;
}

// Try to restore from backup
function tryRestoreFromBackup() {
  const backupFile = DATA_FILE + '.backup';
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

// Atomic write with backup
function writeData(data) {
  const tempFile = DATA_FILE + '.tmp';
  const backupFile = DATA_FILE + '.backup';

  try {
    // Validate data before writing
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data structure');
    }

    // Create backup of current data if it exists
    if (fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(DATA_FILE, backupFile);
    }

    // Write to temporary file first (atomic operation)
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));

    // Atomic rename (this is atomic on POSIX systems)
    fs.renameSync(tempFile, DATA_FILE);

    console.log(`Data saved successfully: ${data.count} snacks, ${data.log.length} log entries`);
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
  const data = readData();
  res.json(data);
});

app.get('/api/button-state', (req, res) => {
  const data = readData();
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
  data.log.unshift({
    id: id,
    timestamp: timestamp,
    count: data.count
  });

  // Keep only last 20 entries in log
  if (data.log.length > 20) {
    data.log = data.log.slice(0, 20);
  }

  writeData(data);
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
