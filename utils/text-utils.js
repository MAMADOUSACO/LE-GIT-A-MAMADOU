/**
 * Text Utilities
 * Text processing utilities for case conversion, counting, analysis, and formatting.
 * Optimized for performance with large text blocks and proper Unicode support.
 */

// Ensure marked library is available
const hasMarked = typeof marked !== 'undefined';
if (!hasMarked) {
  console.warn('Marked.js not loaded. Markdown formatting will not be available.');
}

/**
 * Text case conversion utilities
 */
const caseConverter = {
  /**
   * Convert text to uppercase
   * @param {string} text - Input text
   * @return {string} Uppercase text
   */
  toUpperCase(text) {
    return String(text).toUpperCase();
  },

  /**
   * Convert text to lowercase
   * @param {string} text - Input text
   * @return {string} Lowercase text
   */
  toLowerCase(text) {
    return String(text).toLowerCase();
  },

  /**
   * Convert text to title case (capitalize first letter of each word)
   * @param {string} text - Input text
   * @param {boolean} [lowerRest=false] - Convert rest of each word to lowercase
   * @return {string} Title case text
   */
  toTitleCase(text, lowerRest = false) {
    return String(text).replace(/\w\S*/g, (word) => {
      const firstLetter = word.charAt(0).toUpperCase();
      const restOfWord = lowerRest ? word.substr(1).toLowerCase() : word.substr(1);
      return firstLetter + restOfWord;
    });
  },

  /**
   * Convert text to sentence case (capitalize first letter of each sentence)
   * @param {string} text - Input text
   * @param {boolean} [lowerRest=false] - Convert rest of each sentence to lowercase
   * @return {string} Sentence case text
   */
  toSentenceCase(text, lowerRest = false) {
    if (lowerRest) {
      text = String(text).toLowerCase();
    }
    
    return String(text)
      .replace(/(^\s*\w|[.!?]\s*\w)/g, match => match.toUpperCase());
  },

  /**
   * Convert text to camel case (e.g., camelCase)
   * @param {string} text - Input text
   * @return {string} Camel case text
   */
  toCamelCase(text) {
    return String(text)
      .replace(/\s+/g, ' ')
      .replace(/\s(.)/g, match => match.toUpperCase())
      .replace(/\s/g, '')
      .replace(/^(.)/, match => match.toLowerCase());
  },

  /**
   * Convert text to pascal case (e.g., PascalCase)
   * @param {string} text - Input text
   * @return {string} Pascal case text
   */
  toPascalCase(text) {
    return String(text)
      .replace(/\s+/g, ' ')
      .replace(/\s(.)/g, match => match.toUpperCase())
      .replace(/\s/g, '')
      .replace(/^(.)/, match => match.toUpperCase());
  },

  /**
   * Convert text to snake case (e.g., snake_case)
   * @param {string} text - Input text
   * @return {string} Snake case text
   */
  toSnakeCase(text) {
    return String(text)
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  },

  /**
   * Convert text to kebab case (e.g., kebab-case)
   * @param {string} text - Input text
   * @return {string} Kebab case text
   */
  toKebabCase(text) {
    return String(text)
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
  },

  /**
   * Detect the case of text
   * @param {string} text - Input text
   * @return {string} Case type: 'upper', 'lower', 'title', 'sentence', 'camel', 'pascal', 'snake', 'kebab', or 'mixed'
   */
  detectCase(text) {
    text = String(text).trim();
    
    if (!text) return 'empty';
    if (text === text.toUpperCase()) return 'upper';
    if (text === text.toLowerCase()) return 'lower';
    if (text.match(/^[A-Z][a-z0-9]+([A-Z][a-z0-9]+)*$/)) return 'pascal';
    if (text.match(/^[a-z][a-z0-9]+([A-Z][a-z0-9]+)*$/)) return 'camel';
    if (text.match(/^[a-z0-9]+(_[a-z0-9]+)*$/)) return 'snake';
    if (text.match(/^[a-z0-9]+(-[a-z0-9]+)*$/)) return 'kebab';
    
    // Check for title case
    const words = text.split(/\s+/);
    const isTitleCase = words.every(word => 
      word.charAt(0) === word.charAt(0).toUpperCase() && 
      word.substr(1) === word.substr(1).toLowerCase()
    );
    if (isTitleCase) return 'title';
    
    // Check for sentence case
    const sentences = text.split(/[.!?]+\s*/);
    const isSentenceCase = sentences.every(sentence => {
      if (!sentence) return true;
      return sentence.charAt(0) === sentence.charAt(0).toUpperCase();
    });
    if (isSentenceCase) return 'sentence';
    
    return 'mixed';
  }
};

/**
 * Text counting and analysis utilities
 */
const textAnalyzer = {
  /**
   * Count characters in text
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {boolean} [options.includeSpaces=true] - Include whitespace in count
   * @param {boolean} [options.includeNumbers=true] - Include numbers in count
   * @return {number} Character count
   */
  countCharacters(text, options = {}) {
    const { includeSpaces = true, includeNumbers = true } = options;
    
    text = String(text);
    
    if (!includeSpaces) {
      text = text.replace(/\s/g, '');
    }
    
    if (!includeNumbers) {
      text = text.replace(/\d/g, '');
    }
    
    return [...text].length; // Uses array spread to correctly count Unicode characters
  },

  /**
   * Count words in text
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {RegExp} [options.wordSeparator=/\s+/] - Word separator regex
   * @param {boolean} [options.includeNumbers=true] - Count numbers as words
   * @return {number} Word count
   */
  countWords(text, options = {}) {
    const { 
      wordSeparator = /\s+/,
      includeNumbers = true 
    } = options;
    
    text = String(text).trim();
    
    if (!text) return 0;
    
    // Filter out stand-alone numbers if includeNumbers is false
    const words = text.split(wordSeparator).filter(word => {
      if (!word) return false;
      if (!includeNumbers && /^\d+$/.test(word)) return false;
      return true;
    });
    
    return words.length;
  },

  /**
   * Count sentences in text
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {RegExp} [options.sentenceEnd=/[.!?]+/] - Sentence end regex
   * @return {number} Sentence count
   */
  countSentences(text, options = {}) {
    const { sentenceEnd = /[.!?]+/ } = options;
    
    text = String(text).trim();
    
    if (!text) return 0;
    
    // Split by sentence end markers and filter out empty strings
    const sentences = text.split(sentenceEnd).filter(Boolean);
    
    return sentences.length;
  },

  /**
   * Count paragraphs in text
   * @param {string} text - Input text
   * @return {number} Paragraph count
   */
  countParagraphs(text) {
    text = String(text).trim();
    
    if (!text) return 0;
    
    // Split by line breaks and filter out empty strings
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    
    return paragraphs.length;
  },

  /**
   * Estimate reading time in minutes
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {number} [options.wordsPerMinute=200] - Average reading speed
   * @param {boolean} [options.includeSeconds=false] - Include seconds in result
   * @return {number|string} Reading time in minutes or "mm:ss" format
   */
  estimateReadingTime(text, options = {}) {
    const { 
      wordsPerMinute = 200, 
      includeSeconds = false 
    } = options;
    
    const wordCount = this.countWords(text);
    const minutes = wordCount / wordsPerMinute;
    
    if (includeSeconds) {
      const mins = Math.floor(minutes);
      const seconds = Math.round((minutes - mins) * 60);
      return `${mins}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return Math.max(1, Math.ceil(minutes));
  },

  /**
   * Estimate speaking time in minutes
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {number} [options.wordsPerMinute=150] - Average speaking speed
   * @param {boolean} [options.includeSeconds=false] - Include seconds in result
   * @return {number|string} Speaking time in minutes or "mm:ss" format
   */
  estimateSpeakingTime(text, options = {}) {
    const { 
      wordsPerMinute = 150, 
      includeSeconds = false 
    } = options;
    
    const wordCount = this.countWords(text);
    const minutes = wordCount / wordsPerMinute;
    
    if (includeSeconds) {
      const mins = Math.floor(minutes);
      const seconds = Math.round((minutes - mins) * 60);
      return `${mins}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return Math.max(1, Math.ceil(minutes));
  },

  /**
   * Get detailed text statistics
   * @param {string} text - Input text
   * @return {Object} Text statistics
   */
  getTextStatistics(text) {
    const charCount = this.countCharacters(text);
    const charCountNoSpaces = this.countCharacters(text, { includeSpaces: false });
    const wordCount = this.countWords(text);
    const sentenceCount = this.countSentences(text);
    const paragraphCount = this.countParagraphs(text);
    const readingTime = this.estimateReadingTime(text);
    const speakingTime = this.estimateSpeakingTime(text);
    
    // Calculate average word length
    const avgWordLength = wordCount > 0 ? 
      charCountNoSpaces / wordCount : 0;
    
    // Calculate average sentence length
    const avgSentenceLength = sentenceCount > 0 ? 
      wordCount / sentenceCount : 0;
    
    // Calculate average paragraph length
    const avgParagraphLength = paragraphCount > 0 ? 
      sentenceCount / paragraphCount : 0;
    
    return {
      charCount,
      charCountNoSpaces,
      wordCount,
      sentenceCount,
      paragraphCount,
      readingTime,
      speakingTime,
      avgWordLength: parseFloat(avgWordLength.toFixed(1)),
      avgSentenceLength: parseFloat(avgSentenceLength.toFixed(1)),
      avgParagraphLength: parseFloat(avgParagraphLength.toFixed(1))
    };
  }
};

/**
 * Text formatting utilities
 */
const textFormatter = {
  /**
   * Convert plain text to HTML
   * @param {string} text - Plain text
   * @param {Object} [options] - Options
   * @param {boolean} [options.preserveWhitespace=false] - Preserve whitespace
   * @param {boolean} [options.preserveLineBreaks=true] - Convert line breaks to <br>
   * @return {string} HTML string
   */
  textToHtml(text, options = {}) {
    const { 
      preserveWhitespace = false, 
      preserveLineBreaks = true 
    } = options;
    
    text = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    if (preserveWhitespace) {
      text = text.replace(/ /g, '&nbsp;');
    }
    
    if (preserveLineBreaks) {
      text = text.replace(/\n/g, '<br>');
    }
    
    return text;
  },

  /**
   * Convert markdown to HTML
   * @param {string} markdown - Markdown text
   * @param {Object} [options] - Marked.js options
   * @return {string} HTML string
   */
  markdownToHtml(markdown, options = {}) {
    if (!hasMarked) {
      // Fallback to basic conversion if Marked not available
      return this.textToHtml(markdown);
    }
    
    return marked(markdown, {
      gfm: true,
      breaks: true,
      sanitize: true,
      ...options
    });
  },

  /**
   * Truncate text with ellipsis
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {number} [options.maxLength=100] - Maximum length
   * @param {string} [options.ellipsis='...'] - Ellipsis string
   * @param {boolean} [options.preserveWords=true] - Preserve whole words
   * @return {string} Truncated text
   */
  truncate(text, options = {}) {
    const { 
      maxLength = 100, 
      ellipsis = '...', 
      preserveWords = true 
    } = options;
    
    text = String(text);
    
    if (text.length <= maxLength) {
      return text;
    }
    
    if (preserveWords) {
      // Find the last space within the limit
      const truncated = text.substring(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');
      
      if (lastSpace > 0) {
        return text.substring(0, lastSpace) + ellipsis;
      }
    }
    
    return text.substring(0, maxLength) + ellipsis;
  },

  /**
   * Extract excerpt from text
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {number} [options.sentences=2] - Number of sentences
   * @param {number} [options.maxLength=250] - Maximum length
   * @param {string} [options.ellipsis='...'] - Ellipsis string
   * @return {string} Excerpt
   */
  excerpt(text, options = {}) {
    const { 
      sentences = 2, 
      maxLength = 250, 
      ellipsis = '...' 
    } = options;
    
    text = String(text).trim();
    
    if (!text) return '';
    
    // Extract specified number of sentences
    const sentenceRegex = /[^.!?]+[.!?]+/g;
    const sentenceMatches = text.match(sentenceRegex);
    
    if (!sentenceMatches) {
      return this.truncate(text, { maxLength, ellipsis });
    }
    
    const excerpt = sentenceMatches
      .slice(0, sentences)
      .join(' ')
      .trim();
    
    // Apply length limit if needed
    if (excerpt.length > maxLength) {
      return this.truncate(excerpt, { 
        maxLength, 
        ellipsis, 
        preserveWords: true 
      });
    }
    
    return excerpt;
  },

  /**
   * Extract keywords from text
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {number} [options.count=5] - Number of keywords
   * @param {string[]} [options.stopwords] - Stopwords to exclude
   * @return {string[]} Keywords
   */
  extractKeywords(text, options = {}) {
    const { 
      count = 5, 
      stopwords = DEFAULT_STOPWORDS 
    } = options;
    
    text = String(text).toLowerCase();
    
    // Calculate word frequencies
    const words = text.match(/\b\w{3,}\b/g) || [];
    const frequencies = {};
    
    for (const word of words) {
      if (!stopwords.includes(word)) {
        frequencies[word] = (frequencies[word] || 0) + 1;
      }
    }
    
    // Sort by frequency
    const sortedWords = Object.keys(frequencies).sort((a, b) => 
      frequencies[b] - frequencies[a]
    );
    
    return sortedWords.slice(0, count);
  },

  /**
   * Format number with commas as thousands separators
   * @param {number} number - Input number
   * @param {Object} [options] - Options
   * @param {number} [options.decimals=0] - Decimal places
   * @param {string} [options.decimalSeparator='.'] - Decimal separator
   * @param {string} [options.thousandsSeparator=','] - Thousands separator
   * @return {string} Formatted number
   */
  formatNumber(number, options = {}) {
    const { 
      decimals = 0, 
      decimalSeparator = '.', 
      thousandsSeparator = ',' 
    } = options;
    
    const parts = parseFloat(number).toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
    
    return parts.join(decimalSeparator);
  }
};

/**
 * Text extraction utilities
 */
const textExtractor = {
  /**
   * Extract main content from HTML
   * @param {string} html - HTML string
   * @return {string} Extracted content
   */
  extractContent(html) {
    // Create a virtual DOM element
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remove unwanted elements
    const elementsToRemove = [
      'script', 'style', 'iframe', 'nav', 'footer', 'header',
      'aside', 'form', '.ad', '.advertisement', '.banner', 
      '.social', '.comments', '.sidebar'
    ];
    
    elementsToRemove.forEach(selector => {
      const elements = tempDiv.querySelectorAll(selector);
      for (const element of elements) {
        element.remove();
      }
    });
    
    // Extract text content
    return tempDiv.textContent.trim().replace(/\s+/g, ' ');
  },

  /**
   * Extract title from HTML
   * @param {string} html - HTML string
   * @return {string} Extracted title
   */
  extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : '';
  },

  /**
   * Extract URLs from text
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {boolean} [options.unique=true] - Return unique URLs
   * @param {boolean} [options.withProtocol=true] - URLs must include protocol
   * @return {string[]} Extracted URLs
   */
  extractUrls(text, options = {}) {
    const { 
      unique = true, 
      withProtocol = true 
    } = options;
    
    const urlRegex = withProtocol ?
      /(https?:\/\/[^\s]+)/g :
      /(https?:\/\/[^\s]+)|([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*[^\s]*)/g;
    
    const urls = text.match(urlRegex) || [];
    
    return unique ? [...new Set(urls)] : urls;
  },

  /**
   * Extract email addresses from text
   * @param {string} text - Input text
   * @param {boolean} [unique=true] - Return unique email addresses
   * @return {string[]} Extracted email addresses
   */
  extractEmails(text, unique = true) {
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    const emails = text.match(emailRegex) || [];
    
    return unique ? [...new Set(emails)] : emails;
  }
};

/**
 * Text similarity and diffing utilities
 */
const textComparer = {
  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @return {number} Levenshtein distance
   */
  levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix = [];
    
    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,        // deletion
          matrix[i][j - 1] + 1,        // insertion
          matrix[i - 1][j - 1] + cost  // substitution
        );
      }
    }
    
    return matrix[b.length][a.length];
  },

  /**
   * Calculate similarity percentage between two strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @return {number} Similarity percentage (0-100)
   */
  calculateSimilarity(a, b) {
    if (a === b) return 100;
    if (a.length === 0 || b.length === 0) return 0;
    
    const distance = this.levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    const similarity = (1 - distance / maxLength) * 100;
    
    return parseFloat(similarity.toFixed(2));
  },

  /**
   * Find differences between two strings
   * @param {string} oldText - Original text
   * @param {string} newText - New text
   * @return {Object} Differences object with additions and deletions
   */
  findDifferences(oldText, newText) {
    const result = {
      additions: [],
      deletions: []
    };
    
    // Split into words for comparison
    const oldWords = oldText.split(/\s+/);
    const newWords = newText.split(/\s+/);
    
    // Find deletions
    for (const word of oldWords) {
      if (!newWords.includes(word)) {
        result.deletions.push(word);
      }
    }
    
    // Find additions
    for (const word of newWords) {
      if (!oldWords.includes(word)) {
        result.additions.push(word);
      }
    }
    
    return result;
  }
};

/**
 * Text sanitization and validation utilities
 */
const textSanitizer = {
  /**
   * Remove HTML tags from text
   * @param {string} html - HTML string
   * @return {string} Plain text
   */
  stripHtml(html) {
    return String(html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Remove special characters from text
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {boolean} [options.allowSpaces=true] - Allow spaces
   * @param {boolean} [options.allowNumbers=true] - Allow numbers
   * @param {string} [options.allowedChars=''] - Additional allowed characters
   * @return {string} Sanitized text
   */
  stripSpecialChars(text, options = {}) {
    const { 
      allowSpaces = true, 
      allowNumbers = true, 
      allowedChars = '' 
    } = options;
    
    let pattern = '[^a-zA-Z';
    
    if (allowNumbers) pattern += '0-9';
    if (allowSpaces) pattern += ' ';
    if (allowedChars) pattern += allowedChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    
    pattern += ']';
    
    const regex = new RegExp(pattern, 'g');
    return String(text).replace(regex, '');
  },

  /**
   * Escape HTML special characters
   * @param {string} text - Input text
   * @return {string} Escaped text
   */
  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Validate email address format
   * @param {string} email - Email address
   * @return {boolean} Validation result
   */
  isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  },

  /**
   * Validate URL format
   * @param {string} url - URL
   * @param {boolean} [requireProtocol=true] - Require protocol (http/https)
   * @return {boolean} Validation result
   */
  isValidUrl(url, requireProtocol = true) {
    if (requireProtocol) {
      return /^https?:\/\/[^\s]+/.test(url);
    }
    
    return /^(https?:\/\/)?[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*[^\s]*$/.test(url);
  }
};

// Default stopwords for keyword extraction
const DEFAULT_STOPWORDS = [
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'will', 'with', 'you', 'your', 'yours', 'yourself', 'yourselves'
];

/**
 * Combined text utilities
 */
const textUtils = {
  // Case conversion
  case: caseConverter,
  
  // Text analysis
  analyze: textAnalyzer,
  
  // Text formatting
  format: textFormatter,
  
  // Text extraction
  extract: textExtractor,
  
  // Text comparison
  compare: textComparer,
  
  // Text sanitization
  sanitize: textSanitizer,
  
  // Constants
  constants: {
    STOPWORDS: DEFAULT_STOPWORDS
  }
};

export default textUtils;