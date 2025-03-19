/**
 * API Manager
 * Manages external API requests, authentication, and rate limiting.
 * Builds on api-utils.js to provide higher-level API management.
 */

import apiUtils from '../utils/api-utils.js';
import storageManager from './storage-manager.js';

/**
 * API configuration settings
 */
const API_CONFIG = {
  google_translate: {
    name: 'Google Translate',
    authType: 'apiKey',
    rateLimit: {
      requestsPerMinute: 60,
      concurrentRequests: 4
    },
    defaults: {
      cacheTTL: 24 * 60 * 60 * 1000 // 24 hours
    },
    description: 'Translate text between languages',
    documentation: 'https://cloud.google.com/translate/docs'
  },
  claude: {
    name: 'Claude by Anthropic',
    authType: 'apiKey',
    rateLimit: {
      requestsPerMinute: 20,
      concurrentRequests: 2
    },
    defaults: {
      cacheTTL: 7 * 24 * 60 * 60 * 1000 // 1 week
    },
    description: 'AI text generation for page summarization',
    documentation: 'https://anthropic.com/claude'
  },
  dictionary: {
    name: 'Dictionary API',
    authType: 'none',
    rateLimit: {
      requestsPerMinute: 30,
      concurrentRequests: 3
    },
    defaults: {
      cacheTTL: 30 * 24 * 60 * 60 * 1000 // 30 days
    },
    description: 'Word definitions and language references',
    documentation: 'https://dictionaryapi.dev/'
  },
  exchange_rates: {
    name: 'Exchange Rates API',
    authType: 'none',
    rateLimit: {
      requestsPerMinute: 30,
      concurrentRequests: 2
    },
    defaults: {
      cacheTTL: 60 * 60 * 1000 // 1 hour
    },
    description: 'Currency exchange rates',
    documentation: 'https://open.er-api.com/v6/documentation'
  },
  web_archive: {
    name: 'Web Archive API',
    authType: 'none',
    rateLimit: {
      requestsPerMinute: 10,
      concurrentRequests: 1
    },
    defaults: {
      cacheTTL: 24 * 60 * 60 * 1000 // 24 hours
    },
    description: 'Internet Archive (Wayback Machine) integration',
    documentation: 'https://archive.org/help/wayback_api.php'
  }
};

/**
 * API Manager class
 */
class ApiManager {
  constructor() {
    this.initialized = false;
    this.apiKeys = {};
    this.usageStats = {};
    this.authTokens = {};
    this.refreshTimers = {};
    this.settingsPath = 'api';
    
    // Bind methods
    this.handleApiError = this.handleApiError.bind(this);
  }
  
  /**
   * Initialize API manager
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      console.log('Initializing API manager...');
      
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
      
      // Initialize API utilities
      await apiUtils.init();
      
      // Load API keys from secure storage
      await this.loadApiKeys();
      
      // Configure API rate limits
      this.configureRateLimits();
      
      // Load usage statistics
      await this.loadUsageStats();
      
      // Set up error handling
      this.setupErrorHandling();
      
      this.initialized = true;
      console.log('API manager initialized');
      
      // Notify that APIs are ready
      document.dispatchEvent(new CustomEvent('api:ready'));
    } catch (error) {
      console.error('Failed to initialize API manager:', error);
      document.dispatchEvent(new CustomEvent('api:error', { 
        detail: { error } 
      }));
      throw error;
    }
  }
  
  /**
   * Load API keys from storage
   * @private
   * @return {Promise<void>}
   */
  async loadApiKeys() {
    try {
      // Get API keys from storage
      const apiKeys = storageManager.getSetting(`${this.settingsPath}.apiKeys`, {});
      
      // Set API keys in apiUtils
      for (const [apiId, apiKey] of Object.entries(apiKeys)) {
        if (apiKey) {
          apiUtils.request.setApiKey(apiId, apiKey);
          this.apiKeys[apiId] = apiKey;
        }
      }
      
      console.log('API keys loaded');
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  }
  
  /**
   * Configure rate limits for all APIs
   * @private
   */
  configureRateLimits() {
    for (const [apiId, config] of Object.entries(API_CONFIG)) {
      if (config.rateLimit) {
        apiUtils.rateLimiter.init(apiId, config.rateLimit);
      }
    }
  }
  
  /**
   * Load API usage statistics from storage
   * @private
   * @return {Promise<void>}
   */
  async loadUsageStats() {
    try {
      this.usageStats = storageManager.getSetting(`${this.settingsPath}.usageStats`, {});
      
      // Initialize stats for APIs that don't have them yet
      for (const apiId of Object.keys(API_CONFIG)) {
        if (!this.usageStats[apiId]) {
          this.usageStats[apiId] = {
            requestCount: 0,
            lastRequest: null,
            errorCount: 0,
            lastError: null,
            quotaUsage: 0
          };
        }
      }
    } catch (error) {
      console.error('Failed to load API usage statistics:', error);
      // Initialize empty usage stats
      this.usageStats = {};
    }
  }
  
  /**
   * Set up error handling for API requests
   * @private
   */
  setupErrorHandling() {
    // Could patch the apiUtils.request method to add global error handling,
    // but for now we'll rely on individual calls to handleApiError
  }
  
  /**
   * Set API key for a service
   * @param {string} apiId - API identifier
   * @param {string} apiKey - API key
   * @return {Promise<boolean>} Success status
   */
  async setApiKey(apiId, apiKey) {
    try {
      if (!API_CONFIG[apiId]) {
        console.error(`Unknown API: ${apiId}`);
        return false;
      }
      
      // Validate API key format if possible
      if (!this.validateApiKey(apiId, apiKey)) {
        console.warn(`API key for ${apiId} failed validation`);
        // Continue anyway as validation is just a best-effort check
      }
      
      // Set key in api-utils
      apiUtils.request.setApiKey(apiId, apiKey);
      
      // Store in memory
      this.apiKeys[apiId] = apiKey;
      
      // Save to storage
      const apiKeys = storageManager.getSetting(`${this.settingsPath}.apiKeys`, {});
      apiKeys[apiId] = apiKey;
      await storageManager.setSetting(`${this.settingsPath}.apiKeys`, apiKeys);
      
      console.log(`API key for ${apiId} set successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to set API key for ${apiId}:`, error);
      return false;
    }
  }
  
  /**
   * Basic validation of API key format
   * @private
   * @param {string} apiId - API identifier
   * @param {string} apiKey - API key to validate
   * @return {boolean} Whether key format is valid
   */
  validateApiKey(apiId, apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }
    
    // Each API has different key formats
    switch (apiId) {
      case 'google_translate':
        // Google API keys are typically 39 characters
        return apiKey.length >= 20 && apiKey.length <= 50;
        
      case 'claude':
        // Claude API keys start with 'sk-ant-'
        return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
        
      default:
        // Default basic validation
        return apiKey.length > 5;
    }
  }
  
  /**
   * Remove API key for a service
   * @param {string} apiId - API identifier
   * @return {Promise<boolean>} Success status
   */
  async removeApiKey(apiId) {
    try {
      // Remove from api-utils
      apiUtils.request.setApiKey(apiId, null);
      
      // Remove from memory
      delete this.apiKeys[apiId];
      
      // Remove from storage
      const apiKeys = storageManager.getSetting(`${this.settingsPath}.apiKeys`, {});
      delete apiKeys[apiId];
      await storageManager.setSetting(`${this.settingsPath}.apiKeys`, apiKeys);
      
      console.log(`API key for ${apiId} removed`);
      return true;
    } catch (error) {
      console.error(`Failed to remove API key for ${apiId}:`, error);
      return false;
    }
  }
  
  /**
   * Check if API key is configured for a service
   * @param {string} apiId - API identifier
   * @return {boolean} Whether API key is set
   */
  hasApiKey(apiId) {
    return !!this.apiKeys[apiId];
  }
  
  /**
   * Get all configured API services with their status
   * @return {Object[]} Array of API configurations
   */
  getApiServices() {
    return Object.entries(API_CONFIG).map(([apiId, config]) => ({
      id: apiId,
      name: config.name,
      description: config.description,
      documentation: config.documentation,
      authType: config.authType,
      hasKey: this.hasApiKey(apiId),
      usageStats: this.usageStats[apiId] || {
        requestCount: 0,
        lastRequest: null,
        errorCount: 0
      }
    }));
  }
  
  /**
   * Authenticate with API requiring OAuth
   * @param {string} apiId - API identifier
   * @return {Promise<string>} Authentication token
   */
  async authenticate(apiId) {
    if (!API_CONFIG[apiId]) {
      throw new Error(`Unknown API: ${apiId}`);
    }
    
    if (API_CONFIG[apiId].authType !== 'oauth') {
      throw new Error(`API ${apiId} does not use OAuth authentication`);
    }
    
    // Check if we already have a valid token
    if (this.authTokens[apiId] && this.authTokens[apiId].expiresAt > Date.now()) {
      return this.authTokens[apiId].token;
    }
    
    // Get OAuth configuration
    const authConfig = storageManager.getSetting(`${this.settingsPath}.authConfig.${apiId}`, {});
    if (!authConfig.clientId) {
      throw new Error(`OAuth configuration missing for ${apiId}`);
    }
    
    try {
      // Use chrome.identity to authenticate
      const authUrl = this.buildAuthUrl(apiId, authConfig);
      
      // Launch the authentication flow
      const redirectUrl = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
        }, (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(responseUrl);
        });
      });
      
      // Parse the token from the redirect URL
      const token = this.extractTokenFromRedirect(redirectUrl);
      
      // Store the token with expiration
      this.authTokens[apiId] = {
        token,
        expiresAt: Date.now() + (token.expires_in || 3600) * 1000
      };
      
      // Set up token refresh if needed
      this.setupTokenRefresh(apiId);
      
      return token.access_token;
    } catch (error) {
      console.error(`Authentication failed for ${apiId}:`, error);
      throw new apiUtils.ApiError(
        `Authentication failed for ${apiId}: ${error.message}`,
        apiUtils.ERROR_TYPES.AUTH,
        { apiId },
        null,
        error
      );
    }
  }
  
  /**
   * Build OAuth authorization URL
   * @private
   * @param {string} apiId - API identifier
   * @param {Object} authConfig - Authentication configuration
   * @return {string} Authorization URL
   */
  buildAuthUrl(apiId, authConfig) {
    // Example for Google APIs
    if (apiId.startsWith('google_')) {
      const scopes = encodeURIComponent(authConfig.scopes.join(' '));
      const redirectUri = encodeURIComponent(chrome.identity.getRedirectURL());
      
      return `https://accounts.google.com/o/oauth2/auth` +
        `?client_id=${authConfig.clientId}` +
        `&redirect_uri=${redirectUri}` +
        `&response_type=token` +
        `&scope=${scopes}`;
    }
    
    // Generic OAuth2 implementation
    return authConfig.authUrl + 
      `?client_id=${authConfig.clientId}` +
      `&redirect_uri=${encodeURIComponent(chrome.identity.getRedirectURL())}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(authConfig.scopes.join(' '))}`;
  }
  
  /**
   * Extract token from OAuth redirect URL
   * @private
   * @param {string} redirectUrl - Redirect URL with token
   * @return {Object} Token object
   */
  extractTokenFromRedirect(redirectUrl) {
    const url = new URL(redirectUrl);
    const hash = url.hash.substring(1); // Remove the '#'
    
    const params = new URLSearchParams(hash);
    return {
      access_token: params.get('access_token'),
      token_type: params.get('token_type'),
      expires_in: parseInt(params.get('expires_in'), 10)
    };
  }
  
  /**
   * Set up token refresh for OAuth
   * @private
   * @param {string} apiId - API identifier
   */
  setupTokenRefresh(apiId) {
    // Clear existing timer
    if (this.refreshTimers[apiId]) {
      clearTimeout(this.refreshTimers[apiId]);
    }
    
    const token = this.authTokens[apiId];
    if (!token) return;
    
    // Calculate refresh time (refresh when 90% of the time has passed)
    const timeUntilExpiry = token.expiresAt - Date.now();
    const refreshTime = timeUntilExpiry * 0.9;
    
    // Set timer to refresh token
    this.refreshTimers[apiId] = setTimeout(() => {
      this.authenticate(apiId).catch(error => {
        console.error(`Failed to refresh token for ${apiId}:`, error);
      });
    }, refreshTime);
  }
  
  /**
   * Make API request with tracking and error handling
   * @param {string} apiId - API identifier
   * @param {Function} requestFn - Function that makes the actual request
   * @return {Promise<any>} API response
   */
  async makeRequest(apiId, requestFn) {
    if (!API_CONFIG[apiId]) {
      throw new Error(`Unknown API: ${apiId}`);
    }
    
    // Update usage tracking before request
    this.recordRequestAttempt(apiId);
    
    try {
      // Execute the request
      const result = await requestFn();
      
      // Update successful request stats
      this.recordRequestSuccess(apiId);
      
      return result;
    } catch (error) {
      // Handle and track error
      return this.handleApiError(apiId, error);
    }
  }
  
  /**
   * Record an API request attempt
   * @private
   * @param {string} apiId - API identifier
   */
  recordRequestAttempt(apiId) {
    if (!this.usageStats[apiId]) {
      this.usageStats[apiId] = {
        requestCount: 0,
        lastRequest: null,
        errorCount: 0,
        lastError: null,
        quotaUsage: 0
      };
    }
    
    this.usageStats[apiId].requestCount++;
    this.usageStats[apiId].lastRequest = Date.now();
    
    // Don't save stats on every request to reduce storage writes
    // Instead, we'll periodically save when quotas or limits change
  }
  
  /**
   * Record a successful API request
   * @private
   * @param {string} apiId - API identifier
   */
  recordRequestSuccess(apiId) {
    if (!this.usageStats[apiId]) return;
    
    // Update quota usage (estimate)
    this.usageStats[apiId].quotaUsage++;
    
    // Periodically save stats
    if (this.usageStats[apiId].requestCount % 10 === 0) {
      this.saveUsageStats();
    }
  }
  
  /**
   * Handle API error with proper logging and recovery
   * @private
   * @param {string} apiId - API identifier
   * @param {Error} error - Error object
   * @throws {Error} Rethrows the error after handling
   */
  handleApiError(apiId, error) {
    // Update error statistics
    if (!this.usageStats[apiId]) return;
    
    this.usageStats[apiId].errorCount++;
    this.usageStats[apiId].lastError = {
      timestamp: Date.now(),
      message: error.message,
      type: error instanceof apiUtils.ApiError ? error.type : 'unknown'
    };
    
    // Save error stats immediately
    this.saveUsageStats();
    
    // Check if it's an authentication error
    if (error instanceof apiUtils.ApiError && error.type === apiUtils.ERROR_TYPES.AUTH) {
      // Clear credentials if authentication failed
      if (API_CONFIG[apiId].authType === 'oauth') {
        delete this.authTokens[apiId];
      }
    }
    
    // Rethrow the error
    throw error;
  }
  
  /**
   * Save API usage statistics to storage
   * @private
   * @return {Promise<void>}
   */
  async saveUsageStats() {
    try {
      await storageManager.setSetting(`${this.settingsPath}.usageStats`, this.usageStats, false);
    } catch (error) {
      console.error('Failed to save API usage statistics:', error);
    }
  }
  
  /**
   * Reset usage statistics for an API
   * @param {string} apiId - API identifier (or 'all' for all APIs)
   * @return {Promise<boolean>} Success status
   */
  async resetUsageStats(apiId) {
    try {
      if (apiId === 'all') {
        // Reset all stats
        for (const id of Object.keys(this.usageStats)) {
          this.usageStats[id] = {
            requestCount: 0,
            lastRequest: null,
            errorCount: 0,
            lastError: null,
            quotaUsage: 0
          };
        }
      } else if (this.usageStats[apiId]) {
        // Reset specific API stats
        this.usageStats[apiId] = {
          requestCount: 0,
          lastRequest: null,
          errorCount: 0,
          lastError: null,
          quotaUsage: 0
        };
      }
      
      // Save updated stats
      await this.saveUsageStats();
      
      return true;
    } catch (error) {
      console.error(`Failed to reset usage stats for ${apiId}:`, error);
      return false;
    }
  }
  
  /**
   * Test API connection to verify credentials
   * @param {string} apiId - API identifier
   * @return {Promise<Object>} Test result
   */
  async testApiConnection(apiId) {
    if (!API_CONFIG[apiId]) {
      throw new Error(`Unknown API: ${apiId}`);
    }
    
    const startTime = Date.now();
    let success = false;
    let errorMessage = null;
    
    try {
      switch (apiId) {
        case 'google_translate':
          await apiUtils.services.translate.detectLanguage('Hello world');
          break;
          
        case 'claude':
          await apiUtils.services.claude.summarize('This is a test of the Claude API connection.', {
            length: 'brief',
            humanize: false
          });
          break;
          
        case 'dictionary':
          await apiUtils.services.dictionary.getDefinition('test');
          break;
          
        case 'exchange_rates':
          await apiUtils.services.exchangeRates.getCurrentRates('USD');
          break;
          
        case 'web_archive':
          await apiUtils.services.webArchive.checkArchive('https://example.com');
          break;
          
        default:
          throw new Error(`No test available for API: ${apiId}`);
      }
      
      success = true;
    } catch (error) {
      success = false;
      errorMessage = error instanceof apiUtils.ApiError ? 
        `${error.type}: ${error.message}` : error.message;
    }
    
    const duration = Date.now() - startTime;
    
    return {
      apiId,
      success,
      duration,
      timestamp: Date.now(),
      error: errorMessage
    };
  }
  
  /**
   * Check API availability before attempting operations
   * @param {string} apiId - API identifier
   * @return {Promise<{available: boolean, reason: string|null}>} Availability info
   */
  async checkApiAvailability(apiId) {
    if (!API_CONFIG[apiId]) {
      return { available: false, reason: 'Unknown API' };
    }
    
    // Check if offline mode is enabled
    const offlineMode = storageManager.getSetting('api.offlineMode', false);
    if (offlineMode) {
      return { available: false, reason: 'Offline mode enabled' };
    }
    
    // Check if API key is required and set
    if (API_CONFIG[apiId].authType === 'apiKey' && !this.hasApiKey(apiId)) {
      return { available: false, reason: 'API key not configured' };
    }
    
    // Check if API has been rate limited recently
    const rateLimited = this.isRateLimited(apiId);
    if (rateLimited) {
      return { available: false, reason: 'Rate limited' };
    }
    
    // Check for recent errors that might indicate service issues
    const recentErrors = this.hasRecentErrors(apiId);
    if (recentErrors) {
      return { available: false, reason: 'Service may be unavailable (recent errors)' };
    }
    
    return { available: true, reason: null };
  }
  
  /**
   * Check if API is currently rate limited
   * @private
   * @param {string} apiId - API identifier
   * @return {boolean} Whether API is rate limited
   */
  isRateLimited(apiId) {
    return !apiUtils.rateLimiter.checkLimit(apiId);
  }
  
  /**
   * Check if API has had recent errors
   * @private
   * @param {string} apiId - API identifier
   * @return {boolean} Whether API has recent errors
   */
  hasRecentErrors(apiId) {
    if (!this.usageStats[apiId] || !this.usageStats[apiId].lastError) {
      return false;
    }
    
    // Check if there have been errors in the last 5 minutes
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return (
      this.usageStats[apiId].lastError.timestamp > fiveMinutesAgo &&
      this.usageStats[apiId].errorCount > 3
    );
  }
  
  /**
   * Configure API settings
   * @param {Object} settings - API settings
   * @return {Promise<boolean>} Success status
   */
  async configureApi(settings) {
    try {
      // Update settings via storage manager
      await storageManager.setSetting(this.settingsPath, {
        ...storageManager.getSetting(this.settingsPath, {}),
        ...settings
      });
      
      // Apply changes that need immediate effect
      if (settings.hasOwnProperty('offlineMode')) {
        // Nothing to do here, checkApiAvailability will use updated setting
      }
      
      if (settings.hasOwnProperty('cacheResults')) {
        // This will affect new requests via apiUtils
      }
      
      return true;
    } catch (error) {
      console.error('Failed to configure API settings:', error);
      return false;
    }
  }
  
  /**
   * Handle service worker restart
   * @return {Promise<void>}
   */
  async handleRestart() {
    console.log('Handling API manager restart');
    
    if (!this.initialized) {
      await this.initialize();
    } else {
      // Reload API keys in case they changed
      await this.loadApiKeys();
      
      // Reload usage stats
      await this.loadUsageStats();
    }
  }
}

// Create singleton instance
const apiManager = new ApiManager();

// Handle API manager initialization event
document.addEventListener('api:initialize', async () => {
  await apiManager.initialize();
});

// Handle service worker restart
document.addEventListener('background:restore', async () => {
  await apiManager.handleRestart();
});

// Export the singleton
export default apiManager;