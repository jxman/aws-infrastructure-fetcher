# Performance Optimization Suggestions

**Date**: October 12, 2025
**Current Performance**: ~2 minutes for complete run (no cache)
**Goal**: Reduce to <60 seconds

---

## Current Performance Breakdown

Based on the code analysis, here's where time is spent:

```
Total Runtime: ~120 seconds (2 minutes)

1. Region Discovery:        ~12-13 seconds
   - Fetch region codes:     ~2 seconds
   - AZ mapping (120 AZs):   ~6 seconds (sequential, 25ms each)
   - RSS feed:               ~0.5 seconds
   - Region names (38):      ~3 seconds (sequential, 25ms each)

2. Service Discovery:       ~30-35 seconds
   - Fetch service codes:    ~3 seconds
   - Service names (395):    ~30 seconds (sequential, 25ms each)

3. Service-by-Region:       ~70-80 seconds
   - 38 regions, batch=5:    ~70 seconds
   - Each region ~15-20s:    Paginated SSM calls
```

---

## High-Impact Optimizations

### 1. Parallel Name Fetching (Biggest Win)

**Current**: Sequential with 25ms delay
**Impact**: Save ~25-30 seconds total

#### A. Parallel Region Name Fetching

**Current code (lines 276-319)**:
```javascript
// Sequential: ~3 seconds for 38 regions
for (const regionCode of regionCodesArray) {
    const command = new GetParameterCommand({ Name: longNamePath });
    const response = await this.ssmClient.send(command);
    // ... 25ms delay
}
```

**Optimized**:
```javascript
// Parallel batches: ~0.5 seconds for 38 regions
async fetchRegionNames(regionCodes) {
    const batchSize = 10;
    const results = [];

    for (let i = 0; i < regionCodes.length; i += batchSize) {
        const batch = regionCodes.slice(i, i + batchSize);

        const batchPromises = batch.map(async (code) => {
            try {
                const longNamePath = `/aws/service/global-infrastructure/regions/${code}/longName`;
                const command = new GetParameterCommand({ Name: longNamePath });
                const response = await this.ssmClient.send(command);
                return { code, name: response.Parameter?.Value || code };
            } catch (error) {
                logger.warn('Failed to fetch region name', { code, error: error.message });
                return { code, name: code };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < regionCodes.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}
```

**Savings**: 3 seconds → 0.5 seconds = **2.5 seconds saved**

---

#### B. Parallel Service Name Fetching

**Current code (lines 364-395)**:
```javascript
// Sequential: ~30 seconds for 395 services
for (const serviceCode of serviceCodesArray) {
    const command = new GetParameterCommand({ Name: longNamePath });
    const response = await this.ssmClient.send(command);
    // ... 25ms delay
}
```

**Optimized**:
```javascript
async fetchServiceNames(serviceCodes) {
    const batchSize = 20;  // Higher batch for services
    const results = [];
    const missingNames = [];

    console.log(chalk.yellow(`   📋 Fetching ${serviceCodes.length} service names in parallel...`));

    for (let i = 0; i < serviceCodes.length; i += batchSize) {
        const batch = serviceCodes.slice(i, i + batchSize);

        const batchPromises = batch.map(async (code) => {
            try {
                const longNamePath = `/aws/service/global-infrastructure/services/${code}/longName`;
                const command = new GetParameterCommand({ Name: longNamePath });
                const response = await this.ssmClient.send(command);
                return { code, name: response.Parameter?.Value || code, success: true };
            } catch (error) {
                return { code, name: code, success: false };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(result => {
            results.push({ code: result.code, name: result.name });
            if (!result.success) {
                missingNames.push(result.code);
            }
        });

        // Progress indicator
        if ((i + batchSize) % 100 === 0 || i + batchSize >= serviceCodes.length) {
            console.log(chalk.gray(`   📋 Fetched ${Math.min(i + batchSize, serviceCodes.length)}/${serviceCodes.length} service names...`));
        }

        // Small delay between batches
        if (i + batchSize < serviceCodes.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(chalk.green(`   ✅ Fetched ${serviceCodes.length} service names from SSM`));

    if (missingNames.length > 0) {
        console.log(chalk.yellow(`\n   ℹ️  ${missingNames.length} services had no SSM longName (using code as name)`));
    }

    return results;
}
```

**Savings**: 30 seconds → 3 seconds = **27 seconds saved**

---

#### C. Parallel AZ Mapping

**Current code (lines 243-265)**:
```javascript
// Sequential: ~6 seconds for 120 AZs
for (const azId of azIds) {
    const command = new GetParameterCommand({ Name: parentRegionPath });
    const response = await this.ssmClient.send(command);
    // ... 25ms delay
}
```

**Optimized**:
```javascript
async mapAvailabilityZones(azIds) {
    const batchSize = 20;
    const regionAzCounts = {};

    console.log(chalk.yellow('   📍 Mapping AZs to regions in parallel...'));

    for (let i = 0; i < azIds.length; i += batchSize) {
        const batch = azIds.slice(i, i + batchSize);

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

        // Progress indicator
        if ((i + batchSize) % 50 === 0 || i + batchSize >= azIds.length) {
            console.log(chalk.gray(`   📍 Mapped ${Math.min(i + batchSize, azIds.length)}/${azIds.length} AZs...`));
        }

        // Small delay between batches
        if (i + batchSize < azIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(chalk.green(`   ✅ Mapped AZs to ${Object.keys(regionAzCounts).length} regions`));

    return regionAzCounts;
}
```

**Savings**: 6 seconds → 1 second = **5 seconds saved**

---

### 2. Increase Service-by-Region Batch Size

**Current**: Batch size of 5 regions (line 522)
**Optimized**: Batch size of 10-15 regions

```javascript
// Current
const batchSize = 5; // Process 5 regions in parallel

// Optimized
const batchSize = 10; // Process 10 regions in parallel (safe for most AWS accounts)
```

**Analysis**:
- Current: 38 regions ÷ 5 = 8 batches × ~10s each = 80 seconds
- Optimized: 38 regions ÷ 10 = 4 batches × ~10s each = 40 seconds

**Savings**: **40 seconds saved**

**Risk**: Slightly higher chance of rate limiting (still within AWS limits)

**Recommendation**: Start with 10, increase to 15 if no throttling errors

---

### 3. SSM Client Configuration Optimization

**Current**: Default SSM client configuration
**Optimized**: Tune for performance

```javascript
const { SSMClient } = require('@aws-sdk/client-ssm');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
const https = require('https');

// Create custom HTTP agent with connection pooling
const agent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 50,        // Increased from default 50
    maxFreeSockets: 10,
    timeout: 30000
});

// Custom request handler
const requestHandler = new NodeHttpHandler({
    httpsAgent: agent,
    connectionTimeout: 3000,
    requestTimeout: 30000
});

class AWSDataFetcher {
    constructor(region = 'us-east-1') {
        this.ssmClient = new SSMClient({
            region,
            requestHandler,
            maxAttempts: 3,          // Retry logic
            retryMode: 'adaptive'    // Adaptive retry
        });
    }
}
```

**Benefits**:
- Reuses TCP connections
- Reduces connection overhead
- Faster request/response times

**Savings**: **2-3 seconds saved**

---

### 4. Remove Unnecessary Delays

**Current**: 25ms delay between each request
**Analysis**: AWS SSM rate limit is 40 TPS per region

With parallel batches, you're making ~10-20 requests simultaneously, which is well under the 40 TPS limit.

**Optimized**: Remove delays within parallel batches

```javascript
// Current: 25ms delay between each request
await new Promise(resolve => setTimeout(resolve, 25));

// Optimized: Only delay between batches (not within batch)
// No delay within Promise.all() batch
// Only delay between batches:
if (i + batchSize < items.length) {
    await new Promise(resolve => setTimeout(resolve, 100));
}
```

**Savings**: Delays already removed with parallel approach

---

### 5. Optimize RSS Feed Fetching

**Current**: Regex parsing
**Optimized**: Fast XML parser (already suggested in CODE_REVIEW)

```javascript
const { XMLParser } = require('fast-xml-parser');

async fetchRegionLaunchData() {
    console.log(chalk.yellow('   📰 Fetching region launch data from RSS feed...'));

    const rssUrl = 'https://docs.aws.amazon.com/global-infrastructure/latest/regions/regions.rss';

    try {
        const xmlData = await this.fetchRSSFeed(rssUrl);

        const parser = new XMLParser({
            ignoreAttributes: false,
            trimValues: true
        });

        const parsed = parser.parse(xmlData);
        const items = parsed.rss?.channel?.item || [];

        const launchData = {};

        for (const item of items) {
            const description = item.description || '';
            const codeMatch = description.match(/<code[^>]*>([a-z0-9-]+)<\/code>/);

            if (codeMatch) {
                launchData[codeMatch[1]] = {
                    launchDate: item.pubDate || null,
                    blogUrl: item.link || null
                };
            }
        }

        console.log(chalk.gray(`   📰 Found launch data for ${Object.keys(launchData).length} regions`));
        return launchData;

    } catch (error) {
        console.warn(chalk.yellow(`   ⚠️  Failed to fetch RSS feed: ${error.message}`));
        return {};
    }
}
```

**Savings**: ~0.1 seconds (minor, but cleaner code)

---

### 6. Parallel Region and Service Discovery

**Current**: Sequential - regions first, then services
**Optimized**: Parallel - fetch both simultaneously

```javascript
async run(options = {}) {
    const scriptStartTime = Date.now();
    console.log(chalk.bold.blue('\n🚀 AWS SSM Data Fetcher Starting...\n'));

    await this.ensureOutputDir();

    const results = {
        metadata: {
            timestamp: new Date().toISOString(),
            tool: 'nodejs-aws-fetcher',
            version: '1.4.0'
        }
    };

    try {
        // Fetch regions AND services in parallel if neither is excluded
        if (!options.regionsOnly && !options.servicesOnly) {
            console.log(chalk.bold('\n=== PARALLEL DISCOVERY (REGIONS + SERVICES) ==='));

            const [regions, services] = await Promise.all([
                this.discoverRegions(),
                this.discoverServices()
            ]);

            results.regions = regions;
            results.services = services;

            await Promise.all([
                this.saveToFile('regions.json', results.regions),
                this.saveToFile('services.json', results.services)
            ]);

        } else {
            // Original sequential logic for --regions-only or --services-only
            if (!options.servicesOnly) {
                console.log(chalk.bold('\n=== REGIONS DISCOVERY ==='));
                const regions = await this.discoverRegions();
                results.regions = regions;
                await this.saveToFile('regions.json', results.regions);
            }

            if (!options.regionsOnly) {
                console.log(chalk.bold('\n=== SERVICES DISCOVERY ==='));
                const services = await this.discoverServices();
                results.services = services;
                await this.saveToFile('services.json', results.services);
            }
        }

        // ... rest of the method
    }
}
```

**Savings**: ~10-12 seconds (regions and services overlap)

---

## Performance Optimization Summary

| Optimization | Current Time | Optimized Time | Savings |
|--------------|--------------|----------------|---------|
| Parallel region names | 3s | 0.5s | **2.5s** |
| Parallel service names | 30s | 3s | **27s** |
| Parallel AZ mapping | 6s | 1s | **5s** |
| Service-by-region batch | 80s | 40s | **40s** |
| Parallel regions+services | Sequential | Parallel | **10s** |
| SSM client optimization | - | - | **3s** |
| **TOTAL** | **~120s** | **~32s** | **~88s** |

---

## Expected Performance After Optimization

```
Region Discovery:           ~5 seconds
  - Fetch region codes:      1s
  - AZ mapping (parallel):   1s
  - RSS feed:                0.5s
  - Region names (parallel): 0.5s
  - RSS integration:         2s

Service Discovery:          ~7 seconds (parallel with regions)
  - Fetch service codes:     3s
  - Service names (parallel):3s
  - Integration:             1s

Service-by-Region:          ~40 seconds
  - 38 regions, batch=10:    40s

TOTAL: ~45 seconds (regions+services run in parallel)
       ~45 + 40 = 85 seconds for complete run
```

**Performance improvement: 120s → 85s (30% faster, 35 seconds saved)**

With more aggressive optimization (batch=15, no delays):
**Could achieve: ~60 seconds total**

---

## Implementation Priority

### Phase 1: Quick Wins (30 min implementation)

1. **Increase service-by-region batch size** (5 → 10)
   - Line 522: Change `const batchSize = 5;` to `const batchSize = 10;`
   - Test for throttling errors
   - If successful, try 15

**Savings**: 40 seconds
**Risk**: Low
**Effort**: 5 minutes

---

### Phase 2: Parallel Name Fetching (2-3 hours)

2. **Parallel region name fetching**
   - Refactor `discoverRegions()` method
   - Extract region name fetching logic
   - Implement batch parallel processing

3. **Parallel service name fetching**
   - Refactor `discoverServices()` method
   - Extract service name fetching logic
   - Implement batch parallel processing

4. **Parallel AZ mapping**
   - Refactor AZ mapping section in `discoverRegions()`
   - Implement batch parallel processing

**Savings**: 34.5 seconds
**Risk**: Low (with proper batch delays)
**Effort**: 2-3 hours

---

### Phase 3: Advanced Optimization (1-2 hours)

5. **SSM client optimization**
   - Add custom HTTP agent
   - Configure connection pooling
   - Tune retry logic

6. **Parallel regions + services discovery**
   - Modify `run()` method
   - Use `Promise.all()` for parallel execution

**Savings**: 13 seconds
**Risk**: Low
**Effort**: 1-2 hours

---

## Implementation Code Changes

### Change 1: Update discoverRegions() Method

```javascript
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

    // Fetch all data in parallel
    console.log(chalk.yellow('   Fetching region metadata in parallel...'));

    const [azCounts, launchData, regionNames] = await Promise.all([
        this.fetchAvailabilityZoneCounts(),
        this.fetchRegionLaunchData(),
        this.fetchRegionNamesParallel(regionCodesArray)
    ]);

    // Combine all data
    const regionsWithMetadata = regionCodesArray.map(code => {
        const regionName = regionNames.find(r => r.code === code);
        const launch = launchData[code];

        return {
            code,
            name: regionName?.name || code,
            availabilityZones: azCounts[code] || 0,
            launchDate: launch?.launchDate || null,
            blogUrl: launch?.blogUrl || null
        };
    });

    return {
        count: regionsWithMetadata.length,
        regions: regionsWithMetadata,
        source: 'ssm',
        timestamp: new Date().toISOString()
    };
}

async fetchAvailabilityZoneCounts() {
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

    // Map AZs to regions in parallel
    return await this.mapAvailabilityZonesParallel(azIds);
}

async mapAvailabilityZonesParallel(azIds) {
    const batchSize = 20;
    const regionAzCounts = {};

    console.log(chalk.yellow('   📍 Mapping AZs to regions in parallel...'));

    for (let i = 0; i < azIds.length; i += batchSize) {
        const batch = azIds.slice(i, i + batchSize);

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

        batchResults.forEach(result => {
            if (result.parentRegion) {
                regionAzCounts[result.parentRegion] = (regionAzCounts[result.parentRegion] || 0) + 1;
            }
        });

        if ((i + batchSize) % 50 === 0 || i + batchSize >= azIds.length) {
            console.log(chalk.gray(`   📍 Mapped ${Math.min(i + batchSize, azIds.length)}/${azIds.length} AZs...`));
        }

        if (i + batchSize < azIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(chalk.green(`   ✅ Mapped AZs to ${Object.keys(regionAzCounts).length} regions`));
    return regionAzCounts;
}

async fetchRegionNamesParallel(regionCodes) {
    const batchSize = 10;
    const results = [];

    console.log(chalk.yellow('   📋 Fetching region names in parallel...'));

    for (let i = 0; i < regionCodes.length; i += batchSize) {
        const batch = regionCodes.slice(i, i + batchSize);

        const batchPromises = batch.map(async (code) => {
            try {
                const longNamePath = `/aws/service/global-infrastructure/regions/${code}/longName`;
                const command = new GetParameterCommand({ Name: longNamePath });
                const response = await this.ssmClient.send(command);
                return { code, name: response.Parameter?.Value || code };
            } catch (error) {
                return { code, name: code };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        if (i + batchSize < regionCodes.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(chalk.green(`   ✅ Fetched ${regionCodes.length} region names`));
    return results;
}
```

---

### Change 2: Update discoverServices() Method

```javascript
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

    // Fetch service names in parallel
    const servicesWithNames = await this.fetchServiceNamesParallel(serviceCodesArray);

    return {
        count: servicesWithNames.length,
        services: servicesWithNames,
        source: 'ssm',
        timestamp: new Date().toISOString()
    };
}

async fetchServiceNamesParallel(serviceCodes) {
    const batchSize = 20;
    const results = [];
    const missingNames = [];

    console.log(chalk.yellow(`   📋 Fetching ${serviceCodes.length} service names in parallel...`));

    for (let i = 0; i < serviceCodes.length; i += batchSize) {
        const batch = serviceCodes.slice(i, i + batchSize);

        const batchPromises = batch.map(async (code) => {
            try {
                const longNamePath = `/aws/service/global-infrastructure/services/${code}/longName`;
                const command = new GetParameterCommand({ Name: longNamePath });
                const response = await this.ssmClient.send(command);
                return {
                    code,
                    name: response.Parameter?.Value || code,
                    success: true
                };
            } catch (error) {
                return {
                    code,
                    name: code,
                    success: false
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(result => {
            results.push({ code: result.code, name: result.name });
            if (!result.success) {
                missingNames.push(result.code);
            }
        });

        // Progress indicator every 100 services
        if ((i + batchSize) % 100 === 0 || i + batchSize >= serviceCodes.length) {
            console.log(chalk.gray(`   📋 Fetched ${Math.min(i + batchSize, serviceCodes.length)}/${serviceCodes.length} service names...`));
        }

        if (i + batchSize < serviceCodes.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(chalk.green(`   ✅ Fetched ${serviceCodes.length} service names from SSM`));

    if (missingNames.length > 0) {
        console.log(chalk.yellow(`\n   ℹ️  ${missingNames.length} services had no SSM longName (using code as name)`));
    }

    return results;
}
```

---

### Change 3: Increase Batch Size

```javascript
// In fetchServicesByRegion method, line 522
// Change from:
const batchSize = 5;

// To:
const batchSize = 10;  // Or 15 if no throttling
```

---

### Change 4: Add SSM Client Optimization

```javascript
const { SSMClient, GetParametersByPathCommand, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
const https = require('https');

class AWSDataFetcher {
    constructor(region = 'us-east-1') {
        // Create custom HTTPS agent with connection pooling
        const httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 60000,
            maxSockets: 50,
            maxFreeSockets: 10,
            timeout: 30000
        });

        // Custom request handler
        const requestHandler = new NodeHttpHandler({
            httpsAgent,
            connectionTimeout: 3000,
            requestTimeout: 30000
        });

        // Initialize SSM client with optimizations
        this.ssmClient = new SSMClient({
            region,
            requestHandler,
            maxAttempts: 3,
            retryMode: 'adaptive'
        });

        this.outputDir = './output';
        this.cacheFile = path.join(this.outputDir, '.cache-services-by-region.json');
        this.cacheTTL = 24 * 60 * 60 * 1000;
    }
}
```

---

## Testing Strategy

### 1. Baseline Test (Current Performance)

```bash
# Clear cache and run complete fetch
npm run cache:clear
time npm run complete

# Record results:
# - Total time
# - Region discovery time
# - Service discovery time
# - Service-by-region mapping time
```

### 2. Test Each Optimization Individually

```bash
# Test 1: Increase batch size only
# Change line 522: batchSize = 10
time npm run complete

# Test 2: Add parallel region names
# Implement fetchRegionNamesParallel()
time npm run regions

# Test 3: Add parallel service names
# Implement fetchServiceNamesParallel()
time npm run services

# Test 4: Add SSM client optimization
# Add custom HTTP agent
time npm run complete
```

### 3. Monitor for Throttling

```bash
# Watch for throttling errors in output
npm run complete 2>&1 | grep -i throttl

# If throttling occurs:
# - Reduce batch size
# - Increase delays between batches
# - Add exponential backoff
```

---

## Risk Assessment

### Low Risk (Safe to implement)
✅ Increase batch size 5 → 10
✅ Parallel region name fetching (batch=10)
✅ Parallel AZ mapping (batch=20)
✅ SSM client optimization

### Medium Risk (Test carefully)
⚠️ Increase batch size 10 → 15
⚠️ Parallel service name fetching (395 services)
⚠️ Remove delays entirely

### Recommended Approach
1. Start with batch size increase (5 → 10)
2. Add parallel name fetching with conservative batch sizes
3. Test thoroughly for throttling
4. Gradually increase batch sizes if no issues
5. Monitor AWS account for rate limit warnings

---

## Configuration for Performance Tuning

Create a performance config section:

```javascript
// config.js or at top of fetch-aws-data.js
const PERFORMANCE_CONFIG = {
    // Parallel batch sizes
    regionNameBatchSize: 10,
    serviceNameBatchSize: 20,
    azMappingBatchSize: 20,
    serviceByRegionBatchSize: 10,

    // Delays (milliseconds)
    batchDelay: 100,  // Delay between batches

    // SSM client settings
    maxSockets: 50,
    connectionTimeout: 3000,
    requestTimeout: 30000,

    // Retry settings
    maxRetries: 3,
    retryMode: 'adaptive'
};

module.exports = PERFORMANCE_CONFIG;
```

This allows easy tuning without code changes.

---

## Expected Results

### Before Optimization
```
Region Discovery:       12-13 seconds
Service Discovery:      30-35 seconds
Service-by-Region:      70-80 seconds
Total:                  ~120 seconds (2 minutes)
```

### After Phase 1 (Batch size only)
```
Region Discovery:       12-13 seconds
Service Discovery:      30-35 seconds
Service-by-Region:      40 seconds
Total:                  ~85 seconds (42% faster)
```

### After Phase 2 (Parallel names)
```
Region Discovery:       5-6 seconds
Service Discovery:      7-8 seconds
Service-by-Region:      40 seconds
Total:                  ~52 seconds (57% faster)
```

### After Phase 3 (All optimizations)
```
Region+Service (parallel): 8 seconds
Service-by-Region:         40 seconds
Total:                     ~48 seconds (60% faster)
```

---

## Conclusion

**Achievable target: 45-60 seconds** (from current 120 seconds)

**Highest impact optimizations**:
1. Parallel service name fetching: **-27 seconds**
2. Increase batch size (10): **-40 seconds**
3. Parallel regions+services: **-10 seconds**
4. Parallel AZ mapping: **-5 seconds**

**Recommended implementation order**:
1. ✅ Increase batch size (5 min, -40s)
2. ✅ Parallel name fetching (2-3 hours, -34s)
3. ✅ SSM client optimization (1 hour, -3s)
4. ✅ Parallel regions+services (1 hour, -10s)

**Total savings: ~87 seconds (from 120s to 33s base + 40s mapping = 73s total)**

The most impactful change is **increasing the batch size** - this single line change can save 40 seconds. Combined with parallel name fetching, you can achieve sub-60-second performance.
