/**
 * UI Utilities
 * Helper functions for creating consistent interfaces, handling resizing, and theme management.
 * Provides responsive design helpers, focus management, and animation utilities.
 */

import domUtils from './dom-utils.js';

/**
 * Viewport and responsive design utilities
 */
const viewport = {
  /**
   * Get current viewport size
   * @return {Object} Width and height of viewport
   */
  getSize() {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  },

  /**
   * Get current viewport breakpoint
   * @return {string} Breakpoint name: 'xs', 'sm', 'md', 'lg', 'xl'
   */
  getBreakpoint() {
    const width = window.innerWidth;
    
    if (width < 576) return 'xs';
    if (width < 768) return 'sm';
    if (width < 992) return 'md';
    if (width < 1200) return 'lg';
    return 'xl';
  },

  /**
   * Check if current viewport matches a breakpoint
   * @param {string} breakpoint - Breakpoint to check ('xs', 'sm', 'md', 'lg', 'xl')
   * @param {string} [comparison='='] - Comparison type: '=', '<', '>', '<=', '>='
   * @return {boolean} Whether viewport matches breakpoint
   */
  matchesBreakpoint(breakpoint, comparison = '=') {
    const breakpoints = {
      xs: 0,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200
    };
    
    const currentWidth = window.innerWidth;
    const targetWidth = breakpoints[breakpoint];
    
    if (targetWidth === undefined) {
      console.error(`Invalid breakpoint: ${breakpoint}`);
      return false;
    }
    
    switch (comparison) {
      case '=': return this.getBreakpoint() === breakpoint;
      case '<': return currentWidth < targetWidth;
      case '>': return currentWidth >= breakpoints[this.getNextBreakpoint(breakpoint)];
      case '<=': return currentWidth < breakpoints[this.getNextBreakpoint(breakpoint)];
      case '>=': return currentWidth >= targetWidth;
      default:
        console.error(`Invalid comparison: ${comparison}`);
        return false;
    }
  },

  /**
   * Get next larger breakpoint
   * @param {string} breakpoint - Current breakpoint
   * @return {string} Next breakpoint or null if at largest
   */
  getNextBreakpoint(breakpoint) {
    const order = ['xs', 'sm', 'md', 'lg', 'xl'];
    const index = order.indexOf(breakpoint);
    
    if (index === -1 || index === order.length - 1) {
      return null;
    }
    
    return order[index + 1];
  }
};

/**
 * Resize handling with debouncing
 */
const resize = {
  /**
   * Active resize handlers
   * @private
   */
  _handlers: [],
  
  /**
   * Timeout ID for debouncing
   * @private
   */
  _timeout: null,
  
  /**
   * Whether resize listener is attached
   * @private
   */
  _initialized: false,
  
  /**
   * Default debounce delay in ms
   * @private
   */
  _defaultDelay: 150,
  
  /**
   * Initialize resize listener
   * @private
   */
  _init() {
    if (this._initialized) return;
    
    window.addEventListener('resize', () => this._handleResize());
    this._initialized = true;
  },
  
  /**
   * Handle resize event with debouncing
   * @private
   */
  _handleResize() {
    // Clear previous timeout
    if (this._timeout) {
      window.clearTimeout(this._timeout);
    }
    
    // Set new timeout
    this._timeout = window.setTimeout(() => {
      const size = viewport.getSize();
      const breakpoint = viewport.getBreakpoint();
      
      // Call all handlers with size and breakpoint
      this._handlers.forEach(handler => {
        try {
          handler.callback({
            width: size.width,
            height: size.height,
            breakpoint
          });
        } catch (error) {
          console.error('Error in resize handler:', error);
        }
      });
    }, this._defaultDelay);
  },
  
  /**
   * Add resize handler with debouncing
   * @param {Function} callback - Function to call on resize
   * @param {Object} [options] - Options
   * @param {number} [options.delay] - Custom debounce delay in ms
   * @return {Function} Function to remove handler
   */
  onResize(callback, options = {}) {
    // Initialize listener if needed
    this._init();
    
    const handler = {
      id: Date.now() + Math.random(),
      callback,
      delay: options.delay || this._defaultDelay
    };
    
    this._handlers.push(handler);
    
    // Return removal function
    return () => {
      const index = this._handlers.findIndex(h => h.id === handler.id);
      if (index !== -1) {
        this._handlers.splice(index, 1);
      }
    };
  },
  
  /**
   * Force trigger resize handlers immediately
   */
  triggerResize() {
    if (this._timeout) {
      window.clearTimeout(this._timeout);
    }
    
    const size = viewport.getSize();
    const breakpoint = viewport.getBreakpoint();
    
    this._handlers.forEach(handler => {
      try {
        handler.callback({
          width: size.width,
          height: size.height,
          breakpoint
        });
      } catch (error) {
        console.error('Error in resize handler:', error);
      }
    });
  }
};

/**
 * Accessibility and focus management
 */
const accessibility = {
  /**
   * Focus trap stack for nested focus traps
   * @private
   */
  _focusTraps: [],
  
  /**
   * Check if element is focusable
   * @param {Element} element - Element to check
   * @return {boolean} Whether element is focusable
   */
  isFocusable(element) {
    if (!element || element.disabled) return false;
    
    const focusableTags = ['a', 'button', 'input', 'textarea', 'select', 'details'];
    const specificSelectors = [
      '[tabindex]:not([tabindex="-1"])',
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'details:not([disabled])',
      '[contenteditable]'
    ];
    
    // Check tag name
    const tagName = element.tagName.toLowerCase();
    if (focusableTags.includes(tagName) && !element.disabled) {
      // Special case for a tag needing href
      if (tagName === 'a' && !element.hasAttribute('href')) {
        return false;
      }
      return true;
    }
    
    // Check specific selectors
    for (const selector of specificSelectors) {
      if (element.matches(selector)) {
        return true;
      }
    }
    
    return false;
  },
  
  /**
   * Get all focusable elements within container
   * @param {Element} container - Container element
   * @return {Element[]} Focusable elements
   */
  getFocusableElements(container) {
    if (!container) return [];
    
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'details:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]'
    ];
    
    // Get all matching elements
    const elements = domUtils.queryAll(focusableSelectors.join(','), container);
    
    // Filter visible elements
    return elements.filter(element => {
      // Check if element is visible
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  },
  
  /**
   * Create focus trap within container
   * @param {Element} container - Container element
   * @param {Object} [options] - Options
   * @param {boolean} [options.autoFocus=true] - Auto-focus first element
   * @param {boolean} [options.escapeDeactivates=true] - Deactivate on Escape key
   * @param {Function} [options.onActivate] - Callback when trap activates
   * @param {Function} [options.onDeactivate] - Callback when trap deactivates
   * @return {Object} Focus trap control object
   */
  createFocusTrap(container, options = {}) {
    const {
      autoFocus = true,
      escapeDeactivates = true,
      onActivate = null,
      onDeactivate = null
    } = options;
    
    // Store elements outside trap to restore focus later
    const previousActiveElement = document.activeElement;
    
    // Get focusable elements
    const focusableElements = this.getFocusableElements(container);
    
    // Create trap object
    const trap = {
      active: false,
      container,
      focusableElements,
      previousActiveElement,
      
      // Activate focus trap
      activate() {
        // Already active
        if (this.active) return;
        
        // Add to stack
        accessibility._focusTraps.push(this);
        
        // Mark as active
        this.active = true;
        
        // Auto-focus first element
        if (autoFocus && focusableElements.length > 0) {
          focusableElements[0].focus();
        }
        
        // Add key listeners
        this._handleKeyDown = this._handleKeyDown.bind(this);
        document.addEventListener('keydown', this._handleKeyDown);
        
        // Call activation callback
        if (onActivate) onActivate();
      },
      
      // Deactivate focus trap
      deactivate() {
        // Not active
        if (!this.active) return;
        
        // Remove from stack
        const index = accessibility._focusTraps.indexOf(this);
        if (index !== -1) {
          accessibility._focusTraps.splice(index, 1);
        }
        
        // Mark as inactive
        this.active = false;
        
        // Remove key listeners
        document.removeEventListener('keydown', this._handleKeyDown);
        
        // Restore previous focus
        if (this.previousActiveElement && this.previousActiveElement.focus) {
          this.previousActiveElement.focus();
        }
        
        // Call deactivation callback
        if (onDeactivate) onDeactivate();
      },
      
      // Update focusable elements (e.g., after DOM changes)
      updateElements() {
        this.focusableElements = accessibility.getFocusableElements(container);
      },
      
      // Handle key events
      _handleKeyDown(event) {
        // Only process if we're the active trap (top of stack)
        if (accessibility._focusTraps[accessibility._focusTraps.length - 1] !== this) {
          return;
        }
        
        // Handle escape key
        if (escapeDeactivates && event.key === 'Escape') {
          event.preventDefault();
          this.deactivate();
          return;
        }
        
        // Handle tab key
        if (event.key === 'Tab') {
          // Trap focus within container
          if (this.focusableElements.length === 0) {
            event.preventDefault();
            return;
          }
          
          const firstElement = this.focusableElements[0];
          const lastElement = this.focusableElements[this.focusableElements.length - 1];
          
          // Shift+Tab on first element -> move to last element
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } 
          // Tab on last element -> move to first element
          else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };
    
    return trap;
  }
};

/**
 * Theme management
 */
const theme = {
  /**
   * Theme modes
   */
  MODES: {
    LIGHT: 'light',
    DARK: 'dark',
    SYSTEM: 'system'
  },
  
  /**
   * Current theme mode
   * @private
   */
  _currentMode: null,
  
  /**
   * Theme change handlers
   * @private
   */
  _handlers: [],
  
  /**
   * Get current theme mode
   * @return {string} Theme mode: 'light', 'dark', or 'system'
   */
  getCurrentMode() {
    if (!this._currentMode) {
      // Try to get from localStorage
      try {
        const storedMode = localStorage.getItem('theme-mode');
        if (storedMode && Object.values(this.MODES).includes(storedMode)) {
          this._currentMode = storedMode;
        } else {
          this._currentMode = this.MODES.SYSTEM;
        }
      } catch (error) {
        console.error('Error accessing localStorage:', error);
        this._currentMode = this.MODES.SYSTEM;
      }
    }
    
    return this._currentMode;
  },
  
  /**
   * Get effective theme (resolves system preference)
   * @return {string} Effective theme: 'light' or 'dark'
   */
  getEffectiveTheme() {
    const mode = this.getCurrentMode();
    
    if (mode === this.MODES.SYSTEM) {
      return this._getSystemPreference();
    }
    
    return mode;
  },
  
  /**
   * Get system color scheme preference
   * @return {string} System preference: 'light' or 'dark'
   * @private
   */
  _getSystemPreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return this.MODES.DARK;
    }
    
    return this.MODES.LIGHT;
  },
  
  /**
   * Set theme mode
   * @param {string} mode - Theme mode: 'light', 'dark', or 'system'
   */
  setMode(mode) {
    if (!Object.values(this.MODES).includes(mode)) {
      console.error(`Invalid theme mode: ${mode}`);
      return;
    }
    
    const previousMode = this._currentMode;
    this._currentMode = mode;
    
    // Store in localStorage
    try {
      localStorage.setItem('theme-mode', mode);
    } catch (error) {
      console.error('Error storing theme in localStorage:', error);
    }
    
    // Apply theme
    this._applyTheme();
    
    // Notify handlers
    if (previousMode !== mode) {
      this._notifyHandlers();
    }
  },
  
  /**
   * Apply current theme to document
   * @private
   */
  _applyTheme() {
    const effectiveTheme = this.getEffectiveTheme();
    
    // Set data attribute on html element
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    
    // Add/remove class for legacy support
    if (effectiveTheme === this.MODES.DARK) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  },
  
  /**
   * Initialize theme system
   */
  init() {
    // Apply initial theme
    this._applyTheme();
    
    // Listen for system preference changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (this.getCurrentMode() === this.MODES.SYSTEM) {
          this._applyTheme();
          this._notifyHandlers();
        }
      });
    }
  },
  
  /**
   * Notify theme change handlers
   * @private
   */
  _notifyHandlers() {
    const mode = this.getCurrentMode();
    const effectiveTheme = this.getEffectiveTheme();
    
    this._handlers.forEach(handler => {
      try {
        handler({
          mode,
          effectiveTheme
        });
      } catch (error) {
        console.error('Error in theme change handler:', error);
      }
    });
  },
  
  /**
   * Add theme change handler
   * @param {Function} callback - Function to call on theme change
   * @return {Function} Function to remove handler
   */
  onChange(callback) {
    this._handlers.push(callback);
    
    // Return removal function
    return () => {
      const index = this._handlers.indexOf(callback);
      if (index !== -1) {
        this._handlers.splice(index, 1);
      }
    };
  }
};

/**
 * Animation utilities
 */
const animation = {
  /**
   * Default animation duration in ms
   */
  DEFAULT_DURATION: 300,
  
  /**
   * Default easing function
   */
  DEFAULT_EASING: 'ease-in-out',
  
  /**
   * Available easing functions
   */
  EASING: {
    LINEAR: 'linear',
    EASE: 'ease',
    EASE_IN: 'ease-in',
    EASE_OUT: 'ease-out',
    EASE_IN_OUT: 'ease-in-out'
  },
  
  /**
   * Fade in element
   * @param {Element} element - Element to animate
   * @param {Object} [options] - Animation options
   * @param {number} [options.duration=300] - Duration in ms
   * @param {string} [options.easing='ease-in-out'] - Easing function
   * @param {Function} [options.onComplete] - Callback on completion
   * @return {Promise} Promise resolving when animation completes
   */
  fadeIn(element, options = {}) {
    if (!element) return Promise.resolve();
    
    const {
      duration = this.DEFAULT_DURATION,
      easing = this.DEFAULT_EASING,
      onComplete = null
    } = options;
    
    return new Promise(resolve => {
      // Element already visible
      if (element.style.display !== 'none' && element.style.opacity !== '0') {
        if (onComplete) onComplete();
        resolve();
        return;
      }
      
      // Set initial state
      element.style.opacity = '0';
      element.style.display = '';
      
      // Force reflow
      void element.offsetWidth;
      
      // Set transition
      element.style.transition = `opacity ${duration}ms ${easing}`;
      
      // Start animation
      element.style.opacity = '1';
      
      // Handle completion
      const onTransitionEnd = () => {
        element.removeEventListener('transitionend', onTransitionEnd);
        element.style.transition = '';
        if (onComplete) onComplete();
        resolve();
      };
      
      element.addEventListener('transitionend', onTransitionEnd);
      
      // Fallback if transitionend doesn't fire
      setTimeout(onTransitionEnd, duration + 50);
    });
  },
  
  /**
   * Fade out element
   * @param {Element} element - Element to animate
   * @param {Object} [options] - Animation options
   * @param {number} [options.duration=300] - Duration in ms
   * @param {string} [options.easing='ease-in-out'] - Easing function
   * @param {boolean} [options.removeFromDOM=false] - Remove element after fade
   * @param {Function} [options.onComplete] - Callback on completion
   * @return {Promise} Promise resolving when animation completes
   */
  fadeOut(element, options = {}) {
    if (!element) return Promise.resolve();
    
    const {
      duration = this.DEFAULT_DURATION,
      easing = this.DEFAULT_EASING,
      removeFromDOM = false,
      onComplete = null
    } = options;
    
    return new Promise(resolve => {
      // Element already hidden
      if (element.style.display === 'none' || element.style.opacity === '0') {
        if (onComplete) onComplete();
        resolve();
        return;
      }
      
      // Set transition
      element.style.transition = `opacity ${duration}ms ${easing}`;
      
      // Start animation
      element.style.opacity = '0';
      
      // Handle completion
      const onTransitionEnd = () => {
        element.removeEventListener('transitionend', onTransitionEnd);
        element.style.transition = '';
        
        if (removeFromDOM) {
          element.remove();
        } else {
          element.style.display = 'none';
        }
        
        if (onComplete) onComplete();
        resolve();
      };
      
      element.addEventListener('transitionend', onTransitionEnd);
      
      // Fallback if transitionend doesn't fire
      setTimeout(onTransitionEnd, duration + 50);
    });
  },
  
  /**
   * Slide down element (height transition)
   * @param {Element} element - Element to animate
   * @param {Object} [options] - Animation options
   * @param {number} [options.duration=300] - Duration in ms
   * @param {string} [options.easing='ease-in-out'] - Easing function
   * @param {Function} [options.onComplete] - Callback on completion
   * @return {Promise} Promise resolving when animation completes
   */
  slideDown(element, options = {}) {
    if (!element) return Promise.resolve();
    
    const {
      duration = this.DEFAULT_DURATION,
      easing = this.DEFAULT_EASING,
      onComplete = null
    } = options;
    
    return new Promise(resolve => {
      // Element already visible
      if (element.style.display !== 'none' && element.style.height !== '0px' && !element.classList.contains('collapsed')) {
        if (onComplete) onComplete();
        resolve();
        return;
      }
      
      // Get natural height
      element.style.display = 'block';
      element.style.height = 'auto';
      element.style.overflow = 'hidden';
      const height = element.offsetHeight;
      
      // Set initial state
      element.style.height = '0px';
      
      // Force reflow
      void element.offsetWidth;
      
      // Set transition
      element.style.transition = `height ${duration}ms ${easing}`;
      
      // Start animation
      element.style.height = `${height}px`;
      element.classList.remove('collapsed');
      
      // Handle completion
      const onTransitionEnd = () => {
        element.removeEventListener('transitionend', onTransitionEnd);
        element.style.transition = '';
        element.style.height = 'auto';
        element.style.overflow = '';
        if (onComplete) onComplete();
        resolve();
      };
      
      element.addEventListener('transitionend', onTransitionEnd);
      
      // Fallback if transitionend doesn't fire
      setTimeout(onTransitionEnd, duration + 50);
    });
  },
  
  /**
   * Slide up element (height transition)
   * @param {Element} element - Element to animate
   * @param {Object} [options] - Animation options
   * @param {number} [options.duration=300] - Duration in ms
   * @param {string} [options.easing='ease-in-out'] - Easing function
   * @param {boolean} [options.removeFromDOM=false] - Remove element after slide
   * @param {Function} [options.onComplete] - Callback on completion
   * @return {Promise} Promise resolving when animation completes
   */
  slideUp(element, options = {}) {
    if (!element) return Promise.resolve();
    
    const {
      duration = this.DEFAULT_DURATION,
      easing = this.DEFAULT_EASING,
      removeFromDOM = false,
      onComplete = null
    } = options;
    
    return new Promise(resolve => {
      // Element already hidden
      if (element.style.display === 'none' || element.style.height === '0px' || element.classList.contains('collapsed')) {
        if (onComplete) onComplete();
        resolve();
        return;
      }
      
      // Get current height
      const height = element.offsetHeight;
      
      // Set initial state
      element.style.height = `${height}px`;
      element.style.overflow = 'hidden';
      
      // Force reflow
      void element.offsetWidth;
      
      // Set transition
      element.style.transition = `height ${duration}ms ${easing}`;
      
      // Start animation
      element.style.height = '0px';
      element.classList.add('collapsed');
      
      // Handle completion
      const onTransitionEnd = () => {
        element.removeEventListener('transitionend', onTransitionEnd);
        element.style.transition = '';
        
        if (removeFromDOM) {
          element.remove();
        } else {
          element.style.display = 'none';
          element.style.height = '';
        }
        
        element.style.overflow = '';
        
        if (onComplete) onComplete();
        resolve();
      };
      
      element.addEventListener('transitionend', onTransitionEnd);
      
      // Fallback if transitionend doesn't fire
      setTimeout(onTransitionEnd, duration + 50);
    });
  },
  
  /**
   * Toggle slide (up/down)
   * @param {Element} element - Element to animate
   * @param {Object} [options] - Animation options
   * @param {number} [options.duration=300] - Duration in ms
   * @param {string} [options.easing='ease-in-out'] - Easing function
   * @param {Function} [options.onComplete] - Callback on completion
   * @return {Promise} Promise resolving when animation completes
   */
  slideToggle(element, options = {}) {
    if (!element) return Promise.resolve();
    
    const isVisible = element.style.display !== 'none' && 
                      element.style.height !== '0px' && 
                      !element.classList.contains('collapsed');
    
    if (isVisible) {
      return this.slideUp(element, options);
    } else {
      return this.slideDown(element, options);
    }
  }
};

/**
 * Combined UI utilities
 */
const uiUtils = {
  // Viewport and responsive design
  viewport,
  
  // Resize handling
  resize,
  
  // Accessibility helpers
  a11y: accessibility,
  
  // Theme management
  theme,
  
  // Animation utilities
  animation,
  
  /**
   * Initialize UI utilities
   */
  init() {
    // Initialize theme
    this.theme.init();
  }
};

export default uiUtils;