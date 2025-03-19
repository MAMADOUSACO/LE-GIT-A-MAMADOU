/**
 * All-in-One Browser Helper
 * Background Service Worker
 * 
 * Main entry point for the extension's background processes.
 * Handles lifecycle events and coordinates between components.
 */

// Import background modules - these will be implemented separately
import './storage-manager.js';
import './feature-manager.js';
import './api-manager.js';
import './command-processor.js';

// State tracking for service worker
let isInitialized = false;
let initializationPromise = null;
let restartCount = 0;

/**
 * Initialize background components in the correct sequence
 * @return {Promise<void>} Promise resolving when initialization is complete
 */
async function initialize() {
  // Prevent multiple concurrent initializations
  if (isInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  try {
    console.log('Starting background initialization...');
    const startTime = performance.now();

    // Track initialization
    initializationPromise = performInitialization();
    await initializationPromise;
    
    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`Background initialization complete (${duration}ms)`);
    
    isInitialized = true;
    initializationPromise = null;
    
    // Report success to any listeners
    chrome.runtime.sendMessage({ type: 'background:initialized' })
      .catch(() => {
        // Ignore errors if no listeners
      });
  }
  catch (error) {
    initializationPromise = null;
    console.error('Background initialization failed:', error);
    
    // Report error to any listeners
    chrome.runtime.sendMessage({ 
      type: 'background:error', 
      error: { message: error.message, stack: error.stack }
    }).catch(() => {
      // Ignore errors if no listeners
    });
    
    throw error;
  }
}

/**
 * Perform the actual initialization sequence
 * @private
 * @return {Promise<void>} Promise resolving when initialization is complete
 */
async function performInitialization() {
  // 1. Initialize storage first - other components depend on it
  await initializeStorage();
  
  // 2. Initialize API manager for external services
  await initializeApiManager();
  
  // 3. Initialize feature manager
  await initializeFeatureManager();
  
  // 4. Initialize command processor last as it depends on features
  await initializeCommandProcessor();
  
  // 5. Restore state if this is a restart
  if (restartCount > 0) {
    await restoreState();
  }
}

/**
 * Initialize storage manager
 * @private
 * @return {Promise<void>} Promise resolving when storage is initialized
 */
async function initializeStorage() {
  try {
    // This will be implemented in storage-manager.js
    // For now, dispatch event for the module to handle
    const event = new CustomEvent('storage:initialize');
    document.dispatchEvent(event);
    
    // Wait for confirmation that storage is ready
    return new Promise((resolve) => {
      const handleReady = () => {
        document.removeEventListener('storage:ready', handleReady);
        resolve();
      };
      
      document.addEventListener('storage:ready', handleReady);
      
      // Safety timeout in case the event never fires
      setTimeout(() => {
        document.removeEventListener('storage:ready', handleReady);
        console.warn('Storage initialization timed out');
        resolve();
      }, 5000);
    });
  }
  catch (error) {
    console.error('Storage initialization failed:', error);
    // Continue without storage - some features may not work
  }
}

/**
 * Initialize API manager
 * @private
 * @return {Promise<void>} Promise resolving when API manager is initialized
 */
async function initializeApiManager() {
  try {
    // This will be implemented in api-manager.js
    // For now, dispatch event for the module to handle
    const event = new CustomEvent('api:initialize');
    document.dispatchEvent(event);
    
    // Wait for confirmation that APIs are ready
    return new Promise((resolve) => {
      const handleReady = () => {
        document.removeEventListener('api:ready', handleReady);
        resolve();
      };
      
      document.addEventListener('api:ready', handleReady);
      
      // Safety timeout in case the event never fires
      setTimeout(() => {
        document.removeEventListener('api:ready', handleReady);
        console.warn('API initialization timed out');
        resolve();
      }, 5000);
    });
  }
  catch (error) {
    console.error('API initialization failed:', error);
    // Continue without API manager - external services may not work
  }
}

/**
 * Initialize feature manager
 * @private
 * @return {Promise<void>} Promise resolving when feature manager is initialized
 */
async function initializeFeatureManager() {
  try {
    // This will be implemented in feature-manager.js
    // For now, dispatch event for the module to handle
    const event = new CustomEvent('features:initialize');
    document.dispatchEvent(event);
    
    // Wait for confirmation that features are ready
    return new Promise((resolve) => {
      const handleReady = () => {
        document.removeEventListener('features:ready', handleReady);
        resolve();
      };
      
      document.addEventListener('features:ready', handleReady);
      
      // Safety timeout in case the event never fires
      setTimeout(() => {
        document.removeEventListener('features:ready', handleReady);
        console.warn('Feature initialization timed out');
        resolve();
      }, 5000);
    });
  }
  catch (error) {
    console.error('Feature initialization failed:', error);
    // Continue without features - core functionality may still work
  }
}

/**
 * Initialize command processor
 * @private
 * @return {Promise<void>} Promise resolving when command processor is initialized
 */
async function initializeCommandProcessor() {
  try {
    // This will be implemented in command-processor.js
    // For now, dispatch event for the module to handle
    const event = new CustomEvent('commands:initialize');
    document.dispatchEvent(event);
    
    // Wait for confirmation that command processor is ready
    return new Promise((resolve) => {
      const handleReady = () => {
        document.removeEventListener('commands:ready', handleReady);
        resolve();
      };
      
      document.addEventListener('commands:ready', handleReady);
      
      // Safety timeout in case the event never fires
      setTimeout(() => {
        document.removeEventListener('commands:ready', handleReady);
        console.warn('Command processor initialization timed out');
        resolve();
      }, 5000);
    });
  }
  catch (error) {
    console.error('Command processor initialization failed:', error);
    // Continue without command processor - command palette may not work
  }
}

/**
 * Restore state after service worker restart
 * @private
 * @return {Promise<void>} Promise resolving when state is restored
 */
async function restoreState() {
  console.log(`Restoring state after restart (count: ${restartCount})`);
  
  try {
    // Notify components to restore their state
    document.dispatchEvent(new CustomEvent('background:restore'));
    
    // Restore any active features
    document.dispatchEvent(new CustomEvent('features:restore'));
    
    // Reconnect to any active content scripts
    await reconnectContentScripts();
  }
  catch (error) {
    console.error('Failed to restore state:', error);
  }
}

/**
 * Reconnect to any active content scripts after restart
 * @private
 * @return {Promise<void>} Promise resolving when reconnection is complete
 */
async function reconnectContentScripts() {
  try {
    const tabs = await chrome.tabs.query({});
    
    // Notify each active tab that background has restarted
    for (const tab of tabs) {
      if (tab.url && tab.url.startsWith('http')) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'background:reconnect' });
          console.log(`Reconnected to tab ${tab.id}`);
        }
        catch (error) {
          // Ignore errors - tab may not have content script
        }
      }
    }
  }
  catch (error) {
    console.error('Error reconnecting to content scripts:', error);
  }
}

/**
 * Handle extension installation
 * @param {Object} details - Installation details
 * @private
 */
function handleInstall(details) {
  console.log('Extension installed:', details);
  
  if (details.reason === 'install') {
    // First installation
    chrome.tabs.create({
      url: 'onboarding.html'
    });
  }
  else if (details.reason === 'update') {
    // Extension was updated
    const manifest = chrome.runtime.getManifest();
    console.log(`Updated to version ${manifest.version}`);
    
    // Notify user about update if significant
    chrome.storage.local.get('lastVersion', (data) => {
      const lastVersion = data.lastVersion || '0.0.0';
      const currentVersion = manifest.version;
      
      if (isSignificantUpdate(lastVersion, currentVersion)) {
        // Show update notification
        chrome.notifications.create('update-notification', {
          type: 'basic',
          iconUrl: 'assets/icons/extension/icon128.png',
          title: 'All-in-One Browser Helper Updated',
          message: `Updated to version ${currentVersion} with new features and improvements.`,
          buttons: [
            { title: 'See What\'s New' }
          ]
        });
      }
      
      // Store current version
      chrome.storage.local.set({ lastVersion: currentVersion });
    });
  }
  
  // Initialize extension after installation
  initialize();
}

/**
 * Check if update is significant (e.g., major or minor version change)
 * @param {string} oldVersion - Previous version string
 * @param {string} newVersion - New version string
 * @return {boolean} Whether update is significant
 * @private
 */
function isSignificantUpdate(oldVersion, newVersion) {
  const oldParts = oldVersion.split('.').map(Number);
  const newParts = newVersion.split('.').map(Number);
  
  // Major or minor version change is significant
  return (
    newParts[0] > oldParts[0] || // Major version change
    (newParts[0] === oldParts[0] && newParts[1] > oldParts[1]) // Minor version change
  );
}

/**
 * Handle extension startup
 * @private
 */
function handleStartup() {
  console.log('Extension starting up');
  
  // Track restarts for state restoration
  chrome.storage.local.get('restartCount', (data) => {
    restartCount = (data.restartCount || 0) + 1;
    chrome.storage.local.set({ restartCount });
  });
  
  // Initialize extension
  initialize();
}

/**
 * Global error handler for uncaught exceptions
 * @param {Error} error - Uncaught error
 * @private
 */
function handleUncaughtError(error) {
  console.error('Uncaught error in background script:', error);
  
  // Log to persistent storage for diagnostics
  chrome.storage.local.get('errorLog', (data) => {
    const errorLog = data.errorLog || [];
    
    errorLog.push({
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      restartCount
    });
    
    // Limit log size
    while (errorLog.length > 50) {
      errorLog.shift();
    }
    
    chrome.storage.local.set({ errorLog });
  });
}

/**
 * Handle messages from content scripts and popup
 * @param {Object} message - Message data
 * @param {Object} sender - Sender information
 * @param {Function} sendResponse - Function to send response
 * @return {boolean} Whether response will be sent asynchronously
 * @private
 */
function handleMessage(message, sender, sendResponse) {
  // Check if message is for background script
  if (message.target !== 'background') {
    return false;
  }
  
  console.log('Background received message:', message.type);
  
  // Handle different message types
  switch (message.type) {
    case 'isInitialized':
      sendResponse({ initialized: isInitialized });
      return false;
      
    case 'initialize':
      initialize()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ 
          success: false, 
          error: error.message 
        }));
      return true;
      
    case 'getState':
      sendResponse({
        initialized: isInitialized,
        restartCount
      });
      return false;
  }
  
  // Message not handled here, may be handled by specific managers
  return false;
}

/**
 * Handle keyboard command shortcuts
 * @param {string} command - Command identifier
 * @private
 */
function handleCommand(command) {
  console.log('Command received:', command);
  
  if (command === 'open-command-palette') {
    // Broadcast to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'command:show-palette' 
        }).catch(() => {
          // Ignore errors if content script not ready
        });
      }
    });
  }
}

// Set up service worker event listeners

// Installation and updates
chrome.runtime.onInstalled.addListener(handleInstall);

// Startup
chrome.runtime.onStartup.addListener(handleStartup);

// Message handling
chrome.runtime.onMessage.addListener(handleMessage);

// Command shortcuts
chrome.commands.onCommand.addListener(handleCommand);

// Global error handler
self.addEventListener('error', (event) => {
  handleUncaughtError(event.error || new Error('Unknown error'));
});

self.addEventListener('unhandledrejection', (event) => {
  handleUncaughtError(event.reason || new Error('Unhandled promise rejection'));
});

// Service worker activation - initialize on activation too
// This covers cases when service worker restarts
self.addEventListener('activate', () => {
  console.log('Service worker activated');
  handleStartup();
});

// Initial startup
console.log('Background service worker loading...');