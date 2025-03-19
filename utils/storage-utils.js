/**
 * Storage Utilities
 * Abstraction layer for storage operations, handling both chrome.storage and IndexedDB.
 * Provides versioning, migrations, error handling, and quota management.
 */

// Current schema version, increment when structure changes
const SCHEMA_VERSION = 1;

// Default configuration
const DEFAULT_CONFIG = {
  compressionThreshold: 10 * 1024, // 10KB
  retryAttempts: 3,
  retryDelay: 500,
  quotaWarningThreshold: 0.8 // 80% of quota
};

/**
 * Initialize Dexie.js database with proper schema versioning
 */
class StorageDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize the database
   * @return {Promise<Dexie>} Initialized database
   */
  async init() {
    if (this.initialized) return this.db;

    try {
      // Create database with schema versioning
      this.db = new Dexie('AllInOneBrowserHelper');
      
      // Define schema
      this.db.version(1).stores({
        settings: 'key',
        userData: 'key',
        cache: 'key, timestamp',
        features: 'id',
        notes: 'id, created, updated, tags',
        clipboard: 'id, timestamp, type'
      });
      
      // Open connection
      await this.db.open();
      this.initialized = true;
      
      // Migration handling
      const storedVersion = await this.getStoredVersion();
      if (storedVersion < SCHEMA_VERSION) {
        await this.migrate(storedVersion, SCHEMA_VERSION);
      }
      
      return this.db;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }
  
  /**
   * Get stored schema version from chrome.storage
   * @return {Promise<number>} Stored version or 0 if not found
   */
  async getStoredVersion() {
    try {
      const result = await chrome.storage.local.get('schemaVersion');
      return result.schemaVersion || 0;
    } catch (error) {
      console.error('Failed to get schema version:', error);
      return 0;
    }
  }
  
  /**
   * Migrate database schema
   * @param {number} fromVersion - Current version
   * @param {number} toVersion - Target version
   * @return {Promise<void>}
   */
  async migrate(fromVersion, toVersion) {
    console.log(`Migrating database from v${fromVersion} to v${toVersion}`);
    
    // Migration steps
    if (fromVersion < 1 && toVersion >= 1) {
      // First time setup or migration to v1
      // No previous schema to migrate
    }
    
    // Add future migration steps here
    // if (fromVersion < 2 && toVersion >= 2) { ... }
    
    // Update stored version
    await chrome.storage.local.set({ schemaVersion: toVersion });
    console.log(`Migration complete: now at v${toVersion}`);
  }
  
  /**
   * Ensure database is initialized
   * @return {Promise<Dexie>} Database instance
   */
  async ensureInit() {
    if (!this.initialized) {
      return await this.init();
    }
    return this.db;
  }
}

// Singleton database instance
const dbInstance = new StorageDatabase();

/**
 * Chrome Storage Wrapper
 */
const chromeStorage = {
  /**
   * Get items from chrome.storage with error handling and retries
   * @param {string|string[]|Object} keys - Keys to retrieve
   * @param {Object} options - Options
   * @param {boolean} [options.sync=false] - Use sync storage instead of local
   * @param {number} [options.retries=DEFAULT_CONFIG.retryAttempts] - Number of retry attempts
   * @return {Promise<Object>} Retrieved items
   */
  async get(keys, options = {}) {
    const { 
      sync = false, 
      retries = DEFAULT_CONFIG.retryAttempts 
    } = options;
    
    const storage = sync ? chrome.storage.sync : chrome.storage.local;
    let attempts = 0;
    
    while (attempts <= retries) {
      try {
        return await storage.get(keys);
      } catch (error) {
        attempts++;
        
        if (attempts > retries) {
          console.error('Storage get failed after retries:', error);
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay * attempts));
      }
    }
  },
  
  /**
   * Set items in chrome.storage with error handling and retries
   * @param {Object} items - Items to store
   * @param {Object} options - Options
   * @param {boolean} [options.sync=false] - Use sync storage instead of local
   * @param {number} [options.retries=DEFAULT_CONFIG.retryAttempts] - Number of retry attempts
   * @param {boolean} [options.compress=false] - Compress large values
   * @return {Promise<void>}
   */
  async set(items, options = {}) {
    const { 
      sync = false, 
      retries = DEFAULT_CONFIG.retryAttempts,
      compress = false
    } = options;
    
    // Check for quota limits before setting
    await this.checkQuota(items, sync);
    
    // Process items for storage
    const processedItems = compress ? 
      await this.processForStorage(items) : items;
    
    const storage = sync ? chrome.storage.sync : chrome.storage.local;
    let attempts = 0;
    
    while (attempts <= retries) {
      try {
        await storage.set(processedItems);
        return;
      } catch (error) {
        attempts++;
        
        if (attempts > retries) {
          console.error('Storage set failed after retries:', error);
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay * attempts));
      }
    }
  },
  
  /**
   * Remove items from chrome.storage
   * @param {string|string[]} keys - Keys to remove
   * @param {Object} options - Options
   * @param {boolean} [options.sync=false] - Use sync storage instead of local
   * @param {number} [options.retries=DEFAULT_CONFIG.retryAttempts] - Number of retry attempts
   * @return {Promise<void>}
   */
  async remove(keys, options = {}) {
    const { 
      sync = false, 
      retries = DEFAULT_CONFIG.retryAttempts 
    } = options;
    
    const storage = sync ? chrome.storage.sync : chrome.storage.local;
    let attempts = 0;
    
    while (attempts <= retries) {
      try {
        await storage.remove(keys);
        return;
      } catch (error) {
        attempts++;
        
        if (attempts > retries) {
          console.error('Storage remove failed after retries:', error);
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay * attempts));
      }
    }
  },
  
  /**
   * Clear all items from chrome.storage
   * @param {Object} options - Options
   * @param {boolean} [options.sync=false] - Use sync storage instead of local
   * @param {number} [options.retries=DEFAULT_CONFIG.retryAttempts] - Number of retry attempts
   * @return {Promise<void>}
   */
  async clear(options = {}) {
    const { 
      sync = false, 
      retries = DEFAULT_CONFIG.retryAttempts 
    } = options;
    
    const storage = sync ? chrome.storage.sync : chrome.storage.local;
    let attempts = 0;
    
    while (attempts <= retries) {
      try {
        await storage.clear();
        return;
      } catch (error) {
        attempts++;
        
        if (attempts > retries) {
          console.error('Storage clear failed after retries:', error);
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.retryDelay * attempts));
      }
    }
  },
  
  /**
   * Check storage quota and throw if limit would be exceeded
   * @param {Object} items - Items to be stored
   * @param {boolean} sync - Using sync storage
   * @return {Promise<void>} 
   */
  async checkQuota(items, sync) {
    try {
      const storage = sync ? chrome.storage.sync : chrome.storage.local;
      const { bytesInUse, quota } = await this.getQuotaInfo(sync);
      
      // Calculate additional bytes needed (estimate)
      const itemsSize = this.estimateStorageSize(items);
      const projectedUsage = bytesInUse + itemsSize;
      
      // Check if we would exceed quota
      if (projectedUsage > quota) {
        throw new Error(`Storage quota would be exceeded: ${projectedUsage} bytes needed, ${quota} bytes available`);
      }
      
      // Warn if close to quota
      if (projectedUsage > quota * DEFAULT_CONFIG.quotaWarningThreshold) {
        console.warn(`Storage usage high: ${projectedUsage}/${quota} bytes (${Math.round(projectedUsage/quota*100)}%)`);
      }
    } catch (error) {
      // If we can't check quota, log warning but continue
      console.warn('Failed to check storage quota:', error);
    }
  },
  
  /**
   * Get storage quota information
   * @param {boolean} sync - Using sync storage
   * @return {Promise<{bytesInUse: number, quota: number}>} Quota info
   */
  async getQuotaInfo(sync) {
    return new Promise((resolve, reject) => {
      const storage = sync ? chrome.storage.sync : chrome.storage.local;
      
      // Get bytes in use
      storage.getBytesInUse(null, (bytesInUse) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        // Get quota (different limits for sync vs local)
        const quota = sync ? chrome.storage.sync.QUOTA_BYTES : chrome.storage.local.QUOTA_BYTES;
        resolve({ bytesInUse, quota });
      });
    });
  },
  
  /**
   * Estimate size of object in bytes
   * @param {Object} obj - Object to estimate
   * @return {number} Estimated size in bytes
   */
  estimateStorageSize(obj) {
    const jsonStr = JSON.stringify(obj);
    // UTF-16 uses 2 bytes per character
    return jsonStr.length * 2;
  },
  
  /**
   * Process items for storage (compression for large items)
   * @param {Object} items - Items to process
   * @return {Object} Processed items
   */
  async processForStorage(items) {
    const processed = {};
    
    for (const [key, value] of Object.entries(items)) {
      if (value !== undefined) {
        // For large objects, consider compression
        const jsonValue = JSON.stringify(value);
        
        if (jsonValue.length > DEFAULT_CONFIG.compressionThreshold) {
          // In a real implementation, we would compress the data here
          // For now, we'll just mark it as potentially needing compression
          processed[key] = {
            _compressed: false, // Would be true if we implemented compression
            data: value
          };
          console.log(`Large object detected (${jsonValue.length} bytes): ${key}`);
        } else {
          processed[key] = value;
        }
      }
    }
    
    return processed;
  }
};

/**
 * IndexedDB Wrapper (using Dexie.js)
 */
const indexedDB = {
  /**
   * Get item from database
   * @param {string} table - Table name
   * @param {string|number} key - Item key
   * @return {Promise<any>} Retrieved item or undefined
   */
  async get(table, key) {
    try {
      const db = await dbInstance.ensureInit();
      return await db[table].get(key);
    } catch (error) {
      console.error(`Failed to get ${key} from ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Get multiple items from database
   * @param {string} table - Table name
   * @param {Array<string|number>} keys - Item keys
   * @return {Promise<Array>} Retrieved items
   */
  async getMany(table, keys) {
    try {
      const db = await dbInstance.ensureInit();
      return await db[table].bulkGet(keys);
    } catch (error) {
      console.error(`Failed to get multiple items from ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Get all items from table
   * @param {string} table - Table name
   * @param {Object} [options] - Query options
   * @param {Function} [options.filter] - Filter function
   * @param {string} [options.orderBy] - Property to order by
   * @param {boolean} [options.reverse] - Reverse order
   * @param {number} [options.limit] - Limit results
   * @param {number} [options.offset] - Offset results
   * @return {Promise<Array>} Retrieved items
   */
  async getAll(table, options = {}) {
    try {
      const db = await dbInstance.ensureInit();
      let query = db[table];
      
      // Apply ordering
      if (options.orderBy) {
        query = query.orderBy(options.orderBy);
        if (options.reverse) query = query.reverse();
      }
      
      // Apply offset and limit
      if (options.offset) query = query.offset(options.offset);
      if (options.limit) query = query.limit(options.limit);
      
      // Apply filter if provided
      if (options.filter && typeof options.filter === 'function') {
        return (await query.toArray()).filter(options.filter);
      }
      
      return await query.toArray();
    } catch (error) {
      console.error(`Failed to get all items from ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Put item in database (create or update)
   * @param {string} table - Table name
   * @param {Object} item - Item to store
   * @param {string|number} [key] - Optional key (if not included in item)
   * @return {Promise<string|number>} Inserted key
   */
  async put(table, item, key) {
    try {
      const db = await dbInstance.ensureInit();
      
      // If key provided separately, add it to item
      if (key !== undefined && !item.id) {
        item.id = key;
      }
      
      return await db[table].put(item);
    } catch (error) {
      console.error(`Failed to put item in ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Put multiple items in database
   * @param {string} table - Table name
   * @param {Array<Object>} items - Items to store
   * @return {Promise<Array>} Inserted keys
   */
  async putMany(table, items) {
    try {
      const db = await dbInstance.ensureInit();
      return await db[table].bulkPut(items);
    } catch (error) {
      console.error(`Failed to put multiple items in ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Delete item from database
   * @param {string} table - Table name
   * @param {string|number} key - Item key
   * @return {Promise<void>}
   */
  async delete(table, key) {
    try {
      const db = await dbInstance.ensureInit();
      await db[table].delete(key);
    } catch (error) {
      console.error(`Failed to delete ${key} from ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Delete multiple items from database
   * @param {string} table - Table name
   * @param {Array<string|number>} keys - Item keys
   * @return {Promise<void>}
   */
  async deleteMany(table, keys) {
    try {
      const db = await dbInstance.ensureInit();
      await db[table].bulkDelete(keys);
    } catch (error) {
      console.error(`Failed to delete multiple items from ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Delete all items from table
   * @param {string} table - Table name
   * @return {Promise<void>}
   */
  async clear(table) {
    try {
      const db = await dbInstance.ensureInit();
      await db[table].clear();
    } catch (error) {
      console.error(`Failed to clear table ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Find items matching query
   * @param {string} table - Table name
   * @param {Function} queryFn - Query function to find items
   * @return {Promise<Array>} Matching items
   */
  async find(table, queryFn) {
    try {
      const db = await dbInstance.ensureInit();
      return await db[table].filter(queryFn).toArray();
    } catch (error) {
      console.error(`Failed to find items in ${table}:`, error);
      throw error;
    }
  },
  
  /**
   * Count items in table
   * @param {string} table - Table name
   * @return {Promise<number>} Item count
   */
  async count(table) {
    try {
      const db = await dbInstance.ensureInit();
      return await db[table].count();
    } catch (error) {
      console.error(`Failed to count items in ${table}:`, error);
      throw error;
    }
  }
};

/**
 * Cache management utilities
 */
const cacheUtils = {
  /**
   * Cache expiration time in milliseconds (default: 1 hour)
   */
  EXPIRATION: 60 * 60 * 1000,
  
  /**
   * Set item in cache with expiration
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} [expiration=cacheUtils.EXPIRATION] - Cache duration in ms
   * @return {Promise<void>}
   */
  async set(key, value, expiration = this.EXPIRATION) {
    try {
      const timestamp = Date.now() + expiration;
      await indexedDB.put('cache', { key, value, timestamp });
    } catch (error) {
      console.error(`Failed to set cache for ${key}:`, error);
    }
  },
  
  /**
   * Get item from cache
   * @param {string} key - Cache key
   * @return {Promise<any>} Cached value or null if expired/not found
   */
  async get(key) {
    try {
      const item = await indexedDB.get('cache', key);
      
      // If not found or expired, return null
      if (!item || item.timestamp < Date.now()) {
        return null;
      }
      
      return item.value;
    } catch (error) {
      console.error(`Failed to get cache for ${key}:`, error);
      return null;
    }
  },
  
  /**
   * Clear expired cache items
   * @return {Promise<number>} Number of items cleared
   */
  async clearExpired() {
    try {
      const now = Date.now();
      const expiredItems = await indexedDB.find('cache', item => item.timestamp < now);
      
      if (expiredItems.length > 0) {
        const keys = expiredItems.map(item => item.key);
        await indexedDB.deleteMany('cache', keys);
      }
      
      return expiredItems.length;
    } catch (error) {
      console.error('Failed to clear expired cache:', error);
      return 0;
    }
  }
};

/**
 * Combined storage API
 */
const storageUtils = {
  // Chrome storage operations
  chrome: chromeStorage,
  
  // IndexedDB operations
  db: indexedDB,
  
  // Cache operations
  cache: cacheUtils,
  
  /**
   * Initialize storage
   * @return {Promise<void>}
   */
  async init() {
    try {
      // Initialize database
      await dbInstance.init();
      
      // Clear expired cache items
      await cacheUtils.clearExpired();
      
      console.log('Storage initialized successfully');
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      throw error;
    }
  }
};

export default storageUtils;