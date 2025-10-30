/**
 * AWS What's New RSS Feed Fetcher
 *
 * Fetches latest AWS What's New announcements from official RSS feed
 * Parses RSS XML and returns structured JSON data
 *
 * @see docs/AWS_WHATS_NEW_FETCHER_DESIGN.md for detailed design
 */

const xml2js = require('xml2js');
const he = require('he');

class WhatsNewFetcher {
  constructor(rssUrl = 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', daysToInclude = 14, maxItems = 100) {
    this.rssUrl = rssUrl;
    this.daysToInclude = daysToInclude;
    this.maxItems = maxItems;
    this.parser = new xml2js.Parser();
  }

  /**
   * Fetch RSS feed from AWS
   * @returns {Promise<string>} Raw XML content
   */
  async fetchFeed() {
    console.log(`🌐 Fetching RSS feed from: ${this.rssUrl}`);

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.rssUrl, {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const xmlContent = await response.text();
        console.log(`✅ Fetched ${(xmlContent.length / 1024).toFixed(1)} KB of RSS data`);
        return xmlContent;

      } catch (error) {
        console.error(`⚠️  Fetch attempt ${attempt}/${maxRetries} failed:`, error.message);

        if (attempt === maxRetries) {
          throw new Error(`Failed to fetch RSS feed after ${maxRetries} attempts: ${error.message}`);
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = 1000 * Math.pow(2, attempt - 1);
        console.log(`   Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  /**
   * Parse XML content to JavaScript object
   * @param {string} xmlContent - Raw XML string
   * @returns {Promise<Object>} Parsed RSS data
   */
  async parseXML(xmlContent) {
    console.log('📋 Parsing XML content...');

    try {
      const rssData = await this.parser.parseStringPromise(xmlContent);

      if (!rssData || !rssData.rss || !rssData.rss.channel) {
        throw new Error('Invalid RSS structure: missing channel element');
      }

      const channel = rssData.rss.channel[0];
      const items = channel.item || [];

      console.log(`✅ Parsed ${items.length} items from RSS feed`);

      return {
        channel: {
          title: channel.title?.[0] || 'AWS What\'s New',
          link: channel.link?.[0] || '',
          description: channel.description?.[0] || '',
          lastBuildDate: channel.lastBuildDate?.[0] || null
        },
        items
      };

    } catch (error) {
      throw new Error(`XML parsing failed: ${error.message}`);
    }
  }

  /**
   * Process and format RSS items
   * @param {Array} items - Raw RSS items
   * @param {string} feedLastBuildDate - Feed's last build date
   * @returns {Object} Formatted output
   */
  processItems(items, feedLastBuildDate) {
    console.log(`🔄 Processing items (last ${this.daysToInclude} days, max ${this.maxItems} items)...`);

    // Calculate date threshold (N days ago)
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - this.daysToInclude);
    console.log(`   Date threshold: ${dateThreshold.toISOString()} (${this.daysToInclude} days ago)`);

    // Sort by publication date (most recent first)
    const sortedItems = items.sort((a, b) => {
      const dateA = new Date(a.pubDate?.[0] || 0);
      const dateB = new Date(b.pubDate?.[0] || 0);
      return dateB - dateA; // Descending order
    });

    // Filter items within time window
    const recentItems = sortedItems.filter(item => {
      const pubDate = new Date(item.pubDate?.[0] || 0);
      return pubDate >= dateThreshold;
    });

    console.log(`   Items within ${this.daysToInclude}-day window: ${recentItems.length}`);

    // Apply maximum item cap (safety limit)
    const limitedItems = recentItems.slice(0, this.maxItems);

    if (recentItems.length > this.maxItems) {
      console.log(`   ⚠️  Capped at ${this.maxItems} items (${recentItems.length - this.maxItems} items excluded)`);
    }

    // Process each item
    const announcements = limitedItems.map(item => {
      try {
        return this.formatAnnouncement(item);
      } catch (error) {
        console.warn('⚠️  Skipping malformed item:', error.message);
        return null;
      }
    }).filter(item => item !== null); // Remove failed items

    console.log(`✅ Processed ${announcements.length} announcements`);

    return {
      metadata: {
        timestamp: new Date().toISOString(),
        source: this.rssUrl,
        feedLastBuildDate: feedLastBuildDate,
        tool: 'aws-whats-new-fetcher',
        version: '1.1.0',
        count: announcements.length,
        daysIncluded: this.daysToInclude,
        maxItemsCap: this.maxItems,
        dateThreshold: dateThreshold.toISOString()
      },
      announcements
    };
  }

  /**
   * Format a single announcement
   * @param {Object} item - Raw RSS item
   * @returns {Object} Formatted announcement
   */
  formatAnnouncement(item) {
    // Extract required fields with validation
    const guid = item.guid?.[0]?._ || item.guid?.[0] || '';
    const title = item.title?.[0] || '';
    const link = item.link?.[0] || '';
    const pubDateRaw = item.pubDate?.[0] || '';
    const categoryRaw = item.category?.[0] || '';
    const descriptionRaw = item.description?.[0] || '';

    if (!guid || !title || !link) {
      throw new Error('Missing required fields (guid, title, or link)');
    }

    // Parse publication date
    const pubDate = new Date(pubDateRaw);
    if (isNaN(pubDate.getTime())) {
      throw new Error(`Invalid publication date: ${pubDateRaw}`);
    }

    // Parse categories
    const categories = categoryRaw
      .split(',')
      .map(cat => cat.trim().toLowerCase())
      .filter(cat => cat.length > 0);

    // Sanitize HTML content
    const htmlContent = this.sanitizeHTML(descriptionRaw);

    // Generate plain text summary
    const summary = this.generateSummary(htmlContent);

    return {
      id: guid,
      title: title.trim(),
      summary,
      link: link.trim(),
      pubDate: pubDate.toISOString(),
      pubDateFormatted: this.formatDate(pubDate),
      categories,
      htmlContent
    };
  }

  /**
   * Sanitize HTML content (remove dangerous tags)
   * @param {string} htmlString - Raw HTML string
   * @returns {string} Sanitized HTML
   */
  sanitizeHTML(htmlString) {
    if (!htmlString) return '';

    // Decode HTML entities
    let sanitized = he.decode(htmlString);

    // Remove dangerous tags (script, iframe, object, embed)
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed\b[^<]*>/gi, '');

    // Remove inline event handlers (onclick, onerror, etc.)
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Generate plain text summary from HTML
   * @param {string} htmlContent - HTML content
   * @param {number} maxLength - Maximum length
   * @returns {string} Plain text summary
   */
  generateSummary(htmlContent, maxLength = 200) {
    if (!htmlContent) return '';

    // Strip HTML tags
    let text = htmlContent.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = he.decode(text);

    // Collapse multiple spaces
    text = text.replace(/\s+/g, ' ');

    // Trim
    text = text.trim();

    // Truncate if needed
    if (text.length > maxLength) {
      text = text.substring(0, maxLength).trim();

      // Find last complete word
      const lastSpace = text.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.8) { // Only if we're not cutting too much
        text = text.substring(0, lastSpace);
      }

      text += '...';
    }

    return text;
  }

  /**
   * Format date for human reading
   * @param {Date} date - Date object
   * @returns {string} Formatted date (e.g., "Oct 29, 2025")
   */
  formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Run the complete fetch and parse process
   * @returns {Promise<Object>} Formatted JSON output
   */
  async run() {
    const startTime = Date.now();
    console.log('🚀 Starting AWS What\'s New RSS fetch...');

    try {
      // 1. Fetch RSS feed
      const xmlContent = await this.fetchFeed();

      // 2. Parse XML
      const { channel, items } = await this.parseXML(xmlContent);

      // 3. Process and format items
      const output = this.processItems(items, channel.lastBuildDate);

      const duration = Date.now() - startTime;
      console.log(`✅ Fetch completed successfully in ${duration}ms`);
      console.log(`   Announcements: ${output.announcements.length}`);
      console.log(`   Feed build date: ${output.metadata.feedLastBuildDate}`);

      return output;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Fetch failed after ${duration}ms:`, error.message);
      throw error;
    }
  }
}

module.exports = WhatsNewFetcher;
