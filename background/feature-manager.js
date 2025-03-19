/**
 * Feature Manager
 * Manages feature activation, deactivation, and permissions.
 * Handles feature dependencies, conflict resolution, and state tracking.
 */

import storageManager from './storage-manager.js';

/**
 * Feature registry - will be populated with all available features
 * @type {Map<string, FeatureDefinition>}
 */
const featureRegistry = new Map();

/**
 * Currently active features
 * @type {Map<string, FeatureInstance>}
 */
const activeFeatures = new Map();

/**
 * Features pending activation (waiting for permissions)
 * @type {Map<string, {resolve: Function, reject: Function}>}
 */
const pendingActivations = new Map();

/**
 * Feature category definitions
 */
const CATEGORIES = {
  TEXT_TOOLS: 'text-tools',
  CONTENT_ANALYSIS: 'content-analysis',
  VISUAL_TOOLS: 'visual-tools',
  PRODUCTIVITY: 'productivity',
  NAVIGATION: 'navigation',
  UTILITIES: 'utilities'
};

/**
 * Feature definition interface
 * @typedef {Object} FeatureDefinition
 * @property {string} id - Unique feature identifier
 * @property {string} name - Display name
 * @property {string} description - Feature description
 * @property {string} category - Feature category
 * @property {string[]} [permissions] - Required permissions
 * @property {string[]} [optionalPermissions] - Optional permissions
 * @property {string[]} [hostPermissions] - Required host permissions
 * @property {string[]} [dependencies] - Required feature dependencies
 * @property {string[]} [conflicts] - Features that conflict with this one
 * @property {Function} [onActivate] - Function called when feature is activated
 * @property {Function} [onDeactivate] - Function called when feature is deactivated
 * @property {boolean} [defaultEnabled] - Whether feature is enabled by default
 * @property {Object} [defaultSettings] - Default feature settings
 */

/**
 * Feature instance interface
 * @typedef {Object} FeatureInstance
 * @property {string} id - Feature identifier
 * @property {FeatureDefinition} definition - Feature definition
 * @property {boolean} active - Whether feature is active
 * @property {Object} settings - Feature-specific settings
 * @property {Function} deactivate - Function to deactivate the feature
 */

/**
 * Feature Manager class
 */
class FeatureManager {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
    this.activationQueue = [];
    this.restoreInProgress = false;
    
    // Bind methods
    this.handlePermissionChange = this.handlePermissionChange.bind(this);
  }
  
  /**
   * Initialize the feature manager
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    // Prevent multiple concurrent initializations
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this._performInitialization();
    
    try {
      await this.initPromise;
      this.initialized = true;
      this.initPromise = null;
      
      console.log('Feature manager initialized');
      
      // Notify that features are ready
      document.dispatchEvent(new CustomEvent('features:ready'));
    } catch (error) {
      this.initPromise = null;
      console.error('Failed to initialize feature manager:', error);
      document.dispatchEvent(new CustomEvent('features:error', { 
        detail: { error } 
      }));
      throw error;
    }
  }
  
  /**
   * Perform the actual initialization
   * @private
   * @return {Promise<void>}
   */
  async _performInitialization() {
    console.log('Initializing feature manager...');
    
    // Ensure storage manager is initialized
    if (!storageManager.initialized) {
      console.log('Waiting for storage manager to initialize...');
      await new Promise(resolve => {
        const handler = () => {
          document.removeEventListener('storage:ready', handler);
          resolve();
        };
        document.addEventListener('storage:ready', handler);
        
        // Safety timeout
        setTimeout(() => {
          document.removeEventListener('storage:ready', handler);
          console.warn('Storage manager initialization timed out');
          resolve();
        }, 5000);
      });
    }
    
    // Register all features - this will be populated by individual features
    this.registerBuiltinFeatures();
    
    // Set up permission change listener
    chrome.permissions.onAdded.addListener(this.handlePermissionChange);
    chrome.permissions.onRemoved.addListener(this.handlePermissionChange);
    
    // Process any pending feature activations from service worker restart
    await this.processActivationQueue();
    
    // Restore previously enabled features
    await this.restoreEnabledFeatures();
  }
  
  /**
   * Register all built-in features
   * This will be populated dynamically as features are implemented
   * @private
   */
  registerBuiltinFeatures() {
    // Text Tools category
    this.registerFeature({
      id: 'case-converter',
      name: 'Text Case Converter',
      description: 'Transform selected text between multiple case formats',
      category: CATEGORIES.TEXT_TOOLS,
      defaultEnabled: true,
      defaultSettings: {
        defaultCase: 'title',
        autoCopyToClipboard: false,
        showInContextMenu: true
      }
    });
    
    this.registerFeature({
      id: 'word-counter',
      name: 'Character/Word Counter',
      description: 'Provide detailed statistics about selected text',
      category: CATEGORIES.TEXT_TOOLS,
      defaultEnabled: true,
      defaultSettings: {
        displayMode: 'mini',
        autoActivateOnTextFields: true,
        readingSpeed: 200,
        speakingRate: 150
      }
    });
    
    this.registerFeature({
      id: 'translator',
      name: 'Translator',
      description: 'Translate selected text or entire webpages',
      category: CATEGORIES.TEXT_TOOLS,
      optionalPermissions: ['tabs'],
      hostPermissions: ['<all_urls>'],
      defaultEnabled: false,
      defaultSettings: {
        defaultTargetLanguage: 'en',
        translationStyle: 'formal',
        alwaysTranslateDomains: []
      }
    });
    
    this.registerFeature({
      id: 'dictionary',
      name: 'Dictionary Lookup',
      description: 'Provide definitions, synonyms, and usage examples for selected words',
      category: CATEGORIES.TEXT_TOOLS,
      defaultEnabled: false,
      defaultSettings: {
        primaryDictionary: 'english',
        enableDoubleClickLookup: true,
        displayStyle: 'tooltip'
      }
    });
    
    this.registerFeature({
      id: 'writing-assistant',
      name: 'Writing Assistant',
      description: 'Check grammar, style, and readability of written content',
      category: CATEGORIES.TEXT_TOOLS,
      defaultEnabled: false,
      defaultSettings: {
        writingStyle: 'formal',
        strictnessLevel: 'moderate',
        autoCheck: true
      }
    });
    
    // Content Analysis category
    this.registerFeature({
      id: 'page-summarizer',
      name: 'AI Page Summarizer',
      description: 'Generate concise summaries of web articles and long content',
      category: CATEGORIES.CONTENT_ANALYSIS,
      optionalPermissions: ['tabs'],
      hostPermissions: ['<all_urls>'],
      defaultEnabled: false,
      defaultSettings: {
        summaryStyle: 'standard',
        summaryLength: 'medium',
        humanize: true
      }
    });
    
    // More features would be registered here...
    
    console.log(`Registered ${featureRegistry.size} features`);
  }
  
  /**
   * Register a new feature
   * @param {FeatureDefinition} definition - Feature definition
   * @return {boolean} Success status
   */
  registerFeature(definition) {
    // Validate required fields
    if (!definition.id || !definition.name || !definition.category) {
      console.error('Invalid feature definition:', definition);
      return false;
    }
    
    // Check for duplicate
    if (featureRegistry.has(definition.id)) {
      console.error(`Feature with ID "${definition.id}" already registered`);
      return false;
    }
    
    // Register feature
    featureRegistry.set(definition.id, definition);
    
    // Store default settings if provided
    if (definition.defaultSettings) {
      const currentSettings = storageManager.getSetting(
        `features.featureSettings.${definition.id}`, 
        {}
      );
      
      // Merge with existing settings to ensure defaults
      const mergedSettings = {
        ...definition.defaultSettings,
        ...currentSettings
      };
      
      // Only save if different from current settings
      if (JSON.stringify(currentSettings) !== JSON.stringify(mergedSettings)) {
        storageManager.setSetting(
          `features.featureSettings.${definition.id}`, 
          mergedSettings,
          false
        );
      }
    }
    
    return true;
  }
  
  /**
   * Unregister a feature
   * @param {string} featureId - Feature ID
   * @return {boolean} Success status
   */
  unregisterFeature(featureId) {
    // Check if feature exists
    if (!featureRegistry.has(featureId)) {
      console.error(`Feature with ID "${featureId}" not found`);
      return false;
    }
    
    // Deactivate if active
    if (activeFeatures.has(featureId)) {
      this.deactivateFeature(featureId);
    }
    
    // Unregister feature
    featureRegistry.delete(featureId);
    return true;
  }
  
  /**
   * Get all registered features
   * @return {FeatureDefinition[]} Array of feature definitions
   */
  getAllFeatures() {
    return Array.from(featureRegistry.values());
  }
  
  /**
   * Get features by category
   * @param {string} category - Category ID
   * @return {FeatureDefinition[]} Array of feature definitions
   */
  getFeaturesByCategory(category) {
    return this.getAllFeatures().filter(feature => feature.category === category);
  }
  
  /**
   * Get feature by ID
   * @param {string} featureId - Feature ID
   * @return {FeatureDefinition|null} Feature definition or null if not found
   */
  getFeature(featureId) {
    return featureRegistry.get(featureId) || null;
  }
  
  /**
   * Check if a feature is enabled
   * @param {string} featureId - Feature ID
   * @return {boolean} Whether feature is enabled
   */
  isFeatureEnabled(featureId) {
    const enabledFeatures = storageManager.getSetting('features.enabledFeatures', []);
    const disabledFeatures = storageManager.getSetting('features.disabledFeatures', []);
    
    // If explicitly disabled, return false
    if (disabledFeatures.includes(featureId)) {
      return false;
    }
    
    // If explicitly enabled, return true
    if (enabledFeatures.includes(featureId)) {
      return true;
    }
    
    // Otherwise, check default settings
    const feature = this.getFeature(featureId);
    return feature ? !!feature.defaultEnabled : false;
  }
  
  /**
   * Check if a feature is active
   * @param {string} featureId - Feature ID
   * @return {boolean} Whether feature is active
   */
  isFeatureActive(featureId) {
    return activeFeatures.has(featureId);
  }
  
  /**
   * Enable a feature (persists across sessions)
   * @param {string} featureId - Feature ID
   * @return {Promise<boolean>} Success status
   */
  async enableFeature(featureId) {
    // Check if feature exists
    if (!featureRegistry.has(featureId)) {
      console.error(`Feature with ID "${featureId}" not found`);
      return false;
    }
    
    // Update enabled/disabled lists
    const enabledFeatures = storageManager.getSetting('features.enabledFeatures', []);
    const disabledFeatures = storageManager.getSetting('features.disabledFeatures', []);
    
    // Remove from disabled list if present
    const disabledIndex = disabledFeatures.indexOf(featureId);
    if (disabledIndex !== -1) {
      disabledFeatures.splice(disabledIndex, 1);
      await storageManager.setSetting('features.disabledFeatures', disabledFeatures);
    }
    
    // Add to enabled list if not already there
    if (!enabledFeatures.includes(featureId)) {
      enabledFeatures.push(featureId);
      await storageManager.setSetting('features.enabledFeatures', enabledFeatures);
    }
    
    // Try to activate feature if it's not already active
    if (!activeFeatures.has(featureId)) {
      try {
        await this.activateFeature(featureId);
      } catch (error) {
        console.error(`Failed to activate feature "${featureId}":`, error);
        // Feature remains enabled but not active
      }
    }
    
    return true;
  }
  
  /**
   * Disable a feature (persists across sessions)
   * @param {string} featureId - Feature ID
   * @return {Promise<boolean>} Success status
   */
  async disableFeature(featureId) {
    // Check if feature exists
    if (!featureRegistry.has(featureId)) {
      console.error(`Feature with ID "${featureId}" not found`);
      return false;
    }
    
    // Update enabled/disabled lists
    const enabledFeatures = storageManager.getSetting('features.enabledFeatures', []);
    const disabledFeatures = storageManager.getSetting('features.disabledFeatures', []);
    
    // Remove from enabled list if present
    const enabledIndex = enabledFeatures.indexOf(featureId);
    if (enabledIndex !== -1) {
      enabledFeatures.splice(enabledIndex, 1);
      await storageManager.setSetting('features.enabledFeatures', enabledFeatures);
    }
    
    // Add to disabled list if not already there
    if (!disabledFeatures.includes(featureId)) {
      disabledFeatures.push(featureId);
      await storageManager.setSetting('features.disabledFeatures', disabledFeatures);
    }
    
    // Deactivate feature if active
    if (activeFeatures.has(featureId)) {
      await this.deactivateFeature(featureId);
    }
    
    return true;
  }
  
  /**
   * Update feature settings
   * @param {string} featureId - Feature ID
   * @param {Object} settings - New settings
   * @return {Promise<boolean>} Success status
   */
  async updateFeatureSettings(featureId, settings) {
    // Check if feature exists
    if (!featureRegistry.has(featureId)) {
      console.error(`Feature with ID "${featureId}" not found`);
      return false;
    }
    
    // Get current settings
    const currentSettings = storageManager.getSetting(
      `features.featureSettings.${featureId}`, 
      {}
    );
    
    // Merge with new settings
    const newSettings = {
      ...currentSettings,
      ...settings
    };
    
    // Save settings
    await storageManager.setSetting(
      `features.featureSettings.${featureId}`, 
      newSettings
    );
    
    // Update active feature if it exists
    const activeFeature = activeFeatures.get(featureId);
    if (activeFeature) {
      activeFeature.settings = newSettings;
      
      // Notify feature of settings change if it has an onSettingsChange method
      if (typeof activeFeature.onSettingsChange === 'function') {
        try {
          activeFeature.onSettingsChange(newSettings);
        } catch (error) {
          console.error(`Error in onSettingsChange for feature "${featureId}":`, error);
        }
      }
    }
    
    return true;
  }
  
  /**
   * Activate a feature
   * @param {string} featureId - Feature ID
   * @return {Promise<FeatureInstance>} Activated feature instance
   */
  async activateFeature(featureId) {
    // Check if feature exists
    const featureDefinition = featureRegistry.get(featureId);
    if (!featureDefinition) {
      throw new Error(`Feature with ID "${featureId}" not found`);
    }
    
    // Check if already active
    if (activeFeatures.has(featureId)) {
      return activeFeatures.get(featureId);
    }
    
    // Add to pending activations
    if (pendingActivations.has(featureId)) {
      // Return existing pending activation promise
      return new Promise((resolve, reject) => {
        const pending = pendingActivations.get(featureId);
        pending.promises.push({ resolve, reject });
      });
    }
    
    // Create new pending activation
    const activationPromise = new Promise((resolve, reject) => {
      pendingActivations.set(featureId, {
        promises: [{ resolve, reject }]
      });
    });
    
    // Queue activation to be processed
    this.activationQueue.push(featureId);
    
    // Process queue
    if (!this.processingQueue) {
      this.processActivationQueue();
    }
    
    return activationPromise;
  }
  
  /**
   * Process the activation queue
   * @private
   * @return {Promise<void>}
   */
  async processActivationQueue() {
    // Flag to prevent concurrent processing
    if (this.processingQueue) return;
    this.processingQueue = true;
    
    try {
      while (this.activationQueue.length > 0) {
        const featureId = this.activationQueue.shift();
        
        // Skip if no longer pending (could have been rejected by another process)
        if (!pendingActivations.has(featureId)) continue;
        
        try {
          // Process this feature activation
          const feature = await this._activateFeature(featureId);
          
          // Resolve all pending promises
          const pending = pendingActivations.get(featureId);
          pendingActivations.delete(featureId);
          
          pending.promises.forEach(({ resolve }) => resolve(feature));
        } catch (error) {
          // Reject all pending promises
          const pending = pendingActivations.get(featureId);
          pendingActivations.delete(featureId);
          
          pending.promises.forEach(({ reject }) => reject(error));
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }
  
  /**
   * Internal feature activation implementation
   * @private
   * @param {string} featureId - Feature ID
   * @return {Promise<FeatureInstance>} Activated feature instance
   */
  async _activateFeature(featureId) {
    console.log(`Activating feature: ${featureId}`);
    
    const featureDefinition = featureRegistry.get(featureId);
    
    // Check feature dependencies
    if (featureDefinition.dependencies && featureDefinition.dependencies.length > 0) {
      for (const dependencyId of featureDefinition.dependencies) {
        // Check if dependency exists
        if (!featureRegistry.has(dependencyId)) {
          throw new Error(`Dependency "${dependencyId}" not found for feature "${featureId}"`);
        }
        
        // Activate dependency if not already active
        if (!activeFeatures.has(dependencyId)) {
          try {
            await this.activateFeature(dependencyId);
          } catch (error) {
            throw new Error(`Failed to activate dependency "${dependencyId}" for feature "${featureId}": ${error.message}`);
          }
        }
      }
    }
    
    // Check for conflicts
    if (featureDefinition.conflicts && featureDefinition.conflicts.length > 0) {
      for (const conflictId of featureDefinition.conflicts) {
        if (activeFeatures.has(conflictId)) {
          throw new Error(`Feature "${featureId}" conflicts with active feature "${conflictId}"`);
        }
      }
    }
    
    // Check required permissions
    if (featureDefinition.permissions && featureDefinition.permissions.length > 0) {
      const hasPermissions = await chrome.permissions.contains({
        permissions: featureDefinition.permissions
      });
      
      if (!hasPermissions) {
        throw new Error(`Feature "${featureId}" requires permissions: ${featureDefinition.permissions.join(', ')}`);
      }
    }
    
    // Check optional permissions
    if (featureDefinition.optionalPermissions && featureDefinition.optionalPermissions.length > 0) {
      const hasPermissions = await chrome.permissions.contains({
        permissions: featureDefinition.optionalPermissions
      });
      
      if (!hasPermissions) {
        // Request optional permissions
        const granted = await chrome.permissions.request({
          permissions: featureDefinition.optionalPermissions
        });
        
        if (!granted) {
          throw new Error(`User denied optional permissions for feature "${featureId}"`);
        }
      }
    }
    
    // Check host permissions
    if (featureDefinition.hostPermissions && featureDefinition.hostPermissions.length > 0) {
      const hasHostPermissions = await chrome.permissions.contains({
        origins: featureDefinition.hostPermissions
      });
      
      if (!hasHostPermissions) {
        // Request host permissions
        const granted = await chrome.permissions.request({
          origins: featureDefinition.hostPermissions
        });
        
        if (!granted) {
          throw new Error(`User denied host permissions for feature "${featureId}"`);
        }
      }
    }
    
    // Get feature settings
    const settings = storageManager.getSetting(
      `features.featureSettings.${featureId}`, 
      featureDefinition.defaultSettings || {}
    );
    
    // Create feature instance
    const featureInstance = {
      id: featureId,
      definition: featureDefinition,
      active: true,
      settings,
      deactivate: () => this.deactivateFeature(featureId)
    };
    
    // Call onActivate if provided
    if (typeof featureDefinition.onActivate === 'function') {
      try {
        await featureDefinition.onActivate(featureInstance);
      } catch (error) {
        console.error(`Error in onActivate for feature "${featureId}":`, error);
        throw new Error(`Failed to initialize feature "${featureId}": ${error.message}`);
      }
    }
    
    // Add to active features
    activeFeatures.set(featureId, featureInstance);
    
    // Broadcast activation event
    chrome.runtime.sendMessage({
      type: 'feature:activated',
      featureId
    }).catch(() => {
      // Ignore errors if no listeners
    });
    
    console.log(`Feature activated: ${featureId}`);
    return featureInstance;
  }
  
  /**
   * Deactivate a feature
   * @param {string} featureId - Feature ID
   * @return {Promise<boolean>} Success status
   */
  async deactivateFeature(featureId) {
    // Check if feature is active
    if (!activeFeatures.has(featureId)) {
      return false;
    }
    
    console.log(`Deactivating feature: ${featureId}`);
    
    const featureInstance = activeFeatures.get(featureId);
    
    // Check if other active features depend on this one
    for (const [activeId, instance] of activeFeatures.entries()) {
      if (activeId === featureId) continue;
      
      if (instance.definition.dependencies && 
          instance.definition.dependencies.includes(featureId)) {
        // Deactivate dependent feature first
        await this.deactivateFeature(activeId);
      }
    }
    
    // Call onDeactivate if provided
    if (typeof featureInstance.definition.onDeactivate === 'function') {
      try {
        await featureInstance.definition.onDeactivate(featureInstance);
      } catch (error) {
        console.error(`Error in onDeactivate for feature "${featureId}":`, error);
        // Continue deactivation despite error
      }
    }
    
    // Remove from active features
    activeFeatures.delete(featureId);
    
    // Broadcast deactivation event
    chrome.runtime.sendMessage({
      type: 'feature:deactivated',
      featureId
    }).catch(() => {
      // Ignore errors if no listeners
    });
    
    console.log(`Feature deactivated: ${featureId}`);
    return true;
  }
  
  /**
   * Request permissions for a feature
   * @param {string} featureId - Feature ID
   * @return {Promise<boolean>} Whether permissions were granted
   */
  async requestFeaturePermissions(featureId) {
    // Check if feature exists
    const featureDefinition = featureRegistry.get(featureId);
    if (!featureDefinition) {
      throw new Error(`Feature with ID "${featureId}" not found`);
    }
    
    const permissions = [];
    const origins = [];
    
    // Collect required permissions
    if (featureDefinition.permissions) {
      permissions.push(...featureDefinition.permissions);
    }
    
    // Collect optional permissions
    if (featureDefinition.optionalPermissions) {
      permissions.push(...featureDefinition.optionalPermissions);
    }
    
    // Collect host permissions
    if (featureDefinition.hostPermissions) {
      origins.push(...featureDefinition.hostPermissions);
    }
    
    // No permissions to request
    if (permissions.length === 0 && origins.length === 0) {
      return true;
    }
    
    // Request permissions
    return await chrome.permissions.request({
      permissions,
      origins
    });
  }
  
  /**
   * Handle permission changes
   * @param {Object} permissions - Permission changes
   * @private
   */
  handlePermissionChange(permissions) {
    // When permissions change, we need to check active features
    // to see if any need to be deactivated due to lost permissions
    
    this.getAllFeatures().forEach(async (feature) => {
      // Skip features that aren't active
      if (!activeFeatures.has(feature.id)) {
        return;
      }
      
      // Check if feature requires any of the changed permissions
      const requiresPermissions = feature.permissions && 
        feature.permissions.some(p => permissions.permissions.includes(p));
      
      const requiresOrigins = feature.hostPermissions && 
        feature.hostPermissions.some(o => permissions.origins.includes(o));
      
      if (requiresPermissions || requiresOrigins) {
        // Check if we still have the required permissions
        let hasRequiredPermissions = true;
        
        if (feature.permissions && feature.permissions.length > 0) {
          hasRequiredPermissions = await chrome.permissions.contains({
            permissions: feature.permissions
          });
        }
        
        if (hasRequiredPermissions && feature.hostPermissions && feature.hostPermissions.length > 0) {
          hasRequiredPermissions = await chrome.permissions.contains({
            origins: feature.hostPermissions
          });
        }
        
        // Deactivate feature if permissions were lost
        if (!hasRequiredPermissions) {
          console.log(`Deactivating feature "${feature.id}" due to permission changes`);
          this.deactivateFeature(feature.id);
        }
      }
    });
  }
  
  /**
   * Restore previously enabled features
   * @private
   * @return {Promise<void>}
   */
  async restoreEnabledFeatures() {
    if (this.restoreInProgress) return;
    this.restoreInProgress = true;
    
    try {
      console.log('Restoring enabled features...');
      
      const enabledFeatures = storageManager.getSetting('features.enabledFeatures', []);
      const restoredFeatures = [];
      const failedFeatures = [];
      
      // Try to activate each enabled feature
      for (const featureId of enabledFeatures) {
        // Skip features that don't exist or are already active
        if (!featureRegistry.has(featureId) || activeFeatures.has(featureId)) {
          continue;
        }
        
        try {
          await this.activateFeature(featureId);
          restoredFeatures.push(featureId);
        } catch (error) {
          console.error(`Failed to restore feature "${featureId}":`, error);
          failedFeatures.push(featureId);
        }
      }
      
      console.log(`Restored ${restoredFeatures.length} features, ${failedFeatures.length} failed`);
      
      // Broadcast restoration complete event
      if (restoredFeatures.length > 0 || failedFeatures.length > 0) {
        chrome.runtime.sendMessage({
          type: 'features:restored',
          restored: restoredFeatures,
          failed: failedFeatures
        }).catch(() => {
          // Ignore errors if no listeners
        });
      }
    } finally {
      this.restoreInProgress = false;
    }
  }
  
  /**
   * Get feature settings
   * @param {string} featureId - Feature ID
   * @return {Object} Feature settings
   */
  getFeatureSettings(featureId) {
    // Get feature definition
    const featureDefinition = featureRegistry.get(featureId);
    if (!featureDefinition) {
      console.error(`Feature with ID "${featureId}" not found`);
      return {};
    }
    
    // Get settings
    return storageManager.getSetting(
      `features.featureSettings.${featureId}`, 
      featureDefinition.defaultSettings || {}
    );
  }
  
  /**
   * Reset feature settings to defaults
   * @param {string} featureId - Feature ID
   * @return {Promise<boolean>} Success status
   */
  async resetFeatureSettings(featureId) {
    // Get feature definition
    const featureDefinition = featureRegistry.get(featureId);
    if (!featureDefinition) {
      console.error(`Feature with ID "${featureId}" not found`);
      return false;
    }
    
    // Reset to default settings
    await storageManager.setSetting(
      `features.featureSettings.${featureId}`, 
      featureDefinition.defaultSettings || {}
    );
    
    // Update active feature if it exists
    if (activeFeatures.has(featureId)) {
      activeFeatures.get(featureId).settings = 
        featureDefinition.defaultSettings || {};
    }
    
    return true;
  }
  
  /**
   * Handle service worker restart
   * @return {Promise<void>}
   */
  async handleRestart() {
    console.log('Handling feature manager restart');
    
    if (!this.initialized) {
      await this.initialize();
    } else {
      // Just restore features
      await this.restoreEnabledFeatures();
    }
  }
}

// Create singleton instance
const featureManager = new FeatureManager();

// Handle feature manager initialization event
document.addEventListener('features:initialize', async () => {
  await featureManager.initialize();
});

// Handle service worker restart
document.addEventListener('background:restore', async () => {
  await featureManager.handleRestart();
});

// Export the singleton
export default featureManager;