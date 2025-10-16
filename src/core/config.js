/**
 * AWS SSM Data Fetcher - Configuration
 *
 * Edit these values directly to optimize performance for your AWS account.
 * Changes take effect immediately on next run.
 */

module.exports = {
  // =============================================================================
  // AWS Configuration
  // =============================================================================
  aws: {
    /**
     * AWS region to use for SSM API calls
     * Default: 'us-east-1'
     */
    region: "us-east-1",
  },

  // =============================================================================
  // Cache Configuration
  // =============================================================================
  cache: {
    /**
     * Directory for output files
     * Default: './output'
     */
    outputDir: "./output",

    /**
     * Cache file name (will be placed in outputDir)
     * Default: '.cache-services-by-region.json'
     */
    cacheFileName: ".cache-services-by-region.json",

    /**
     * Cache TTL (Time To Live) in milliseconds
     * Default: 24 hours (86400000 ms)
     */
    cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
  },

  // =============================================================================
  // SSM API Configuration
  // =============================================================================
  ssm: {
    /**
     * Maximum number of retries for failed SSM API calls
     * Default: 5
     */
    maxRetries: 5,

    /**
     * Base delay in milliseconds for retry backoff
     * Default: 50ms
     *
     * Actual delay uses exponential backoff: baseDelay * 2^retryCount
     */
    baseDelay: 50,

    /**
     * Maximum results per page for GetParametersByPath
     * Default: 10 (AWS maximum - cannot be changed)
     */
    maxResults: 10,

    /**
     * Delay between pagination requests in milliseconds
     * Default: 50ms
     *
     * ⚡ PERFORMANCE TUNING:
     * - 50ms = Safe, conservative (current default)
     * - 40ms = Balanced, good for most accounts
     * - 30ms = Aggressive, may hit rate limits
     * - 25ms = Very aggressive, high risk of throttling
     *
     * Lower values = faster execution but more risk of ThrottlingException
     */
    paginationDelay: 40,
  },

  // =============================================================================
  // Parallel Processing Configuration
  // =============================================================================
  parallelProcessing: {
    /**
     * Batch size for parallel AZ (Availability Zone) mapping
     * Default: 20
     *
     * Number of AZs to process in parallel (122 total AZs)
     * Higher = faster but more load on AWS API
     * Safe range: 10-30
     */
    azBatchSize: 20,

    /**
     * Delay between AZ batches in milliseconds
     * Default: 100ms
     */
    azBatchDelay: 100,

    /**
     * Batch size for parallel region name fetching
     * Default: 10
     *
     * Number of regions to process in parallel (38 total regions)
     * Safe range: 10-20
     */
    regionNameBatchSize: 10,

    /**
     * Delay between region name batches in milliseconds
     * Default: 100ms
     */
    regionNameBatchDelay: 100,

    /**
     * Batch size for parallel service name fetching
     * Default: 20
     *
     * Number of services to process in parallel (395 total services)
     * Safe range: 15-30
     */
    serviceNameBatchSize: 20,

    /**
     * Delay between service name batches in milliseconds
     * Default: 100ms
     */
    serviceNameBatchDelay: 100,

    /**
     * Batch size for parallel service-by-region mapping
     * Default: 10
     *
     * ⚡ PRIMARY PERFORMANCE TUNING PARAMETER
     *
     * Number of regions to process in parallel (38 total regions)
     * Each region fetches ~1000 parameters (100+ pages)
     *
     * PERFORMANCE IMPACT (tested results):
     * - 10 = ~103 seconds (current, safe)         [4 batches]
     * - 12 = ~90 seconds (17% faster, low risk)   [4 batches]
     * - 15 = ~75 seconds (27% faster, med risk)   [3 batches]
     * - 20 = ~55 seconds (47% faster, high risk)  [2 batches]
     *
     * AWS rate limit: 40 TPS (Transactions Per Second) for SSM
     * Each region makes ~10 requests/second during pagination
     *
     * SAFE MAXIMUM: 12-15 regions in parallel
     * RISKY: >15 (may encounter ThrottlingException)
     *
     * ⚠️  Start with 10, increase by 2 and test. Monitor for throttling errors.
     */
    serviceByRegionBatchSize: 10,

    /**
     * Delay between service-by-region batches in milliseconds
     * Default: 0 (no delay between batches, only between pagination requests)
     */
    serviceByRegionBatchDelay: 0,
  },

  // =============================================================================
  // RSS Feed Configuration
  // =============================================================================
  rssFeed: {
    /**
     * AWS regions RSS feed URL
     */
    url: "https://docs.aws.amazon.com/global-infrastructure/latest/regions/regions.rss",

    /**
     * Maximum number of HTTP redirects to follow
     */
    maxRedirects: 5,

    /**
     * User-Agent header for RSS feed requests
     * Required to avoid CloudFront 403 errors
     */
    userAgent: "AWS-SSM-Data-Fetcher/1.4.0 (Node.js)",

    /**
     * Accept header for RSS feed requests
     */
    accept: "application/rss+xml, application/xml, text/xml, */*",
  },

  // =============================================================================
  // Performance Thresholds
  // =============================================================================
  performance: {
    /**
     * Threshold in milliseconds for "Excellent" performance rating (⚡)
     * Default: 60000 (60 seconds / 1 minute)
     */
    excellentThreshold: 60000,

    /**
     * Threshold in milliseconds for "Good" performance rating (⚠️)
     * Default: 120000 (120 seconds / 2 minutes)
     *
     * Runtime > this = 🐌 Slow
     * Runtime between excellent and this = ⚠️ Good
     * Runtime < excellent = ⚡ Excellent
     */
    goodThreshold: 120000,
  },
};

// =============================================================================
// QUICK START TUNING GUIDE
// =============================================================================
/*

Want faster performance? Edit these two parameters above:

1. serviceByRegionBatchSize (line ~150)
   - Change from 10 → 12 for ~17% speedup (low risk)
   - Change from 10 → 15 for ~27% speedup (medium risk)

2. paginationDelay (line ~72)
   - Change from 50 → 40 for ~10% speedup (low risk)
   - Change from 50 → 30 for ~20% speedup (higher risk)

EXAMPLE - Balanced Settings (recommended):
   serviceByRegionBatchSize: 12  (instead of 10)
   paginationDelay: 40           (instead of 50)
   Expected: ~85 seconds (17% faster than current 103s)

EXAMPLE - Aggressive Settings:
   serviceByRegionBatchSize: 15  (instead of 10)
   paginationDelay: 30           (instead of 50)
   Expected: ~70 seconds (32% faster than current 103s)

After editing, just run normally:
   npm run complete

If you see ThrottlingException errors:
   - Reduce serviceByRegionBatchSize by 2-3
   - Increase paginationDelay by 10-20ms
   - Test again

*/
