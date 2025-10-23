# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AWS SSM Data Fetcher** - A standalone Node.js CLI tool that fetches AWS global infrastructure data from SSM Parameter Store. Created to independently verify AWS region/service data using AWS's authoritative global infrastructure metadata source.

### Purpose and Context

This tool was built to solve a specific problem: region count discrepancies and missing regions like eu-west-3 in other AWS infrastructure discovery implementations. SSM Parameter Store is AWS's official source for global infrastructure metadata, providing complete coverage of all 38 regions across all partitions (commercial, China, GovCloud).

## Core Architecture

### Modular Design

The implementation is split into modular components for maintainability and scalability:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  CLI Entry      │───▶│  Core Fetcher   │───▶│  Storage Layer  │
│  (src/cli.js)   │    │  (src/core/)    │    │  (src/storage/) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              │                        ▼
                              ▼              ┌─────────────────┐
                    ┌──────────────────┐    │  Local / S3     │
                    │   - Regions      │    │  JSON Output    │
                    │   - Services     │    │  (./output/)    │
                    │   - Mapping      │    └─────────────────┘
                    │   - Caching      │
                    └──────────────────┘

Lambda Deployment:
┌─────────────────┐    ┌─────────────────┐
│  Lambda Handler │───▶│  Core Fetcher   │
│ (src/lambda/)   │    │  (src/core/)    │
└─────────────────┘    └─────────────────┘
```

### Data Discovery Strategy

**SSM Parameter Store + RSS Feed as Authoritative Sources**:

1. **Region Discovery**: Fetches all 38 AWS regions from SSM parameters with official long names
2. **Availability Zone Mapping**: Fetches all 120+ AZs and maps them to parent regions for AZ counts
3. **Region Launch Data**: Fetches launch dates and blog URLs from AWS RSS feed
4. **Service Discovery**: Fetches 394+ AWS services from SSM parameters with official full names
5. **Service Name Fetching**: Dynamically fetches official service names from SSM (zero maintenance)
6. **Service-by-Region Mapping**: Queries each region for available services
7. **24-Hour Caching**: Intelligent caching for repeated runs

**Why SSM Parameter Store?**

- AWS's official global infrastructure metadata source
- Includes all partitions: commercial (34), China (2), GovCloud (2)
- Complete coverage: **38 total regions**
- Authoritative data directly from AWS
- Single source of truth - no comparison needed
- **Official service names**: Always current, no manual maintenance required

**Region Output** (`regions.json`):

```json
{
  "count": 38,
  "regions": [
    {
      "code": "us-east-1",
      "name": "US East (N. Virginia)",
      "availabilityZones": 6,
      "launchDate": "Fri, 25 Aug 2006 19:00:00 GMT",
      "blogUrl": "https://docs.aws.amazon.com/global-infrastructure/latest/regions/doc-history.html"
    },
    {
      "code": "us-west-2",
      "name": "US West (Oregon)",
      "availabilityZones": 4,
      "launchDate": "Wed, 9 Nov 2011 19:00:00 GMT",
      "blogUrl": "https://aws.amazon.com/blogs/aws/now-open-us-west-portland-region/"
    }
  ],
  "source": "ssm",
  "timestamp": "2025-10-12T01:47:15.343Z"
}
```

### Data Source Paths

**SSM Parameter Store:**

```
/aws/service/global-infrastructure/
├── regions/                           # Region codes (38 total)
│   ├── us-east-1                      # Parameter per region
│   │   └── longName                   # "US East (N. Virginia)"
│   ├── eu-west-3                      # Verification target
│   │   └── longName                   # "Europe (Paris)"
│   └── {region-code}/
│       ├── longName                   # Official region name (fetched dynamically)
│       ├── partition                  # aws, aws-cn, aws-us-gov
│       └── domain                     # amazonaws.com, etc.
├── availability-zones/                # AZ codes (120+ total)
│   ├── use1-az1                       # Parameter per AZ
│   │   └── parent-region              # "us-east-1"
│   ├── usw2-az1                       # Parameter per AZ
│   │   └── parent-region              # "us-west-2"
│   └── {az-id}/
│       └── parent-region              # Parent region code (for AZ count mapping)
└── services/                          # Service codes (394+)
    ├── ec2/
    │   └── longName                   # "Amazon Elastic Compute Cloud (EC2)"
    ├── s3/
    │   └── longName                   # "Amazon Simple Storage Service (S3)"
    └── {service-code}/
        └── longName                   # Official service name (fetched dynamically)
```

**AWS RSS Feed:**

```
https://docs.aws.amazon.com/global-infrastructure/latest/regions/regions.rss
├── Launch dates for regions (34 available)
├── Blog announcement URLs
└── Historical context (parsed from RSS XML)
```

### Pagination Handling

**Critical implementation detail**: AWS SSM has a hard limit of MaxResults: 10 per request. The code implements proper pagination:

```javascript
do {
  const response = await ssmClient.send(command);
  allParameters.push(...response.Parameters);
  nextToken = response.NextToken;

  // 100ms throttle delay between pages
  if (nextToken) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
} while (nextToken);
```

This pagination is why the script shows "Page 1: +10 parameters, Page 2: +10 parameters..." in output.

## Development Commands

### Setup and Installation

```bash
# Automated setup (recommended)
./setup.sh

# Manual installation
npm install
```

The setup script verifies:

- Node.js >= 18.0.0
- AWS credentials configuration
- Creates `./output/` directory

### Running the Fetcher

```bash
# Fetch all data (regions + services)
npm start
# Equivalent: node fetch-aws-data.js

# Fetch only regions (SSM + EC2 comparison)
npm run regions
# Equivalent: node fetch-aws-data.js --regions-only

# Fetch only services from SSM
npm run services
# Equivalent: node fetch-aws-data.js --services-only

# Include detailed region metadata (makes additional API calls per region, much slower)
node fetch-aws-data.js --include-details

# Use different AWS region for API calls (default: us-east-1)
node fetch-aws-data.js --region us-west-2

# Show all CLI options
node fetch-aws-data.js --help
```

### CLI Options (Commander.js)

- `-r, --regions-only` - Fetch only regions data
- `-s, --services-only` - Fetch only services data
- `-d, --include-details` - Fetch detailed region information (slow)
- `-m, --include-service-mapping` - Fetch service-by-region mapping (optimized, ~3-5 min first run, <5 sec cached)
- `-f, --force-refresh` - Force refresh cache, bypass cached data (24-hour TTL)
- `--region <region>` - AWS region for API calls (default: us-east-1)

## Output Files

All files saved to `./output/` directory (auto-created):

| File                             | Content                                                      | Size Estimate                               | When Generated                        |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------- |
| `regions.json`                   | SSM regions with names, AZ counts, launch dates, blog URLs   | ~8KB                                        | Always                                |
| `services.json`                  | AWS service codes discovered from SSM                        | ~8KB                                        | Always                                |
| `region-details.json`            | Detailed metadata per region                                 | Varies                                      | Only with `--include-details`         |
| `complete-data.json`             | **Single source of truth** - all data combined with metadata | ~12KB (no mapping)<br>~400KB (with mapping) | Always                                |
| `.cache-services-by-region.json` | 24-hour cache for service mapping (auto-managed)             | ~400KB                                      | Only with `--include-service-mapping` |

**Important**: `complete-data.json` is the **single source of truth**. All other files are lightweight subsets provided for convenience. Service-by-region mapping data is only in `complete-data.json` (under `servicesByRegion` key).

### Output Format

All JSON files include:

- `timestamp` - ISO 8601 format
- `source` - Data source identifier (ssm, ec2)
- `count` - Number of items discovered

Example structure:

```json
{
  "count": 38,
  "regions": ["af-south-1", "ap-east-1", ...],
  "source": "ssm",
  "timestamp": "2025-10-10T21:24:30.642Z"
}
```

## AWS Credentials

Requires AWS credentials via one of:

1. **AWS CLI**: `aws configure`
2. **Environment variables**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. **IAM roles**: If running on EC2/Lambda

### Verify AWS Access

```bash
# Check credentials
aws sts get-caller-identity

# List regions (for comparison with tool output)
aws ec2 describe-regions --all-regions --query 'Regions[*].RegionName' --output table
```

## Key Implementation Details

### Region Extraction (SSM)

Uses regex pattern matching on SSM parameter names:

```javascript
const match = param.Name.match(/\/regions\/([a-z0-9-]+)$/);
if (match) {
  regionCodes.add(match[1]);
}
```

### Service Extraction (SSM)

Similar pattern matching for services:

```javascript
const match = param.Name.match(/\/services\/([a-z0-9-]+)$/);
```

### eu-west-3 Verification

The code explicitly checks for and reports on eu-west-3 presence in both SSM and EC2 sources:

```javascript
if (regions.includes("eu-west-3")) {
  console.log("✅ eu-west-3 found in SSM regions");
} else {
  console.log("⚠️  eu-west-3 NOT found in SSM regions");
}
```

This verification was the original motivation for creating this tool.

## Expected Results

When running `npm start`, expect:

- **Total Regions**: 38 regions from SSM Parameter Store
- **Commercial Regions**: 34 (standard AWS partition)
- **China Regions**: 2 (cn-north-1, cn-northwest-1)
- **GovCloud Regions**: 2 (us-gov-east-1, us-gov-west-1)
- **Services Discovered**: 394+ AWS services
- **eu-west-3**: Present and verified ✅

Console output will show:

```
🌍 Discovering AWS regions...
📡 Fetching SSM parameters from: /aws/service/global-infrastructure/regions
   Page 1: +10 parameters (total: 10)
   Page 2: +10 parameters (total: 20)
   Page 3: +10 parameters (total: 30)
   Page 4: +8 parameters (total: 38)
✅ Fetched 38 parameters from /aws/service/global-infrastructure/regions
✅ Discovered 38 regions from SSM
   ✅ eu-west-3 found in SSM regions
💾 Saved data to: ./output/regions.json
```

## Troubleshooting

### Missing Regions

1. Check console output for region discovery results
2. Review `output/regions.json` comparison section
3. Verify AWS credentials have proper region access
4. Ensure not hitting AWS API rate limits (100ms delay is built-in)

### Module Errors

```bash
# Clear and reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### API Throttling

The script includes 100ms delays between paginated requests. If still throttled:

- Increase the delay in `fetchAllSSMParameters()` method
- Use `--region` flag to query from a different AWS region

### Node.js Version Issues

Requires Node.js >= 18.0.0 for AWS SDK v3:

```bash
node -v  # Check version
nvm install 18  # If using nvm
```

## Design Decisions and Rationale

1. **Modular architecture (v1.6.0)**: Separated CLI, core logic, Lambda handler, and storage for maintainability
2. **SSM as single source**: AWS's authoritative global infrastructure metadata with complete region coverage
3. **Dynamic name fetching (v1.4.0)**: Fetches service names from SSM for zero maintenance and always-current data
4. **Class-based design**: Encapsulates state (client, caching, output) and provides clean method organization
5. **Storage abstraction**: Factory pattern supports both local filesystem and S3 for flexible deployment
6. **24-hour caching**: Intelligent caching for 10-50x speedup on repeated runs
7. **Parallel batch processing**: Processes 5 regions simultaneously with adaptive throttling
8. **Pagination without limits**: Uses proper AWS pagination with NextToken and retry logic
9. **Structured JSON output**: Includes metadata, timestamps, and source attribution for data analysis
10. **CLI-first design**: Commander.js provides flexible command-line interface with multiple run modes
11. **Lambda-ready**: Separate handler for AWS Lambda deployment with environment-based configuration
12. **Chalk for output**: Color-coded console output for easy visual parsing during execution
13. **Adaptive throttle delay**: 25-50ms base delay prevents API rate limiting with exponential backoff retry
14. **Runtime tracking**: Displays execution time for performance monitoring
15. **Error handling**: Uses service code as name if SSM name fetching fails
16. **Test-ready structure**: Organized tests/ directory for unit, integration, and fixture files

## Dependencies

```json
{
  "@aws-sdk/client-ssm": "^3.645.0", // SSM Parameter Store (only AWS SDK needed)
  "commander": "^11.1.0", // CLI argument parsing
  "chalk": "^4.1.2" // Terminal colors
}
```

**Important**: Uses AWS SDK v3 (modular), not v2. Requires Node.js >= 18.0.0.

Only one AWS SDK dependency needed - SSM Parameter Store provides all infrastructure metadata.

## When Modifying This Codebase

### Maintain Core Functionality

- **Preserve SSM as single source**: SSM Parameter Store is the authoritative source for all data
- **Keep pagination logic**: Don't hardcode parameter limits or remove NextToken handling
- **Maintain caching system**: 24-hour TTL caching is critical for performance
- **Retain eu-west-3 verification**: This is the original verification target
- **Include timestamps**: All output should have ISO 8601 timestamps
- **Runtime tracking**: Display execution time in summary output

### Maintain Data Contract

- **Preserve JSON schema compatibility**: See `DATA_CONTRACT.md` for formal specification
- **Breaking changes require major version**: If removing fields, renaming fields, or changing types → bump to v2.0.0
- **Add new fields as optional**: New fields should be added without breaking existing consumers
- **Update DATA_CONTRACT.md**: Document all schema changes in the data contract
- **Validate output structure**: Ensure all required fields are present with correct types
- **Test backward compatibility**: Verify existing reporter/consumer applications still work

### Extending Functionality

- **Additional SSM paths**: Use existing fetchAllSSMParameters() method for new discovery
- **Additional metadata**: Add new fields to existing output structure, don't break existing schema
- **Error handling**: Use try-catch with chalk-colored console output for consistency
- **CLI options**: Add new Commander.js options for different run modes
- **Caching**: Extend caching system to other slow operations beyond service-by-region mapping

### Code Style

- **Console logging**: Use chalk colors consistently (blue=info, yellow=warning, green=success, red=error)
- **Async/await**: Don't mix promises and callbacks
- **Regex patterns**: Document regex patterns for parameter name extraction
- **Method organization**: Keep methods in logical order (fetch → parse → compare → save)

## Project Structure

```
nodejs-aws-fetcher/
├── src/                          # All source code
│   ├── cli.js                    # CLI entry point (Commander.js)
│   ├── core/                     # Core business logic
│   │   ├── aws-data-fetcher.js   # Main fetcher class with caching
│   │   └── config.js             # Configuration constants
│   ├── lambda/                   # Lambda deployment
│   │   └── handler.js            # Lambda function handler
│   └── storage/                  # Storage abstraction layer
│       ├── storage-interface.js  # Storage interface definition
│       ├── local-storage.js      # Local filesystem implementation
│       ├── s3-storage.js         # S3 bucket implementation
│       └── storage-factory.js    # Storage factory pattern
├── scripts/                      # Operational scripts
│   └── setup.sh                  # Setup script with verification
├── tests/                        # Test directory structure
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── fixtures/                 # Test fixtures
├── docs/                         # Documentation (properly organized)
├── output/                       # Generated JSON files (auto-created, gitignored)
│   ├── regions.json              # Region data with metadata
│   ├── services.json             # Discovered AWS services
│   ├── complete-data.json        # Single source of truth
│   └── .cache-services-by-region.json  # 24-hour cache (auto-managed)
├── package.json                  # Dependencies and npm scripts
├── package-lock.json             # Dependency lock file (committed)
├── template.yaml                 # AWS SAM deployment template
├── samconfig.toml               # SAM configuration
├── README.md                     # User documentation
├── CHANGELOG.md                  # Version history
├── CLAUDE.md                     # This file (developer guidance)
├── DATA_CONTRACT.md              # JSON schema specification
└── .gitignore                    # Git ignore patterns
```

**Architecture Evolution**: Originally a single-file implementation, restructured for maintainability with clear separation of concerns: CLI, core logic, Lambda deployment, and storage abstraction.

## Use Cases

This tool is designed for:

1. **Verifying AWS region discovery logic** in other applications
2. **Comparing SSM vs EC2 region sources** to identify discrepancies
3. **Auditing AWS infrastructure data** for completeness
4. **Generating reference data** for AWS region/service lists
5. **Debugging missing regions** like the original eu-west-3 issue

## Performance Characteristics

- **Regions only**: ~12-13 seconds (fetches region codes + names + AZ counts from SSM)
- **Services only**: ~30-35 seconds (fetches service codes + official names from SSM dynamically)
- **All data**: ~40-45 seconds (regions + services with official names)
- **With service mapping**:
  - **First run (no cache)**: ~3-5 minutes (parallel batch processing, 38 regions)
  - **Subsequent runs (cached)**: <5 seconds (loads from 24-hour cache)
  - **Partial cache**: ~1-3 minutes (only fetches stale regions)

**Note on v1.4.0 Enhancements**:

- **Service names**: Fetched dynamically from SSM Parameter Store
  - Adds ~30 seconds to service discovery (394 API calls for names)
  - **Trade-off**: Slightly slower but zero maintenance required
  - Service names are always official and up-to-date from AWS
- **Availability Zone counts**: Added to all regions
  - Adds ~6 seconds to region discovery (120+ API calls for AZ mapping)
  - **Trade-off**: ~6 seconds for critical infrastructure planning data
  - Provides AZ counts essential for multi-AZ architecture planning

### Performance Optimizations (v1.1.0, v1.2.0, v1.4.0)

1. **Parallel Batch Processing**: Processes 5 regions simultaneously (4-5x speedup)
2. **Adaptive Throttling**: Base 25-50ms delay with automatic increases on rate limits
3. **Exponential Backoff Retry**: Up to 5 retries for rate-limited requests
4. **24-Hour Caching**: Massive speedup for repeated runs (10-50x faster)
5. **Real-time ETA**: Shows estimated time remaining during execution
6. **Dynamic Name Fetching (v1.4.0)**: Fetches official names from SSM for zero maintenance

The `--include-service-mapping` flag uses intelligent caching to dramatically speed up repeated runs.

## Version History

### v1.6.0 (2025-10-16) - Project Restructuring

- ✅ Modular architecture with src/ directory organization
- ✅ Separated CLI entry point (src/cli.js) from core logic (src/core/aws-data-fetcher.js)
- ✅ Organized code into logical modules: core/, lambda/, storage/
- ✅ Moved operational scripts to scripts/ directory
- ✅ Created test directory structure: tests/unit/, tests/integration/, tests/fixtures/
- ✅ Updated all import paths and deployment configurations
- ✅ Professional project structure following Node.js best practices
- ✅ Committed package-lock.json for reproducible builds

### v1.4.0 (2025-10-11) - Enhanced Region Metadata & Dynamic Names

- ✅ Region launch dates and blog URLs from AWS RSS feed (historical context)
- ✅ Availability Zone counts added to all regions (infrastructure planning)
- ✅ Service names fetched dynamically from SSM Parameter Store
- ✅ Zero maintenance required for service names and region data
- ✅ Official AWS names automatically up-to-date
- ✅ Consistent architecture: all data from SSM + RSS feed
- ❌ Removed unmapped service tracking (no longer needed)
- Performance: ~36 seconds slower but fully automatic with rich metadata

### v1.3.0 (2025-10-11) - SSM-Only Architecture

- ✅ Removed EC2 API dependency
- ✅ SSM as single authoritative source
- ✅ Runtime tracking in output
- ✅ Simplified codebase (~100 lines removed)

### v1.2.0 (2025-10-11) - Architecture Simplification

- ✅ Removed redundant services-by-region.json
- ✅ 24-hour intelligent caching system
- ✅ 10-50x speedup for repeated runs
- ✅ complete-data.json as single source of truth

### v1.1.0 (2025-10-11) - Performance Phase 1

- ✅ Parallel batch processing (4-5x speedup)
- ✅ Adaptive throttling with retry logic
- ✅ Real-time progress tracking with ETA

### v1.0.0 (2025-10-10) - Initial Release

- ✅ Dual-source region discovery (SSM + EC2)
- ✅ Service discovery from SSM
- ✅ Region comparison and merging
