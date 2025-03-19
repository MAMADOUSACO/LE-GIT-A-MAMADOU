/**
 * DOM Utilities
 * Helper functions for DOM manipulation, element selection, and content injection.
 * Uses safe DOM manipulation patterns and DOMPurify for sanitization.
 */

// Ensure DOMPurify is available
const sanitize = (content) => {
    if (typeof DOMPurify === 'undefined') {
      console.warn('DOMPurify not loaded. Content sanitization skipped.');
      return content;
    }
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['a', 'b', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                     'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 
                     'td', 'th', 'thead', 'tr', 'ul'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'id', 'style', 'target', 'title', 'rel'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      USE_PROFILES: { html: true }
    });
  };
  
  /**
   * DOM Element Selection
   */
  const domUtils = {
    /**
     * Get element by ID with null check
     * @param {string} id - Element ID
     * @return {Element|null} DOM element or null if not found
     */
    getById(id) {
      return document.getElementById(id);
    },
  
    /**
     * Get elements by selector with fallback empty array
     * @param {string} selector - CSS selector
     * @param {Element} [context=document] - Context element
     * @return {Element[]} Array of DOM elements
     */
    queryAll(selector, context = document) {
      try {
        return Array.from(context.querySelectorAll(selector));
      } catch (error) {
        console.error(`Error selecting "${selector}":`, error);
        return [];
      }
    },
  
    /**
     * Get first element by selector with null check
     * @param {string} selector - CSS selector
     * @param {Element} [context=document] - Context element
     * @return {Element|null} DOM element or null if not found
     */
    query(selector, context = document) {
      try {
        return context.querySelector(selector);
      } catch (error) {
        console.error(`Error selecting "${selector}":`, error);
        return null;
      }
    },
  
    /**
     * Check if element exists
     * @param {string} selector - CSS selector
     * @param {Element} [context=document] - Context element
     * @return {boolean} Whether element exists
     */
    exists(selector, context = document) {
      return !!this.query(selector, context);
    },
  
    /**
     * DOM Content Creation and Manipulation
     */
  
    /**
     * Create DOM element with attributes and content
     * @param {string} tag - HTML tag name
     * @param {Object} [attrs={}] - Element attributes
     * @param {string|Element|Element[]} [content] - Element content
     * @return {Element} Created element
     */
    create(tag, attrs = {}, content) {
      const element = document.createElement(tag);
      
      // Set attributes
      Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'text') {
          element.textContent = value;
        } else if (key === 'html' && value) {
          element.innerHTML = sanitize(value);
        } else if (key === 'data' && typeof value === 'object') {
          Object.entries(value).forEach(([dataKey, dataValue]) => {
            element.dataset[dataKey] = dataValue;
          });
        } else if (key === 'class' && Array.isArray(value)) {
          element.classList.add(...value.filter(Boolean));
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(element.style, value);
        } else if (key === 'events' && typeof value === 'object') {
          Object.entries(value).forEach(([event, handler]) => {
            element.addEventListener(event, handler);
          });
        } else if (value !== null && value !== undefined) {
          element.setAttribute(key, value);
        }
      });
      
      // Add content
      if (content) {
        this.append(element, content);
      }
      
      return element;
    },
  
    /**
     * Append content to element
     * @param {Element} parent - Parent element
     * @param {string|Element|Element[]} content - Content to append
     * @return {Element} Parent element
     */
    append(parent, content) {
      if (!parent) return parent;
      
      if (typeof content === 'string') {
        if (content.trim().startsWith('<') && content.trim().endsWith('>')) {
          // Handle HTML string
          const temp = document.createElement('template');
          temp.innerHTML = sanitize(content);
          Array.from(temp.content.childNodes).forEach(node => {
            parent.appendChild(node);
          });
        } else {
          // Handle text string
          parent.appendChild(document.createTextNode(content));
        }
      } else if (content instanceof Element) {
        parent.appendChild(content);
      } else if (Array.isArray(content)) {
        content.forEach(item => this.append(parent, item));
      }
      
      return parent;
    },
  
    /**
     * Set safe HTML content (sanitized)
     * @param {Element} element - Target element
     * @param {string} html - HTML content
     * @return {Element} Target element
     */
    setHTML(element, html) {
      if (!element) return element;
      element.innerHTML = sanitize(html);
      return element;
    },
  
    /**
     * Set text content (safe)
     * @param {Element} element - Target element
     * @param {string} text - Text content
     * @return {Element} Target element
     */
    setText(element, text) {
      if (!element) return element;
      element.textContent = text;
      return element;
    },
  
    /**
     * Empty an element (remove all children)
     * @param {Element} element - Element to empty
     * @return {Element} Emptied element
     */
    empty(element) {
      if (!element) return element;
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      return element;
    },
  
    /**
     * Remove element from DOM
     * @param {Element|string} element - Element or selector
     * @return {boolean} Success status
     */
    remove(element) {
      if (typeof element === 'string') {
        element = this.query(element);
      }
      
      if (!element || !element.parentNode) return false;
      element.parentNode.removeChild(element);
      return true;
    },
  
    /**
     * Shadow DOM Management
     */
  
    /**
     * Create shadow root for element
     * @param {Element} element - Host element
     * @param {string} [mode='open'] - Shadow root mode
     * @return {ShadowRoot|null} Shadow root or null on error
     */
    createShadowRoot(element, mode = 'open') {
      if (!element) return null;
      
      try {
        return element.attachShadow({ mode });
      } catch (error) {
        console.error('Error creating shadow root:', error);
        return null;
      }
    },
  
    /**
     * Add styles to shadow root
     * @param {ShadowRoot} shadow - Shadow root
     * @param {string} css - CSS styles
     * @return {Element} Style element
     */
    addShadowStyles(shadow, css) {
      if (!shadow) return null;
      
      const style = document.createElement('style');
      style.textContent = css;
      shadow.appendChild(style);
      return style;
    },
  
    /**
     * Create an isolated element with shadow DOM
     * @param {string} tag - Host element tag
     * @param {Object} [attrs={}] - Host element attributes
     * @param {string} styles - CSS styles for shadow DOM
     * @param {string|Element|Element[]} content - Shadow root content
     * @return {Object} Object with host and shadow properties
     */
    createIsolatedElement(tag, attrs = {}, styles, content) {
      const host = this.create(tag, attrs);
      const shadow = this.createShadowRoot(host);
      
      if (shadow && styles) {
        this.addShadowStyles(shadow, styles);
      }
      
      if (shadow && content) {
        this.append(shadow, content);
      }
      
      return { host, shadow };
    },
  
    /**
     * Event handling with cleanup
     */
    
    /**
     * Element event handlers registry for cleanup
     * @private
     */
    _eventHandlers: new WeakMap(),
  
    /**
     * Add event listener with registration for cleanup
     * @param {Element} element - Target element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} [options] - Event options
     * @return {Function} Removal function
     */
    addEvent(element, event, handler, options) {
      if (!element) return () => {};
      
      element.addEventListener(event, handler, options);
      
      // Store for later cleanup
      if (!this._eventHandlers.has(element)) {
        this._eventHandlers.set(element, []);
      }
      
      const entry = { event, handler, options };
      this._eventHandlers.get(element).push(entry);
      
      // Return removal function
      return () => {
        element.removeEventListener(event, handler, options);
        const handlers = this._eventHandlers.get(element);
        const index = handlers.indexOf(entry);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      };
    },
  
    /**
     * Clean up all event listeners for an element
     * @param {Element} element - Element to clean up
     */
    cleanupEvents(element) {
      if (!element || !this._eventHandlers.has(element)) return;
      
      const handlers = this._eventHandlers.get(element);
      handlers.forEach(({ event, handler, options }) => {
        element.removeEventListener(event, handler, options);
      });
      
      this._eventHandlers.delete(element);
    },
  
    /**
     * Performance optimizations
     */
    
    /**
     * Perform operations in a requestAnimationFrame for performance
     * @param {Function} callback - Function to execute
     * @return {number} Request ID for cancellation
     */
    nextFrame(callback) {
      return window.requestAnimationFrame(callback);
    },
  
    /**
     * Cancel a scheduled animation frame
     * @param {number} requestId - Request ID from nextFrame
     */
    cancelFrame(requestId) {
      window.cancelAnimationFrame(requestId);
    },
  
    /**
     * Batch DOM operations for performance
     * @param {Function} callback - Function performing DOM operations
     */
    batchOperations(callback) {
      // Get layout properties to force reflow before changes
      const forceReflow = document.body.offsetHeight;
      
      // Execute operations
      callback();
    },
  
    /**
     * Use document fragment for batch insertions
     * @param {Function} callback - Function that appends to fragment
     * @param {Element} container - Container to append fragment to
     */
    withFragment(callback, container) {
      const fragment = document.createDocumentFragment();
      callback(fragment);
      container.appendChild(fragment);
    }
  };
  
  export default domUtils;