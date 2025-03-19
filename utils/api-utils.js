/**
 * API Utilities
 * Standardized API interaction methods with error handling, rate limiting, and caching.
 * Provides abstraction for all external API interactions used by the extension.
 */

import storageUtils from './storage-utils.js';

// Ensure dayjs is available
const hasDayjs = typeof dayjs !== 'undefined';
if (!hasDayjs) {
  console.warn('Day.js not loaded. Date handling will have limited functionality.');
}

/**
 * API request configuration defaults
 */
const DEFAULT_CONFIG = {
  // Retry settings
  retries: 3,
  retryDelay: 1000,
  retryBackoffFactor: 2,
  
  // Timeout settings
  timeout: 10000,
  
  // Caching settings
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  cacheByDefault: true,
  
  // Rate limiting
  rateLimit: {
    requestsPerMinute: 60,
    concurrentRequests: 6
  }
};

/**
 * API error types
 */
const ERROR_TYPES = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  AUTH: 'authentication',
  PERMISSION: 'permission',
  NOT_FOUND: 'not_found',
  BAD_REQUEST: 'bad_request',
  SERVER: 'server',
  UNKNOWN: 'unknown'
};

/**
 * API Error class
 */
class ApiError extends Error {
  /**
   * Create an API error
   * @param {string} message - Error message
   * @param {string} type - Error type from ERROR_TYPES
   * @param {Object} [details] - Additional error details
   * @param {number} [status] - HTTP status code
   * @param {Error} [originalError] - Original error object
   */
  constructor(message, type, details = {}, status = null, originalError = null) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.details = details;
    this.status = status;
    this.originalError = originalError;
    this.timestamp = new Date();
  }
  
  /**
   * Check if error is a network issue that can be retried
   * @return {boolean} Whether error is retryable
   */
  isRetryable() {
    return (
      this.type === ERROR_TYPES.NETWORK ||
      this.type === ERROR_TYPES.TIMEOUT ||
      this.type === ERROR_TYPES.RATE_LIMIT ||
      (this.type === ERROR_TYPES.SERVER && this.status >= 500)
    );
  }
  
  /**
   * Create appropriate error from fetch response
   * @param {Response} response - Fetch Response object
   * @param {string} [requestUrl] - URL that was requested
   * @return {Promise<ApiError>} API error
   */
  static async fromResponse(response, requestUrl = null) {
    let errorType = ERROR_TYPES.UNKNOWN;
    let errorMessage = 'API request failed';
    let errorDetails = {};
    
    try {
      // Try to parse response as JSON
      try {
        errorDetails = await response.clone().json();
      } catch (e) {
        // If not JSON, get text
        errorDetails = { responseText: await response.text() };
      }
      
      // Determine error type from status
      if (response.status === 401) {
        errorType = ERROR_TYPES.AUTH;
        errorMessage = 'Authentication failed';
      } else if (response.status === 403) {
        errorType = ERROR_TYPES.PERMISSION;
        errorMessage = 'Permission denied';
      } else if (response.status === 404) {
        errorType = ERROR_TYPES.NOT_FOUND;
        errorMessage = 'Resource not found';
      } else if (response.status === 429) {
        errorType = ERROR_TYPES.RATE_LIMIT;
        errorMessage = 'Rate limit exceeded';
      } else if (response.status >= 400 && response.status < 500) {
        errorType = ERROR_TYPES.BAD_REQUEST;
        errorMessage = 'Invalid request';
      } else if (response.status >= 500) {
        errorType = ERROR_TYPES.SERVER;
        errorMessage = 'Server error';
      }
      
      // Add request URL to details if provided
      if (requestUrl) {
        errorDetails.url = requestUrl;
      }
      
    } catch (error) {
      console.error('Error parsing API response:', error);
    }
    
    return new ApiError(errorMessage, errorType, errorDetails, response.status);
  }
  
  /**
   * Create error from network error
   * @param {Error} error - Original error
   * @param {string} [requestUrl] - URL that was requested
   * @return {ApiError} API error
   */
  static fromNetworkError(error, requestUrl = null) {
    let errorType = ERROR_TYPES.NETWORK;
    let errorMessage = 'Network error occurred';
    
    // Check for timeout
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      errorType = ERROR_TYPES.TIMEOUT;
      errorMessage = 'Request timed out';
    }
    
    const details = requestUrl ? { url: requestUrl } : {};
    
    return new ApiError(errorMessage, errorType, details, null, error);
  }
}

/**
 * Rate limiting implementation
 */
const rateLimiter = {
  /**
   * Rate limit state, keyed by API identifier
   * @private
   */
  _state: {},
  
  /**
   * Initialize rate limiter for an API
   * @param {string} apiId - API identifier
   * @param {Object} [options] - Rate limiting options
   * @param {number} [options.requestsPerMinute] - Requests per minute limit
   * @param {number} [options.concurrentRequests] - Concurrent requests limit
   * @return {Object} Rate limiter state
   */
  init(apiId, options = {}) {
    if (!this._state[apiId]) {
      this._state[apiId] = {
        requestsPerMinute: options.requestsPerMinute || DEFAULT_CONFIG.rateLimit.requestsPerMinute,
        concurrentRequests: options.concurrentRequests || DEFAULT_CONFIG.rateLimit.concurrentRequests,
        activeRequests: 0,
        requestHistory: [],
        queue: [],
        queueProcessing: false
      };
    }
    
    return this._state[apiId];
  },
  
  /**
   * Check if request would exceed rate limits
   * @param {string} apiId - API identifier
   * @return {boolean} Whether request is allowed
   */
  checkLimit(apiId) {
    const state = this.init(apiId);
    
    // Check concurrent requests limit
    if (state.activeRequests >= state.concurrentRequests) {
      return false;
    }
    
    // Clean up old request history
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    state.requestHistory = state.requestHistory.filter(time => time > oneMinuteAgo);
    
    // Check requests per minute limit
    return state.requestHistory.length < state.requestsPerMinute;
  },
  
  /**
   * Record a request for rate limiting
   * @param {string} apiId - API identifier
   */
  recordRequest(apiId) {
    const state = this.init(apiId);
    
    state.requestHistory.push(Date.now());
    state.activeRequests++;
  },
  
  /**
   * Record completion of a request
   * @param {string} apiId - API identifier
   */
  recordCompletion(apiId) {
    const state = this.init(apiId);
    
    state.activeRequests = Math.max(0, state.activeRequests - 1);
    this._processQueue(apiId);
  },
  
  /**
   * Enqueue a request for later execution
   * @param {string} apiId - API identifier
   * @param {Function} requestFn - Function to execute request
   * @param {Function} resolveFn - Promise resolve function
   * @param {Function} rejectFn - Promise reject function
   */
  enqueue(apiId, requestFn, resolveFn, rejectFn) {
    const state = this.init(apiId);
    
    state.queue.push({
      requestFn,
      resolveFn,
      rejectFn,
      timestamp: Date.now()
    });
    
    // Start queue processing if not already in progress
    if (!state.queueProcessing) {
      this._processQueue(apiId);
    }
  },
  
  /**
   * Process queued requests
   * @param {string} apiId - API identifier
   * @private
   */
  _processQueue(apiId) {
    const state = this.init(apiId);
    
    // If already processing or queue empty, do nothing
    if (state.queueProcessing || state.queue.length === 0) {
      return;
    }
    
    state.queueProcessing = true;
    
    // Process next request if within rate limits
    const processNext = () => {
      if (state.queue.length === 0) {
        state.queueProcessing = false;
        return;
      }
      
      if (this.checkLimit(apiId)) {
        const { requestFn, resolveFn, rejectFn } = state.queue.shift();
        
        this.recordRequest(apiId);
        
        // Execute the request
        Promise.resolve().then(requestFn).then(resolveFn, rejectFn)
          .finally(() => {
            this.recordCompletion(apiId);
            processNext();
          });
      } else {
        // Retry after waiting a bit
        setTimeout(() => processNext(), 500);
      }
    };
    
    processNext();
  }
};

/**
 * API request management
 */
const apiRequest = {
  /**
   * Active API keys and credentials
   * @private
   */
  _apiKeys: {},
  
  /**
   * Set API key for a service
   * @param {string} apiId - API identifier
   * @param {string|Object} apiKey - API key or credentials object
   */
  setApiKey(apiId, apiKey) {
    this._apiKeys[apiId] = apiKey;
  },
  
  /**
   * Get API key for a service
   * @param {string} apiId - API identifier
   * @return {string|Object|null} API key, credentials object, or null if not set
   */
  getApiKey(apiId) {
    return this._apiKeys[apiId] || null;
  },
  
  /**
   * Create cache key for request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @return {string} Cache key
   */
  createCacheKey(url, options) {
    // Create a string that uniquely identifies this request
    const method = options.method || 'GET';
    const body = options.body || '';
    const headers = options.headers || {};
    
    // For GET requests, cache key is just URL
    if (method === 'GET') {
      return `${method}:${url}`;
    }
    
    // For other requests, include body in cache key
    const headerStr = JSON.stringify(headers);
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    
    return `${method}:${url}:${headerStr}:${bodyStr}`;
  },
  
  /**
   * Check cache for a matching request
   * @param {string} cacheKey - Cache key
   * @return {Promise<Object|null>} Cached response or null if not found/expired
   */
  async checkCache(cacheKey) {
    try {
      const cached = await storageUtils.cache.get(cacheKey);
      return cached;
    } catch (error) {
      console.error('Error checking cache:', error);
      return null;
    }
  },
  
  /**
   * Store response in cache
   * @param {string} cacheKey - Cache key
   * @param {Object} response - Response to cache
   * @param {number} ttl - Time to live in ms
   * @return {Promise<void>}
   */
  async cacheResponse(cacheKey, response, ttl) {
    try {
      await storageUtils.cache.set(cacheKey, response, ttl);
    } catch (error) {
      console.error('Error caching response:', error);
    }
  },
  
  /**
   * Make API request with automatic retries and error handling
   * @param {string} url - Request URL
   * @param {Object} [options={}] - Request options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {Object|string} [options.body] - Request body
   * @param {Object} [options.headers] - Request headers
   * @param {string} [options.apiId] - API identifier for rate limiting
   * @param {number} [options.timeout] - Request timeout in ms
   * @param {number} [options.retries] - Number of retry attempts
   * @param {number} [options.retryDelay] - Initial retry delay in ms
   * @param {number} [options.retryBackoffFactor] - Exponential backoff factor
   * @param {boolean} [options.useCache] - Whether to use caching
   * @param {number} [options.cacheTTL] - Cache TTL in ms
   * @param {boolean} [options.forceFresh] - Force fresh request (ignore cache)
   * @param {boolean} [options.mockResponse] - Use mock response if available
   * @return {Promise<Object>} Response data
   */
  async request(url, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      apiId = 'default',
      timeout = DEFAULT_CONFIG.timeout,
      retries = DEFAULT_CONFIG.retries,
      retryDelay = DEFAULT_CONFIG.retryDelay,
      retryBackoffFactor = DEFAULT_CONFIG.retryBackoffFactor,
      useCache = DEFAULT_CONFIG.cacheByDefault,
      cacheTTL = DEFAULT_CONFIG.cacheTTL,
      forceFresh = false,
      mockResponse = false
    } = options;
    
    // Initialize fetch options
    const fetchOptions = {
      method,
      headers: { ...headers },
      mode: 'cors',
      credentials: 'same-origin'
    };
    
    // Add body if provided
    if (body) {
      if (typeof body === 'object' && !(body instanceof FormData)) {
        fetchOptions.body = JSON.stringify(body);
        fetchOptions.headers['Content-Type'] = 'application/json';
      } else {
        fetchOptions.body = body;
      }
    }
    
    // Check for mocked response
    if (mockResponse) {
      const mockData = await this._getMockResponse(url, fetchOptions);
      if (mockData) {
        console.log('Using mock response for:', url);
        return mockData;
      }
    }
    
    // Check cache for GET requests
    const isCacheable = method === 'GET' && useCache;
    if (isCacheable && !forceFresh) {
      const cacheKey = this.createCacheKey(url, fetchOptions);
      const cachedResponse = await this.checkCache(cacheKey);
      
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    // Create a request executor function that can be retried
    const executeRequest = async (attempt = 0) => {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        fetchOptions.signal = controller.signal;
        
        // Execute fetch
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        // Handle response
        if (!response.ok) {
          throw await ApiError.fromResponse(response, url);
        }
        
        // Parse response as JSON
        const data = await response.json();
        
        // Cache successful response
        if (isCacheable) {
          const cacheKey = this.createCacheKey(url, fetchOptions);
          await this.cacheResponse(cacheKey, data, cacheTTL);
        }
        
        return data;
      } catch (error) {
        // Convert error to ApiError if needed
        const apiError = error instanceof ApiError 
          ? error 
          : ApiError.fromNetworkError(error, url);
        
        // Determine if retry is possible
        const shouldRetry = (
          attempt < retries && 
          apiError.isRetryable()
        );
        
        if (shouldRetry) {
          // Calculate backoff delay with jitter
          const delay = retryDelay * Math.pow(retryBackoffFactor, attempt);
          const jitter = delay * 0.2 * Math.random();
          const backoffDelay = Math.floor(delay + jitter);
          
          console.warn(`Retrying API request (${attempt+1}/${retries}) after ${backoffDelay}ms:`, url);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          
          // Recursively retry
          return executeRequest(attempt + 1);
        }
        
        // No more retries, throw the error
        throw apiError;
      }
    };
    
    // Use rate limiter for the request
    return new Promise((resolve, reject) => {
      if (rateLimiter.checkLimit(apiId)) {
        // Execute immediately if within rate limits
        rateLimiter.recordRequest(apiId);
        
        executeRequest()
          .then(resolve, reject)
          .finally(() => rateLimiter.recordCompletion(apiId));
      } else {
        // Enqueue for later execution if rate limited
        rateLimiter.enqueue(apiId, () => executeRequest(), resolve, reject);
      }
    });
  },
  
  /**
   * Make GET request
   * @param {string} url - Request URL
   * @param {Object} [options={}] - Request options
   * @return {Promise<Object>} Response data
   */
  async get(url, options = {}) {
    return this.request(url, {
      ...options,
      method: 'GET'
    });
  },
  
  /**
   * Make POST request
   * @param {string} url - Request URL
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [options={}] - Request options
   * @return {Promise<Object>} Response data
   */
  async post(url, body = null, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      body
    });
  },
  
  /**
   * Make PUT request
   * @param {string} url - Request URL
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [options={}] - Request options
   * @return {Promise<Object>} Response data
   */
  async put(url, body = null, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PUT',
      body
    });
  },
  
  /**
   * Make PATCH request
   * @param {string} url - Request URL
   * @param {Object|string} [body=null] - Request body
   * @param {Object} [options={}] - Request options
   * @return {Promise<Object>} Response data
   */
  async patch(url, body = null, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PATCH',
      body
    });
  },
  
  /**
   * Make DELETE request
   * @param {string} url - Request URL
   * @param {Object} [options={}] - Request options
   * @return {Promise<Object>} Response data
   */
  async delete(url, options = {}) {
    return this.request(url, {
      ...options,
      method: 'DELETE'
    });
  },
  
  /**
   * Batch multiple requests to the same API
   * @param {Object[]} requests - Array of request configurations
   * @param {string} apiId - API identifier for rate limiting
   * @param {Object} [options={}] - Batch options
   * @param {number} [options.concurrency=3] - Maximum concurrent requests
   * @param {boolean} [options.abortOnError=false] - Abort batch on first error
   * @return {Promise<Object[]>} Array of responses
   */
  async batch(requests, apiId, options = {}) {
    const {
      concurrency = 3,
      abortOnError = false
    } = options;
    
    if (!requests || !requests.length) {
      return [];
    }
    
    const results = new Array(requests.length);
    const pending = new Set();
    const errors = [];
    
    // Clone the requests array to avoid modifying original
    const queue = [...requests];
    
    const executeNext = async () => {
      if (queue.length === 0) return;
      
      // Get next request from queue
      const index = requests.length - queue.length;
      const request = queue.shift();
      
      // Track this request in pending set
      const requestId = Date.now() + Math.random();
      pending.add(requestId);
      
      try {
        // Execute the request with the specified API ID
        const { url, ...reqOptions } = request;
        const response = await this.request(url, {
          ...reqOptions,
          apiId
        });
        
        // Store the result
        results[index] = response;
      } catch (error) {
        results[index] = null;
        errors.push({ index, error });
        
        // Abort the batch if specified
        if (abortOnError) {
          throw error;
        }
      } finally {
        // Remove from pending
        pending.delete(requestId);
        
        // Execute next if there are more in the queue
        if (queue.length > 0) {
          executeNext();
        }
      }
    };
    
    // Start initial concurrent requests
    const initialBatch = Math.min(concurrency, queue.length);
    const starters = Array.from({ length: initialBatch }, () => executeNext());
    
    // Wait for all requests to complete
    await Promise.all(starters);
    while (pending.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // If there were errors and we didn't abort, include them in results
    if (errors.length > 0 && !abortOnError) {
      return {
        results,
        errors
      };
    }
    
    return results;
  },
  
  /**
   * Get mock response for development/testing
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @return {Promise<Object|null>} Mock response or null if none available
   * @private
   */
  async _getMockResponse(url, options) {
    // Only used in development mode
    if (process.env.NODE_ENV !== 'development') {
      return null;
    }
    
    try {
      // Check if mocks are available
      const mockData = await storageUtils.db.get('mocks', url);
      if (mockData) {
        // Allow for method-specific mocks
        if (typeof mockData === 'object' && mockData[options.method]) {
          return mockData[options.method];
        }
        return mockData;
      }
    } catch (error) {
      console.error('Error loading mock response:', error);
    }
    
    return null;
  },
  
  /**
   * Set mock response for testing
   * @param {string} url - Request URL to mock
   * @param {Object|Function} data - Mock response data or function that returns data
   * @param {string} [method='GET'] - HTTP method to mock
   * @return {Promise<void>}
   */
  async setMockResponse(url, data, method = 'GET') {
    try {
      // Store in IndexedDB for persistence across page loads
      let mockEntry = await storageUtils.db.get('mocks', url) || {};
      
      if (typeof mockEntry !== 'object') {
        mockEntry = {};
      }
      
      mockEntry[method] = data;
      
      await storageUtils.db.put('mocks', mockEntry, url);
      console.log(`Mock response set for ${method} ${url}`);
    } catch (error) {
      console.error('Error setting mock response:', error);
    }
  },
  
  /**
   * Clear all mock responses
   * @return {Promise<void>}
   */
  async clearMockResponses() {
    try {
      await storageUtils.db.clear('mocks');
      console.log('All mock responses cleared');
    } catch (error) {
      console.error('Error clearing mock responses:', error);
    }
  }
};

/**
 * API service registry for common services
 */
const apiServices = {
  /**
   * Register API keys from managed storage
   * @return {Promise<void>}
   */
  async initialize() {
    try {
      // Get API keys from storage
      const keys = await storageUtils.chrome.get('apiKeys');
      
      if (keys && keys.apiKeys) {
        Object.entries(keys.apiKeys).forEach(([apiId, apiKey]) => {
          apiRequest.setApiKey(apiId, apiKey);
        });
        console.log('API keys loaded successfully');
      }
    } catch (error) {
      console.error('Error initializing API services:', error);
    }
  },
  
  /**
   * Google Translate API wrapper
   */
  translate: {
    /**
     * Translate text
     * @param {string} text - Text to translate
     * @param {string} targetLang - Target language code
     * @param {string} [sourceLang='auto'] - Source language code
     * @return {Promise<Object>} Translation result
     */
    async translateText(text, targetLang, sourceLang = 'auto') {
      const apiKey = apiRequest.getApiKey('google_translate');
      
      if (!apiKey) {
        throw new ApiError(
          'Google Translate API key not configured',
          ERROR_TYPES.AUTH
        );
      }
      
      const url = 'https://translation.googleapis.com/language/translate/v2';
      
      return apiRequest.post(
        url,
        {
          q: text,
          target: targetLang,
          source: sourceLang !== 'auto' ? sourceLang : undefined,
          format: 'text'
        },
        {
          apiId: 'google_translate',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );
    },
    
    /**
     * Detect language of text
     * @param {string} text - Text to analyze
     * @return {Promise<Object>} Detection result
     */
    async detectLanguage(text) {
      const apiKey = apiRequest.getApiKey('google_translate');
      
      if (!apiKey) {
        throw new ApiError(
          'Google Translate API key not configured',
          ERROR_TYPES.AUTH
        );
      }
      
      const url = 'https://translation.googleapis.com/language/translate/v2/detect';
      
      return apiRequest.post(
        url,
        {
          q: text
        },
        {
          apiId: 'google_translate',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );
    }
  },
  
  /**
   * Dictionary API wrapper
   */
  dictionary: {
    /**
     * Get word definition
     * @param {string} word - Word to look up
     * @param {string} [language='en'] - Language code
     * @return {Promise<Object>} Dictionary data
     */
    async getDefinition(word, language = 'en') {
      // Using Free Dictionary API (requires no API key)
      const url = `https://api.dictionaryapi.dev/api/v2/entries/${language}/${encodeURIComponent(word)}`;
      
      return apiRequest.get(url, {
        apiId: 'dictionary',
        useCache: true,
        cacheTTL: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }
  },
  
  /**
   * Claude API wrapper for AI summaries
   */
  claude: {
    /**
     * Generate summary with Claude
     * @param {string} content - Content to summarize
     * @param {Object} [options={}] - Summary options
     * @param {string} [options.style='standard'] - Summary style
     * @param {string} [options.length='medium'] - Summary length
     * @param {boolean} [options.humanize=true] - Apply humanization
     * @return {Promise<Object>} Summary result
     */
    async summarize(content, options = {}) {
      const {
        style = 'standard',
        length = 'medium',
        humanize = true
      } = options;
      
      const apiKey = apiRequest.getApiKey('claude');
      
      if (!apiKey) {
        throw new ApiError(
          'Claude API key not configured',
          ERROR_TYPES.AUTH
        );
      }
      
      // Determine length instruction
      let lengthInstruction;
      switch (length) {
        case 'brief': lengthInstruction = '1-2 paragraphs'; break;
        case 'medium': lengthInstruction = '3-5 paragraphs'; break;
        case 'comprehensive': lengthInstruction = '5+ paragraphs'; break;
        default: lengthInstruction = '3-5 paragraphs';
      }
      
      // Determine style instruction
      let styleInstruction;
      switch (style) {
        case 'standard': styleInstruction = 'Provide a neutral, balanced summary'; break;
        case 'simplified': styleInstruction = 'Provide a simplified summary in plain language'; break;
        case 'academic': styleInstruction = 'Provide an academic summary with formal language'; break;
        case 'explanatory': styleInstruction = 'Provide an explanatory summary that clarifies complex concepts'; break;
        default: styleInstruction = 'Provide a neutral, balanced summary';
      }
      
      // Add humanization if requested
      const humanizeInstruction = humanize ? 
        'Ensure the summary sounds natural and human-written.' : '';
      
      // Construct the prompt
      const prompt = `
        Summarize the following content in ${lengthInstruction}. 
        ${styleInstruction}.
        ${humanizeInstruction}
        
        Content to summarize:
        ${content}
      `;
      
      // Make request to Claude API
      const url = 'https://api.anthropic.com/v1/complete';
      
      return apiRequest.post(
        url,
        {
          prompt,
          model: "claude-1",
          max_tokens_to_sample: 2048,
          temperature: 0.7
        },
        {
          apiId: 'claude',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          useCache: true
        }
      );
    }
  },
  
  /**
   * Exchange rate API wrapper
   */
  exchangeRates: {
    /**
     * Get current exchange rates
     * @param {string} [baseCurrency='USD'] - Base currency
     * @return {Promise<Object>} Exchange rates
     */
    async getCurrentRates(baseCurrency = 'USD') {
      // Using ExchangeRate-API (free tier)
      const url = `https://open.er-api.com/v6/latest/${baseCurrency}`;
      
      return apiRequest.get(url, {
        apiId: 'exchange_rates',
        useCache: true,
        cacheTTL: 60 * 60 * 1000 // 1 hour
      });
    },
    
    /**
     * Convert amount between currencies
     * @param {number} amount - Amount to convert
     * @param {string} fromCurrency - Source currency code
     * @param {string} toCurrency - Target currency code
     * @return {Promise<Object>} Conversion result
     */
    async convertCurrency(amount, fromCurrency, toCurrency) {
      const rates = await this.getCurrentRates(fromCurrency);
      
      if (!rates || !rates.rates || !rates.rates[toCurrency]) {
        throw new ApiError(
          `Currency not available: ${toCurrency}`,
          ERROR_TYPES.NOT_FOUND
        );
      }
      
      const rate = rates.rates[toCurrency];
      const converted = amount * rate;
      
      return {
        amount,
        from: fromCurrency,
        to: toCurrency,
        rate,
        result: converted,
        timestamp: rates.time_last_update_unix
      };
    }
  },
  
  /**
   * Web Archive API wrapper
   */
  webArchive: {
    /**
     * Check if URL is archived
     * @param {string} url - URL to check
     * @return {Promise<Object>} Archive information
     */
    async checkArchive(url) {
      const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
      
      return apiRequest.get(apiUrl, {
        apiId: 'web_archive',
        useCache: true,
        cacheTTL: 24 * 60 * 60 * 1000 // 24 hours
      });
    },
    
    /**
     * Save URL to archive
     * @param {string} url - URL to archive
     * @return {Promise<Object>} Archive result
     */
    async saveToArchive(url) {
      const apiUrl = `https://web.archive.org/save/${url}`;
      
      // This is a special case as the response is not JSON
      try {
        const response = await fetch(apiUrl, {
          method: 'GET',
          redirect: 'follow'
        });
        
        if (!response.ok) {
          throw new ApiError(
            'Failed to archive URL',
            ERROR_TYPES.SERVER
          );
        }
        
        // Extract archive URL from response
        const archiveUrl = response.url;
        
        return {
          original_url: url,
          archive_url: archiveUrl,
          timestamp: Date.now()
        };
      } catch (error) {
        throw new ApiError(
          'Failed to archive URL',
          ERROR_TYPES.NETWORK,
          { url },
          null,
          error
        );
      }
    }
  }
};

/**
 * Combined API utilities
 */
const apiUtils = {
  // Request functionality
  request: apiRequest,
  
  // Rate limiting
  rateLimiter,
  
  // API services
  services: apiServices,
  
  // Error handling
  ApiError,
  ERROR_TYPES,
  
  /**
   * Initialize API utilities
   * @return {Promise<void>}
   */
  async init() {
    await apiServices.initialize();
  }
};

export default apiUtils;