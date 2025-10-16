/**
 * AWS SSM Data Fetcher - Core Class
 *
 * Fetches AWS global infrastructure data from SSM Parameter Store
 * and saves it to local JSON files for analysis.
 */

const { SSMClient, GetParametersByPathCommand, GetParameterCommand } = require('@aws-sdk/client-ssm');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const config = require('./config');
const StorageFactory = require('../storage/storage-factory');

class AWSDataFetcher {
    constructor(region = config.aws.region, customConfig = {}) {
        // Allow config overrides via customConfig parameter
        this.config = customConfig;

        this.ssmClient = new SSMClient({ region });
        this.outputDir = customConfig.outputDir || config.cache.outputDir;
        this.cacheFile = path.join(this.outputDir, customConfig.cacheFileName || config.cache.cacheFileName);
        this.cacheTTL = customConfig.cacheTTL || config.cache.cacheTTL;

        // Initialize storage (S3 for Lambda, local for CLI)
        const storageType = process.env.STORAGE_TYPE || 'local';
        const storageOptions = {
            bucketName: process.env.S3_BUCKET_NAME,
            prefix: process.env.S3_PREFIX || 'aws-data',
            outputDir: this.outputDir
        };

        this.storage = StorageFactory.create(storageType, storageOptions);

        // Configuration overrides from environment (for Lambda)
        this.batchSize = parseInt(process.env.BATCH_SIZE) || config.parallelProcessing.serviceByRegionBatchSize;
        this.paginationDelay = parseInt(process.env.PAGINATION_DELAY) || config.ssm.paginationDelay;
    }

    /**
     * Ensure output directory exists (only for local storage)
     */
    async ensureOutputDir() {
        // Skip directory creation if using S3 storage
        const storageType = process.env.STORAGE_TYPE || 'local';
        if (storageType !== 'local') {
            console.log(chalk.gray('   Using S3 storage, skipping local directory creation'));
            return;
        }

        try {
            await fs.mkdir(this.outputDir, { recursive: true });
        } catch (error) {
            console.error(chalk.red('Failed to create output directory:', error.message));
            throw error;
        }
    }

    /**
     * Fetch and parse AWS regions RSS feed for launch dates and blog URLs
     */
    async fetchRegionLaunchData() {
        console.log(chalk.yellow('   📰 Fetching region launch data from RSS feed...'));

        const rssUrl = config.rssFeed.url;

        return new Promise((resolve, reject) => {
            const fetchWithRedirect = (url, redirectCount = 0) => {
                if (redirectCount > config.rssFeed.maxRedirects) {
                    console.warn(chalk.yellow('   ⚠️  Too many redirects, aborting RSS fetch'));
                    resolve({});
                    return;
                }

                const options = {
                    headers: {
                        'User-Agent': config.rssFeed.userAgent,
                        'Accept': config.rssFeed.accept
                    }
                };

                https.get(url, options, (res) => {
                    // Handle redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(chalk.gray(`   📰 Following redirect to: ${res.headers.location}`));
                        fetchWithRedirect(res.headers.location, redirectCount + 1);
                        return;
                    }

                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                    try {
                        const launchData = {};

                        // Extract all <item> entries from RSS
                        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
                        let itemMatch;

                        while ((itemMatch = itemRegex.exec(data)) !== null) {
                            const item = itemMatch[1];

                            // Extract region code from description (handle HTML entities)
                            const codeMatch = item.match(/&lt;code class="code"&gt;([a-z0-9-]+)&lt;\/code&gt;/);
                            if (!codeMatch) continue;

                            const regionCode = codeMatch[1];

                            // Extract link (blog post URL)
                            const linkMatch = item.match(/<link>(.*?)<\/link>/);
                            const blogUrl = linkMatch ? linkMatch[1].trim() : null;

                            // Extract publication date
                            const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
                            const launchDate = dateMatch ? dateMatch[1].trim() : null;

                            launchData[regionCode] = {
                                launchDate,
                                blogUrl
                            };
                        }

                        console.log(chalk.gray(`   📰 Found launch data for ${Object.keys(launchData).length} regions in RSS feed`));
                        resolve(launchData);
                    } catch (error) {
                        console.warn(chalk.yellow(`   ⚠️  Failed to parse RSS feed: ${error.message}`));
                        resolve({}); // Return empty object on parse error
                    }
                    });
                }).on('error', (error) => {
                    console.warn(chalk.yellow(`   ⚠️  Failed to fetch RSS feed: ${error.message}`));
                    resolve({}); // Return empty object on fetch error
                });
            };

            // Start the fetch
            fetchWithRedirect(rssUrl);
        });
    }

    /**
     * Fetch all parameters from a given SSM path with pagination and retry logic
     */
    async fetchAllSSMParameters(path, recursive = true, retryCount = 0) {
        const maxRetries = config.ssm.maxRetries;
        const baseDelay = config.ssm.baseDelay;

        if (retryCount === 0) {
            console.log(chalk.blue(`📡 Fetching SSM parameters from: ${path}`));
        }

        const allParameters = [];
        let nextToken = undefined;
        let pageCount = 0;

        try {
            do {
                const command = new GetParametersByPathCommand({
                    Path: path,
                    Recursive: recursive,
                    MaxResults: config.ssm.maxResults,
                    NextToken: nextToken
                });

                let response;
                let retries = 0;

                // Retry logic for individual requests
                while (retries <= 3) {
                    try {
                        response = await this.ssmClient.send(command);
                        break; // Success, exit retry loop
                    } catch (err) {
                        if ((err.name === 'ThrottlingException' || err.message.includes('Rate exceeded')) && retries < 3) {
                            retries++;
                            const backoffDelay = baseDelay * Math.pow(2, retries); // Exponential backoff
                            console.log(chalk.yellow(`   ⚠️  Rate limit hit, retry ${retries}/3 after ${backoffDelay}ms...`));
                            await new Promise(resolve => setTimeout(resolve, backoffDelay));
                        } else {
                            throw err; // Re-throw if not throttling or max retries reached
                        }
                    }
                }

                if (response.Parameters) {
                    allParameters.push(...response.Parameters);
                    console.log(chalk.gray(`   Page ${++pageCount}: +${response.Parameters.length} parameters (total: ${allParameters.length})`));
                }

                nextToken = response.NextToken;

                // Adaptive throttling delay (increases with retry count)
                if (nextToken) {
                    const delay = config.ssm.paginationDelay + (retryCount * 25);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } while (nextToken);

            console.log(chalk.green(`✅ Fetched ${allParameters.length} parameters from ${path}`));
            return allParameters;

        } catch (error) {
            // Retry entire fetch operation if rate limited
            if ((error.name === 'ThrottlingException' || error.message.includes('Rate exceeded')) && retryCount < maxRetries) {
                const retryDelay = baseDelay * Math.pow(2, retryCount + 1);
                console.log(chalk.yellow(`   ⚠️  Rate exceeded, retrying entire fetch after ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})...`));
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.fetchAllSSMParameters(path, recursive, retryCount + 1);
            }

            console.error(chalk.red(`❌ Failed to fetch parameters from ${path}:`, error.message));
            throw error;
        }
    }

    /**
     * Discover AWS regions from SSM parameters with long names and AZ counts
     */
    async discoverRegions() {
        console.log(chalk.yellow('🌍 Discovering AWS regions...'));

        const regionsPath = '/aws/service/global-infrastructure/regions';
        const parameters = await this.fetchAllSSMParameters(regionsPath, false);

        // Extract unique region codes
        const regionCodes = new Set();

        parameters.forEach(param => {
            const match = param.Name.match(/\/regions\/([a-z0-9-]+)$/);
            if (match) {
                regionCodes.add(match[1]);
            }
        });

        const regionCodesArray = Array.from(regionCodes).sort();

        console.log(chalk.green(`✅ Discovered ${regionCodesArray.length} regions from SSM`));
        console.log(chalk.yellow('   Fetching region names and AZ counts...'));

        // Fetch AZ data first to build region -> AZ count mapping
        console.log(chalk.yellow('   📍 Fetching availability zones...'));
        const azPath = '/aws/service/global-infrastructure/availability-zones';
        const azParameters = await this.fetchAllSSMParameters(azPath, false);

        // Extract AZ IDs
        const azIds = [];
        azParameters.forEach(param => {
            const match = param.Name.match(/\/availability-zones\/([a-z0-9-]+)$/);
            if (match) {
                azIds.push(match[1]);
            }
        });

        console.log(chalk.gray(`   📍 Found ${azIds.length} availability zones`));

        // Build map of region -> AZ count using parallel batch processing
        const regionAzCounts = {};
        console.log(chalk.yellow('   📍 Mapping AZs to regions in parallel...'));

        const azBatchSize = config.parallelProcessing.azBatchSize;

        for (let i = 0; i < azIds.length; i += azBatchSize) {
            const batch = azIds.slice(i, i + azBatchSize);

            const batchPromises = batch.map(async (azId) => {
                try {
                    const parentRegionPath = `/aws/service/global-infrastructure/availability-zones/${azId}/parent-region`;
                    const command = new GetParameterCommand({ Name: parentRegionPath });
                    const response = await this.ssmClient.send(command);
                    return { azId, parentRegion: response.Parameter?.Value };
                } catch (error) {
                    return { azId, parentRegion: null };
                }
            });

            const batchResults = await Promise.all(batchPromises);

            // Aggregate results
            batchResults.forEach(result => {
                if (result.parentRegion) {
                    regionAzCounts[result.parentRegion] = (regionAzCounts[result.parentRegion] || 0) + 1;
                }
            });

            // Progress indicator every 50 AZs
            if ((i + azBatchSize) % 50 === 0 || i + azBatchSize >= azIds.length) {
                console.log(chalk.gray(`   📍 Mapped ${Math.min(i + azBatchSize, azIds.length)}/${azIds.length} AZs...`));
            }

            // Small delay between batches
            if (i + azBatchSize < azIds.length) {
                await new Promise(resolve => setTimeout(resolve, config.parallelProcessing.azBatchDelay));
            }
        }

        console.log(chalk.green(`   ✅ Mapped ${azIds.length} AZs to ${Object.keys(regionAzCounts).length} regions`));

        // Fetch region launch data from RSS feed
        const launchData = await this.fetchRegionLaunchData();

        // Fetch long names for each region in parallel
        console.log(chalk.yellow('   📋 Fetching region names in parallel...'));
        const regionsWithNames = [];

        const regionNameBatchSize = config.parallelProcessing.regionNameBatchSize;

        for (let i = 0; i < regionCodesArray.length; i += regionNameBatchSize) {
            const batch = regionCodesArray.slice(i, i + regionNameBatchSize);

            const batchPromises = batch.map(async (regionCode) => {
                try {
                    const longNamePath = `/aws/service/global-infrastructure/regions/${regionCode}/longName`;
                    const command = new GetParameterCommand({ Name: longNamePath });
                    const response = await this.ssmClient.send(command);

                    const longName = response.Parameter?.Value || regionCode;
                    const azCount = regionAzCounts[regionCode] || 0;
                    const launch = launchData[regionCode];

                    return {
                        code: regionCode,
                        name: longName,
                        availabilityZones: azCount,
                        launchDate: launch?.launchDate || null,
                        blogUrl: launch?.blogUrl || null,
                        success: true
                    };
                } catch (error) {
                    const azCount = regionAzCounts[regionCode] || 0;
                    const launch = launchData[regionCode];

                    return {
                        code: regionCode,
                        name: regionCode,
                        availabilityZones: azCount,
                        launchDate: launch?.launchDate || null,
                        blogUrl: launch?.blogUrl || null,
                        success: false
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);

            // Add results and log progress
            batchResults.forEach(result => {
                regionsWithNames.push({
                    code: result.code,
                    name: result.name,
                    availabilityZones: result.availabilityZones,
                    launchDate: result.launchDate,
                    blogUrl: result.blogUrl
                });

                if (result.success) {
                    console.log(chalk.gray(`   ✅ ${result.code}: ${result.name} (${result.availabilityZones} AZs)`));
                } else {
                    console.log(chalk.gray(`   ℹ️  ${result.code}: ${result.code} (${result.availabilityZones} AZs, name not available)`));
                }
            });

            // Small delay between batches
            if (i + regionNameBatchSize < regionCodesArray.length) {
                await new Promise(resolve => setTimeout(resolve, config.parallelProcessing.regionNameBatchDelay));
            }
        }

        // Check for eu-west-3 specifically
        if (regionCodesArray.includes('eu-west-3')) {
            console.log(chalk.green('   ✅ eu-west-3 found in SSM regions'));
        } else {
            console.log(chalk.yellow('   ⚠️  eu-west-3 NOT found in SSM regions'));
        }

        return {
            count: regionsWithNames.length,
            regions: regionsWithNames,
            source: 'ssm',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Discover AWS services from SSM parameters with long names
     */
    async discoverServices() {
        console.log(chalk.yellow('🛠️  Discovering AWS services...'));

        const servicesPath = '/aws/service/global-infrastructure/services';
        const parameters = await this.fetchAllSSMParameters(servicesPath, false);

        // Extract unique service codes
        const serviceCodes = new Set();

        parameters.forEach(param => {
            const match = param.Name.match(/\/services\/([a-z0-9-]+)$/);
            if (match) {
                serviceCodes.add(match[1]);
            }
        });

        const serviceCodesArray = Array.from(serviceCodes).sort();

        console.log(chalk.green(`✅ Discovered ${serviceCodesArray.length} services from SSM`));
        console.log(chalk.yellow('   📋 Fetching service names in parallel from SSM...'));

        // Fetch long names for each service from SSM in parallel
        const servicesWithNames = [];
        const missingNames = [];

        const serviceNameBatchSize = config.parallelProcessing.serviceNameBatchSize;

        for (let i = 0; i < serviceCodesArray.length; i += serviceNameBatchSize) {
            const batch = serviceCodesArray.slice(i, i + serviceNameBatchSize);

            const batchPromises = batch.map(async (serviceCode) => {
                try {
                    const longNamePath = `/aws/service/global-infrastructure/services/${serviceCode}/longName`;
                    const command = new GetParameterCommand({ Name: longNamePath });
                    const response = await this.ssmClient.send(command);

                    return {
                        code: serviceCode,
                        name: response.Parameter?.Value || serviceCode,
                        success: true
                    };
                } catch (error) {
                    return {
                        code: serviceCode,
                        name: serviceCode,
                        success: false
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);

            // Add results and track missing names
            batchResults.forEach(result => {
                servicesWithNames.push({
                    code: result.code,
                    name: result.name
                });

                if (!result.success) {
                    missingNames.push(result.code);
                }
            });

            // Progress indicator every 100 services or at the end
            if ((i + serviceNameBatchSize) % 100 === 0 || i + serviceNameBatchSize >= serviceCodesArray.length) {
                console.log(chalk.gray(`   📋 Fetched ${Math.min(i + serviceNameBatchSize, serviceCodesArray.length)}/${serviceCodesArray.length} service names...`));
            }

            // Small delay between batches
            if (i + serviceNameBatchSize < serviceCodesArray.length) {
                await new Promise(resolve => setTimeout(resolve, config.parallelProcessing.serviceNameBatchDelay));
            }
        }

        console.log(chalk.green(`   ✅ Fetched ${serviceCodesArray.length} service names from SSM`));

        // Report any services that couldn't be fetched from SSM
        if (missingNames.length > 0) {
            console.log(chalk.yellow(`\n   ℹ️  ${missingNames.length} services had no SSM longName (using code as name):`));
            missingNames.forEach(code => {
                console.log(chalk.gray(`      - ${code}`));
            });
        }

        return {
            count: servicesWithNames.length,
            services: servicesWithNames,
            source: 'ssm',
            timestamp: new Date().toISOString()
        };
    }


    /**
     * Load cached service-by-region data
     */
    async loadCache() {
        return await this.storage.loadCache();
    }

    /**
     * Save service-by-region data to cache
     */
    async saveCache(data) {
        await this.storage.saveCache(data);
        console.log(chalk.gray(`   💾 Cached data saved for future use`));
    }

    /**
     * Check if cached region data is still valid (< 24 hours old)
     */
    isCacheValid(regionData) {
        if (!regionData || !regionData.lastFetched) {
            return false;
        }
        const age = Date.now() - new Date(regionData.lastFetched).getTime();
        return age < this.cacheTTL;
    }

    /**
     * Fetch services available in each region (with parallel batch processing and caching)
     */
    async fetchServicesByRegion(regions, services, forceRefresh = false) {
        console.log(chalk.yellow('🗺️  Fetching services by region...'));
        console.log(chalk.gray(`   This will query ${regions.length} regions for service availability`));

        // Load cache
        const cache = forceRefresh ? null : await this.loadCache();
        const servicesByRegion = {};
        let cachedRegions = 0;
        let staleRegions = [];

        // Check cache and identify regions that need fetching
        if (cache && cache.byRegion) {
            console.log(chalk.blue(`   📦 Checking cache (TTL: 24 hours)...`));

            for (const region of regions) {
                const cachedData = cache.byRegion[region];
                if (this.isCacheValid(cachedData)) {
                    servicesByRegion[region] = cachedData;
                    cachedRegions++;
                } else {
                    staleRegions.push(region);
                }
            }

            if (cachedRegions > 0) {
                console.log(chalk.green(`   ✅ Cache hit: ${cachedRegions}/${regions.length} regions (fresh)`));
            }
            if (staleRegions.length > 0) {
                console.log(chalk.yellow(`   ⏰ Cache miss: ${staleRegions.length}/${regions.length} regions need refresh`));
            }
        } else {
            if (forceRefresh) {
                console.log(chalk.blue(`   🔄 Force refresh requested, bypassing cache`));
            } else {
                console.log(chalk.blue(`   📭 No cache found, fetching all regions`));
            }
            staleRegions = [...regions];
        }

        // If all regions are cached, return early
        if (staleRegions.length === 0) {
            console.log(chalk.green(`   ✅ All ${cachedRegions} regions loaded from cache, no API calls needed!`));

            // Still need to generate summary
            const totalServices = services ? services.length : 0;
            const regionServiceCounts = Object.values(servicesByRegion).map(r => r.serviceCount);
            const avgServicesPerRegion = regionServiceCounts.length > 0
                ? Math.round(regionServiceCounts.reduce((a, b) => a + b, 0) / regionServiceCounts.length)
                : 0;

            return {
                byRegion: servicesByRegion,
                summary: {
                    totalRegions: regions.length,
                    totalServices: totalServices,
                    averageServicesPerRegion: avgServicesPerRegion,
                    cachedRegions: cachedRegions,
                    fetchedRegions: 0,
                    timestamp: new Date().toISOString()
                }
            };
        }

        const batchSize = config.parallelProcessing.serviceByRegionBatchSize;
        console.log(chalk.blue(`   ⚡ Using parallel processing with batch size of ${batchSize} (optimized for performance)`));
        console.log(chalk.white(`   📊 Fetching ${staleRegions.length} regions (${cachedRegions} from cache)...`));

        let processedRegions = 0;
        const startTime = Date.now();

        // Process a single region
        const processRegion = async (region) => {
            try {
                // Fetch all services for this region
                const regionServicesPath = `/aws/service/global-infrastructure/regions/${region}/services`;
                const parameters = await this.fetchAllSSMParameters(regionServicesPath, true);

                // Extract service codes from the parameters
                const regionServices = new Set();
                parameters.forEach(param => {
                    // Path format: /aws/service/global-infrastructure/regions/{region}/services/{service}
                    const match = param.Name.match(/\/services\/([a-z0-9-]+)$/);
                    if (match) {
                        regionServices.add(match[1]);
                    }
                });

                servicesByRegion[region] = {
                    regionCode: region,
                    serviceCount: regionServices.size,
                    services: Array.from(regionServices).sort(),
                    lastFetched: new Date().toISOString()
                };

                processedRegions++;

                // Calculate ETA
                const elapsed = Date.now() - startTime;
                const avgTimePerRegion = elapsed / processedRegions;
                const remainingRegions = regions.length - processedRegions;
                const etaMs = avgTimePerRegion * remainingRegions;
                const etaMin = Math.round(etaMs / 1000 / 60);
                const etaSec = Math.round((etaMs / 1000) % 60);
                const etaDisplay = etaMin > 0 ? `${etaMin}m ${etaSec}s` : `${etaSec}s`;

                console.log(chalk.gray(`   ✅ ${region}: ${regionServices.size} services (${processedRegions}/${regions.length}) | ETA: ${etaDisplay}`));

            } catch (error) {
                console.warn(chalk.yellow(`   ⚠️  Failed to fetch services for ${region}:`, error.message));
                servicesByRegion[region] = {
                    regionCode: region,
                    serviceCount: 0,
                    services: [],
                    error: error.message
                };
                processedRegions++;
            }
        };

        // Process stale regions in parallel batches
        for (let i = 0; i < staleRegions.length; i += batchSize) {
            const batch = staleRegions.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(staleRegions.length / batchSize);

            console.log(chalk.cyan(`\n   📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} regions in parallel)...`));

            // Process all regions in this batch in parallel
            await Promise.all(batch.map(region => processRegion(region)));
        }

        // Generate summary statistics
        const totalServices = services ? services.length : 0;
        const regionServiceCounts = Object.values(servicesByRegion).map(r => r.serviceCount);
        const avgServicesPerRegion = regionServiceCounts.length > 0
            ? Math.round(regionServiceCounts.reduce((a, b) => a + b, 0) / regionServiceCounts.length)
            : 0;

        console.log(chalk.green(`\n✅ Completed service mapping for ${regions.length} regions`));
        console.log(chalk.white(`   📍 Newly fetched: ${staleRegions.length} regions`));
        console.log(chalk.white(`   💾 From cache: ${cachedRegions} regions`));
        console.log(chalk.white(`   📊 Average services per region: ${avgServicesPerRegion}`));

        // Save cache for future use
        const cacheData = {
            byRegion: servicesByRegion,
            summary: {
                totalRegions: regions.length,
                totalServices: totalServices,
                averageServicesPerRegion: avgServicesPerRegion,
                cachedRegions: cachedRegions,
                fetchedRegions: staleRegions.length,
                timestamp: new Date().toISOString()
            }
        };

        await this.saveCache(cacheData);

        return cacheData;
    }

    /**
     * Save data to JSON file (uses storage abstraction)
     */
    async saveToFile(filename, data) {
        try {
            let filepath;

            // Route to appropriate storage method based on filename
            if (filename === 'regions.json') {
                filepath = await this.storage.saveRegions(data);
            } else if (filename === 'services.json') {
                filepath = await this.storage.saveServices(data);
            } else if (filename === 'complete-data.json') {
                filepath = await this.storage.saveComplete(data);
            } else {
                // Fallback for local storage
                filepath = path.join(this.outputDir, filename);
                await fs.writeFile(filepath, JSON.stringify(data, null, 2));
                console.log(chalk.green(`💾 Saved data to: ${filepath}`));
            }

            return filepath;
        } catch (error) {
            console.error(chalk.red(`❌ Failed to save ${filename}:`, error.message));
            throw error;
        }
    }

    /**
     * Main execution method
     */
    async run(options = {}) {
        const scriptStartTime = Date.now();
        console.log(chalk.bold.blue('\n' + '='.repeat(60)));
        console.log(chalk.bold.blue('🚀 AWS SSM Data Fetcher v1.5.1'));
        console.log(chalk.bold.blue('='.repeat(60) + '\n'));

        await this.ensureOutputDir();

        const results = {
            metadata: {
                timestamp: new Date().toISOString(),
                tool: 'nodejs-aws-fetcher',
                version: '1.5.1'
            }
        };

        try {
            // Fetch regions data
            if (!options.servicesOnly) {
                console.log(chalk.bold('\n=== REGIONS DISCOVERY ==='));

                // Get regions from SSM Parameter Store
                const regions = await this.discoverRegions();
                results.regions = regions;

                results.regionPath = await this.saveToFile('regions.json', results.regions);
            }

            // Fetch services data
            if (!options.regionsOnly) {
                console.log(chalk.bold('\n=== SERVICES DISCOVERY ==='));

                const services = await this.discoverServices();
                results.services = services;

                results.servicePath = await this.saveToFile('services.json', results.services);
            }

            // Fetch services by region (comprehensive mapping)
            if (options.includeServiceMapping && results.regions && results.services) {
                console.log(chalk.bold('\n=== SERVICES BY REGION MAPPING ==='));

                // Extract region codes for service mapping
                const regionCodes = results.regions.regions.map(r => r.code);
                const serviceCodes = results.services.services.map(s => s.code);

                const servicesByRegion = await this.fetchServicesByRegion(
                    regionCodes,
                    serviceCodes,
                    options.forceRefresh
                );
                results.servicesByRegion = servicesByRegion;
            }

            // Prepare complete data with full region objects (includes launch dates and blog URLs)
            const completeData = {
                metadata: results.metadata,
                regions: results.regions ? {
                    count: results.regions.count,
                    regions: results.regions.regions, // Full region objects with all metadata
                    source: results.regions.source,
                    timestamp: results.regions.timestamp
                } : undefined,
                services: results.services ? {
                    count: results.services.count,
                    services: results.services.services.map(s => s.code), // Just codes for compactness
                    source: results.services.source,
                    timestamp: results.services.timestamp
                } : undefined,
                servicesByRegion: results.servicesByRegion
            };

            // Remove undefined properties
            Object.keys(completeData).forEach(key => {
                if (completeData[key] === undefined) {
                    delete completeData[key];
                }
            });

            // Save complete results (single source of truth with codes only)
            results.completePath = await this.saveToFile('complete-data.json', completeData);

            // Summary
            console.log(chalk.bold.green('\n' + '='.repeat(60)));
            console.log(chalk.bold.green('✅ DATA FETCH COMPLETE!'));
            console.log(chalk.bold.green('='.repeat(60)));
            console.log(chalk.white('\n📁 Output directory:', this.outputDir));

            if (results.regions) {
                console.log(chalk.white(`🌍 Regions discovered: ${results.regions.count}`));
            }

            if (results.services) {
                console.log(chalk.white(`🛠️  Services discovered: ${results.services.count}`));
            }

            if (results.servicesByRegion) {
                // Calculate cumulative service count (sum of all service counts per region)
                let cumulativeServiceCount = 0;
                Object.values(results.servicesByRegion.byRegion).forEach(regionData => {
                    cumulativeServiceCount += regionData.serviceCount;
                });

                console.log(chalk.white(`🗺️  Service-by-region mappings: ${results.servicesByRegion.summary.totalRegions} regions`));
                console.log(chalk.white(`   📊 Total service instances: ${cumulativeServiceCount.toLocaleString()}`));
                console.log(chalk.white(`   📈 Average per region: ${results.servicesByRegion.summary.averageServicesPerRegion} services`));
            }

            // Display runtime
            const scriptEndTime = Date.now();
            const runtimeMs = scriptEndTime - scriptStartTime;
            const runtimeSec = (runtimeMs / 1000).toFixed(2);
            const runtimeMin = Math.floor(runtimeMs / 60000);
            const runtimeRemainingSec = ((runtimeMs % 60000) / 1000).toFixed(0);

            // Performance indicator
            let performanceIcon = '⚡';
            let performanceText = 'Excellent';
            if (runtimeMs > config.performance.goodThreshold) {
                performanceIcon = '🐌';
                performanceText = 'Slow';
            } else if (runtimeMs > config.performance.excellentThreshold) {
                performanceIcon = '⚠️';
                performanceText = 'Good';
            }

            if (runtimeMin > 0) {
                console.log(chalk.gray(`\n⏱️  Total runtime: ${runtimeMin}m ${runtimeRemainingSec}s ${performanceIcon} (${performanceText})`));
            } else {
                console.log(chalk.gray(`\n⏱️  Total runtime: ${runtimeSec}s ${performanceIcon} (${performanceText})`));
            }

            console.log(chalk.bold.green('='.repeat(60) + '\n'));

            // Return results (needed for Lambda handler)
            return {
                metadata: results.metadata,
                regions: results.regions,
                services: results.services,
                servicesByRegion: results.servicesByRegion,
                regionPath: results.regionPath,
                servicePath: results.servicePath,
                completePath: results.completePath
            };

        } catch (error) {
            console.error(chalk.red('\n❌ Execution failed:', error.message));
            console.error(chalk.gray(error.stack));
            throw error;
        }
    }
}

module.exports = AWSDataFetcher;
