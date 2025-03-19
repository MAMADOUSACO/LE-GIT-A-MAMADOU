/**
 * Storage Manager
 * Centralized data storage system handling persistence, syncing, and data migrations.
 * Builds on storage-utils.js to provide higher-level storage management.
 */

import storageUtils from '../utils/storage-utils.js';

/**
 * Default settings for the extension
 */
const DEFAULT_SETTINGS = {
  // Feature settings
  features: {
    enabledFeatures: [], // IDs of enabled features
    disabledFeatures: [], // IDs of disabled features
    featureSettings: {} // Feature-specific settings
  },
  
  // UI settings
  ui: {
    theme: 'system', // light, dark, system
    fontSize: 'medium', // small, medium, large
    layoutDensity: 'comfortable', // compact, comfortable, spacious
    showCommandBar: true,
    quickAccessFeatures: [] // Feature IDs in quick access bar
  },
  
  // Privacy settings
  privacy: {
    telemetryEnabled: true,
    saveHistory: true,
    syncEnabled: true,
    syncFeatures: ['settings', 'notes'] // What to sync across devices
  },
  
  // API settings
  api: {
    // API keys are stored separately for security
    offlineMode: false,
    cacheResults: true,
    cacheDuration: 60 * 60 * 1000 // 1 hour in ms
  }
};

/**
 * Storage Manager
 */
class StorageManager {
  constructor() {
    this.initialized = false;
    this.settings = null;
    this.userData = null;
    this.syncInProgress = false;
    this.syncInterval = null;
    this.changeListeners = new Map();
    this.pendingWrites = new Map();
    this.writeDebounceTimers = new Map();
    
    // Settings that should be synced across devices
    this.syncedSettings = [
      'ui.theme',
      'ui.fontSize',
      'ui.layoutDensity',
      'ui.quickAccessFeatures',
      'features.enabledFeatures',
      'features.featureSettings'
    ];
    
    // Bind methods
    this.handleStorageChange = this.handleStorageChange.bind(this);
    this.syncSettings = this.syncSettings.bind(this);
  }
  
  /**
   * Initialize the storage manager
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      console.log('Initializing storage manager...');
      
      // Initialize storage utilities
      await storageUtils.init();
      
      // Load settings
      await this.loadSettings();
      
      // Load user data
      await this.loadUserData();
      
      // Set up storage change listener
      chrome.storage.onChanged.addListener(this.handleStorageChange);
      
      // Set up periodic sync if enabled
      if (this.settings.privacy.syncEnabled) {
        this.setupSync();
      }
      
      this.initialized = true;
      console.log('Storage manager initialized');
      
      // Notify that storage is ready
      document.dispatchEvent(new CustomEvent('storage:ready'));
    } catch (error) {
      console.error('Failed to initialize storage manager:', error);
      document.dispatchEvent(new CustomEvent('storage:error', { 
        detail: { error } 
      }));
      throw error;
    }
  }
  
  /**
   * Load settings from storage
   * @return {Promise<void>}
   */
  async loadSettings() {
    try {
      // Try to load from chrome.storage.local first
      const storedSettings = await storageUtils.chrome.get('settings');
      
      // If settings exist, use them, otherwise use defaults
      this.settings = storedSettings.settings || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      
      // Check if any default settings are missing and add them
      this.ensureDefaultSettings();
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Fall back to default settings
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }
  
  /**
   * Ensure all default settings exist in current settings
   */
  ensureDefaultSettings() {
    // Helper function to recursively set missing defaults
    const setMissingDefaults = (target, source) => {
      for (const key in source) {
        if (target[key] === undefined) {
          // Missing key entirely, copy from defaults
          target[key] = source[key];
        } else if (
          typeof source[key] === 'object' && 
          source[key] !== null &&
          !Array.isArray(source[key]) &&
          typeof target[key] === 'object' &&
          target[key] !== null &&
          !Array.isArray(target[key])
        ) {
          // Both are objects, recurse
          setMissingDefaults(target[key], source[key]);
        }
        // If key exists and is a value or array, keep user's version
      }
    };
    
    setMissingDefaults(this.settings, DEFAULT_SETTINGS);
  }
  
  /**
   * Load user data from storage
   * @return {Promise<void>}
   */
  async loadUserData() {
    try {
      // Load userdata from IndexedDB
      const data = await storageUtils.db.get('userData', 'userData');
      this.userData = data || { lastSync: 0, data: {} };
    } catch (error) {
      console.error('Failed to load user data:', error);
      this.userData = { lastSync: 0, data: {} };
    }
  }
  
  /**
   * Handle storage changes from other contexts
   * @param {Object} changes - Storage changes
   * @param {string} areaName - Storage area name
   */
  handleStorageChange(changes, areaName) {
    if (areaName === 'local' && changes.settings) {
      // Only update settings if the change didn't come from this instance
      const newSettings = changes.settings.newValue;
      
      if (JSON.stringify(this.settings) !== JSON.stringify(newSettings)) {
        console.log('Settings changed externally, updating...');
        this.settings = newSettings;
        
        // Notify listeners of the change
        this.notifyChangeListeners('settings', this.settings);
      }
    }
  }
  
  /**
   * Set up periodic sync
   */
  setupSync() {
    // Clear any existing sync interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    // Set up new sync interval (every 5 minutes)
    this.syncInterval = setInterval(this.syncSettings, 5 * 60 * 1000);
    
    // Do an initial sync
    this.syncSettings();
  }
  
  /**
   * Sync settings across devices
   * @return {Promise<void>}
   */
  async syncSettings() {
    if (!this.settings.privacy.syncEnabled || this.syncInProgress) {
      return;
    }
    
    this.syncInProgress = true;
    
    try {
      console.log('Syncing settings across devices...');
      
      // Create a settings object with only synced settings
      const syncedSettings = {};
      
      // Helper function to get nested property
      const getNestedProp = (obj, path) => {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
          if (current === undefined || current === null) {
            return undefined;
          }
          current = current[part];
        }
        
        return current;
      };
      
      // Helper function to set nested property
      const setNestedProp = (obj, path, value) => {
        const parts = path.split('.');
        let current = obj;
        
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (current[part] === undefined || current[part] === null) {
            current[part] = {};
          }
          current = current[part];
        }
        
        current[parts[parts.length - 1]] = value;
      };
      
      // Get settings to sync
      for (const path of this.syncedSettings) {
        const value = getNestedProp(this.settings, path);
        setNestedProp(syncedSettings, path, value);
      }
      
      // Save synced settings to chrome.storage.sync
      await storageUtils.chrome.set({ syncedSettings }, { sync: true });
      
      // Load synced settings from other devices
      const syncData = await storageUtils.chrome.get('syncedSettings', { sync: true });
      
      if (syncData && syncData.syncedSettings) {
        // Merge remote synced settings into local settings
        for (const path of this.syncedSettings) {
          const remoteValue = getNestedProp(syncData.syncedSettings, path);
          
          if (remoteValue !== undefined) {
            setNestedProp(this.settings, path, remoteValue);
          }
        }
        
        // Save merged settings back to local storage
        await this.saveSettings();
      }
      
      console.log('Settings sync complete');
    } catch (error) {
      console.error('Settings sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }
  
  /**
   * Save settings to storage
   * @return {Promise<void>}
   */
  async saveSettings() {
    try {
      await storageUtils.chrome.set({ settings: this.settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }
  
  /**
   * Save user data to storage
   * @return {Promise<void>}
   */
  async saveUserData() {
    try {
      // Update last modified timestamp
      this.userData.lastModified = Date.now();
      
      // Save to IndexedDB
      await storageUtils.db.put('userData', this.userData, 'userData');
    } catch (error) {
      console.error('Failed to save user data:', error);
      throw error;
    }
  }
  
  /**
   * Get setting value
   * @param {string} path - Setting path (e.g., 'ui.theme')
   * @param {any} [defaultValue] - Default value if setting not found
   * @return {any} Setting value
   */
  getSetting(path, defaultValue) {
    const parts = path.split('.');
    let current = this.settings;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue;
      }
      current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
  }
  
  /**
   * Set setting value
   * @param {string} path - Setting path (e.g., 'ui.theme')
   * @param {any} value - Setting value
   * @param {boolean} [saveImmediately=true] - Whether to save immediately
   * @return {Promise<void>}
   */
  async setSetting(path, value, saveImmediately = true) {
    const parts = path.split('.');
    let current = this.settings;
    
    // Navigate to the parent object
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null) {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Set the value
    const lastPart = parts[parts.length - 1];
    const oldValue = current[lastPart];
    current[lastPart] = value;
    
    // Save if value changed and saveImmediately is true
    if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
      if (saveImmediately) {
        await this.saveSettings();
      }
      
      // Notify listeners of the change
      this.notifyChangeListeners(path, value, oldValue);
      
      // If setting is synced and sync is enabled, sync settings
      if (this.settings.privacy.syncEnabled && this.syncedSettings.includes(path)) {
        this.debouncedSync();
      }
    }
  }
  
  /**
   * Debounced sync to prevent multiple syncs in short succession
   */
  debouncedSync() {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    
    this.syncDebounceTimer = setTimeout(() => {
      this.syncSettings();
    }, 2000); // Wait 2 seconds before syncing
  }
  
  /**
   * Get user data
   * @param {string} key - Data key
   * @param {any} [defaultValue] - Default value if data not found
   * @return {any} User data
   */
  getUserData(key, defaultValue) {
    return this.userData.data[key] !== undefined ? this.userData.data[key] : defaultValue;
  }
  
  /**
   * Set user data
   * @param {string} key - Data key
   * @param {any} value - Data value
   * @param {boolean} [saveImmediately=true] - Whether to save immediately
   * @return {Promise<void>}
   */
  async setUserData(key, value, saveImmediately = true) {
    // Check if value changed
    const oldValue = this.userData.data[key];
    if (JSON.stringify(oldValue) === JSON.stringify(value)) {
      return;
    }
    
    // Update value
    this.userData.data[key] = value;
    
    // If saving immediately
    if (saveImmediately) {
      await this.saveUserData();
    } else {
      // Otherwise, add to pending writes and debounce
      this.pendingWrites.set(key, value);
      this.debounceWrite(key);
    }
    
    // Notify listeners of the change
    this.notifyChangeListeners(`userData.${key}`, value, oldValue);
  }
  
  /**
   * Debounce write for a key
   * @param {string} key - Data key
   */
  debounceWrite(key) {
    if (this.writeDebounceTimers.has(key)) {
      clearTimeout(this.writeDebounceTimers.get(key));
    }
    
    this.writeDebounceTimers.set(key, setTimeout(async () => {
      if (this.pendingWrites.has(key)) {
        this.writeDebounceTimers.delete(key);
        try {
          await this.saveUserData();
          this.pendingWrites.delete(key);
        } catch (error) {
          console.error(`Failed to save user data for ${key}:`, error);
        }
      }
    }, 1000)); // Write after 1 second of inactivity
  }
  
  /**
   * Flush all pending writes
   * @return {Promise<void>}
   */
  async flushWrites() {
    if (this.pendingWrites.size > 0) {
      // Clear all debounce timers
      for (const timer of this.writeDebounceTimers.values()) {
        clearTimeout(timer);
      }
      this.writeDebounceTimers.clear();
      
      // Save all pending writes
      await this.saveUserData();
      this.pendingWrites.clear();
    }
  }
  
  /**
   * Add change listener
   * @param {string} path - Setting or data path to listen for changes
   * @param {Function} callback - Callback function
   * @return {Function} Function to remove listener
   */
  addChangeListener(path, callback) {
    if (!this.changeListeners.has(path)) {
      this.changeListeners.set(path, new Set());
    }
    
    this.changeListeners.get(path).add(callback);
    
    // Return function to remove listener
    return () => {
      if (this.changeListeners.has(path)) {
        this.changeListeners.get(path).delete(callback);
        
        if (this.changeListeners.get(path).size === 0) {
          this.changeListeners.delete(path);
        }
      }
    };
  }
  
  /**
   * Notify change listeners
   * @param {string} path - Changed path
   * @param {any} newValue - New value
   * @param {any} oldValue - Old value
   */
  notifyChangeListeners(path, newValue, oldValue) {
    // Notify exact path listeners
    if (this.changeListeners.has(path)) {
      for (const callback of this.changeListeners.get(path)) {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          console.error(`Error in change listener for ${path}:`, error);
        }
      }
    }
    
    // Notify parent path listeners
    const parts = path.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      
      if (this.changeListeners.has(parentPath)) {
        for (const callback of this.changeListeners.get(parentPath)) {
          try {
            callback(newValue, oldValue, path);
          } catch (error) {
            console.error(`Error in change listener for ${parentPath}:`, error);
          }
        }
      }
    }
    
    // Notify wildcard listeners
    if (this.changeListeners.has('*')) {
      for (const callback of this.changeListeners.get('*')) {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          console.error('Error in wildcard change listener:', error);
        }
      }
    }
  }
  
  /**
   * Create backup of all storage data
   * @return {Promise<Object>} Backup object
   */
  async createBackup() {
    try {
      // Gather data from different storage sources
      const settings = this.settings;
      const userData = this.userData;
      
      // Get feature data
      const features = await storageUtils.db.getAll('features');
      
      // Get notes
      const notes = await storageUtils.db.getAll('notes');
      
      // Create backup object
      const backup = {
        version: 1,
        timestamp: Date.now(),
        settings,
        userData,
        features,
        notes
      };
      
      return backup;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw error;
    }
  }
  
  /**
   * Restore from backup
   * @param {Object} backup - Backup object
   * @param {Object} [options] - Restore options
   * @param {boolean} [options.settings=true] - Restore settings
   * @param {boolean} [options.userData=true] - Restore user data
   * @param {boolean} [options.features=true] - Restore feature data
   * @param {boolean} [options.notes=true] - Restore notes
   * @return {Promise<void>}
   */
  async restoreFromBackup(backup, options = {}) {
    const {
      settings = true,
      userData = true,
      features = true,
      notes = true
    } = options;
    
    try {
      // Validate backup
      if (!backup || !backup.version) {
        throw new Error('Invalid backup format');
      }
      
      // Restore settings
      if (settings && backup.settings) {
        this.settings = backup.settings;
        await this.saveSettings();
      }
      
      // Restore user data
      if (userData && backup.userData) {
        this.userData = backup.userData;
        await this.saveUserData();
      }
      
      // Restore features
      if (features && backup.features) {
        await storageUtils.db.clear('features');
        if (backup.features.length > 0) {
          await storageUtils.db.putMany('features', backup.features);
        }
      }
      
      // Restore notes
      if (notes && backup.notes) {
        await storageUtils.db.clear('notes');
        if (backup.notes.length > 0) {
          await storageUtils.db.putMany('notes', backup.notes);
        }
      }
      
      console.log('Backup restored successfully');
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw error;
    }
  }
  
  /**
   * Handle storage quota exceeded
   * @param {string} storageType - Type of storage ('local', 'sync', 'indexedDB')
   * @return {Promise<boolean>} Whether space was freed
   */
  async handleQuotaExceeded(storageType) {
    console.warn(`Storage quota exceeded for ${storageType}`);
    
    try {
      // Try to clear expired cache items first
      const clearedItems = await storageUtils.cache.clearExpired();
      
      if (clearedItems > 0) {
        console.log(`Freed space by clearing ${clearedItems} expired cache items`);
        return true;
      }
      
      // If no cache was cleared or it wasn't enough, try other strategies
      if (storageType === 'sync') {
        // For sync storage, reduce what's being synced
        const syncFeatures = this.settings.privacy.syncFeatures;
        
        if (syncFeatures.includes('notes')) {
          // Stop syncing notes first
          syncFeatures.splice(syncFeatures.indexOf('notes'), 1);
          await this.saveSettings();
          console.log('Reduced sync storage usage by excluding notes');
          return true;
        }
      } else if (storageType === 'indexedDB') {
        // For IndexedDB, try to clean up old data
        
        // Clear old cache data
        await storageUtils.db.clear('cache');
        console.log('Cleared all cache data to free space');
        
        // If needed, could also trim note history, etc.
        return true;
      }
      
      // If we get here, we couldn't free enough space automatically
      return false;
    } catch (error) {
      console.error('Error handling quota exceeded:', error);
      return false;
    }
  }
  
  /**
   * Clear all storage data
   * @param {boolean} [clearSettings=false] - Whether to clear settings
   * @return {Promise<void>}
   */
  async clearAllData(clearSettings = false) {
    try {
      // Clear IndexedDB tables
      await storageUtils.db.clear('cache');
      await storageUtils.db.clear('notes');
      await storageUtils.db.clear('features');
      
      // Clear user data
      this.userData = { lastSync: 0, data: {} };
      await this.saveUserData();
      
      // Clear settings if specified
      if (clearSettings) {
        this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        await this.saveSettings();
      }
      
      console.log('All data cleared successfully');
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }
  
  /**
   * Handle service worker restart
   * @return {Promise<void>}
   */
  async handleRestart() {
    console.log('Handling storage manager restart');
    
    // Flush any pending writes
    await this.flushWrites();
    
    // Reinitialize without resetting state
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Create singleton instance
const storageManager = new StorageManager();

// Handle storage manager initialization event
document.addEventListener('storage:initialize', async () => {
  await storageManager.initialize();
});

// Handle service worker restart
document.addEventListener('background:restore', async () => {
  await storageManager.handleRestart();
});

// Export the singleton
export default storageManager;