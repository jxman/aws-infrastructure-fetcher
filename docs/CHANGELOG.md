# Changelog

## [1.6.0] - 2025-10-20

### Added - CloudFront Distribution Integration

**Data files now automatically distributed to CloudFront-backed website for global access**

#### New Features

1. **CloudFront Distribution**

   - Automatic distribution to `www.aws-services.synepho.com/data/`
   - Public URLs: `https://aws-services.synepho.com/data/{file}.json`
   - Cache-Control: `public, max-age=300` (5 minutes)
   - Dual storage: source bucket (backup) + distribution bucket (public access)

2. **Automatic Cache Invalidation**

   - CloudFront cache invalidated after each data update
   - Ensures immediate data freshness at edge locations worldwide
   - Invalidation ID tracked in Lambda response and SNS notifications

3. **Enhanced Monitoring**
   - Distribution status included in Lambda response
   - SNS notifications show distribution success/failure
   - CloudWatch Logs include detailed distribution tracking

#### Implementation Details

1. **S3 Storage Layer** (`src/storage/s3-storage.js`)

   - Added `distributeToWebsite()` method - copies files to distribution bucket
   - Added `invalidateCloudFrontCache()` method - invalidates CloudFront cache
   - Non-critical operations: errors logged but don't fail Lambda execution

2. **Lambda Handler** (`src/lambda/handler.js`)

   - Calls distribution after successful data fetch
   - Triggers cache invalidation after successful distribution
   - Includes distribution results in response and SNS notifications

3. **Infrastructure** (`template.yaml`)

   - Added `DistributionBucketName` parameter (default: `www.aws-services.synepho.com`)
   - Added `DistributionKeyPrefix` parameter (default: `data`)
   - Added `CloudFrontDistributionId` parameter (default: `EBTYLWOK3WVOK`)
   - Added S3 write permissions for distribution bucket
   - Added CloudFront invalidation permissions

4. **Dependencies**
   - Added `@aws-sdk/client-cloudfront@^3.645.0` for cache invalidation

#### Benefits

1. **Global Performance**

   - Edge caching reduces latency for international users
   - CloudFront CDN distribution across 450+ edge locations

2. **Cost Protection**

   - Reduces S3 GET requests by ~95% through edge caching
   - CloudFront caching protects against traffic spikes

3. **Immediate Updates**

   - Automatic cache invalidation ensures fresh data
   - No waiting for TTL expiration (previously 5-minute delay)

4. **Unified Infrastructure**
   - Same bucket and CloudFront distribution as website
   - Consistent with aws-services-reporter pattern

#### Public Data Access

**Recommended (CloudFront-backed)**:

```javascript
const dataUrl = "https://aws-services.synepho.com/data/complete-data.json";
```

**Not Recommended (Direct S3)**:

```javascript
// Avoid - higher costs, no edge caching
const dataUrl =
  "https://aws-data-fetcher-output.s3.amazonaws.com/aws-data/complete-data.json";
```

#### Configuration

Distribution is enabled by default. To disable:

```bash
sam deploy --parameter-overrides DistributionBucketName=""
```

#### Files Modified

- `package.json`: Added CloudFront SDK dependency, version bump to 1.6.0
- `src/storage/s3-storage.js`: Added distribution and cache invalidation methods
- `src/lambda/handler.js`: Integrated distribution calls and SNS notification updates
- `template.yaml`: Added distribution parameters and IAM permissions
- `samconfig.toml`: Added distribution configuration defaults
- `README.md`: Added Data Distribution section
- `CHANGELOG.md`: This entry

---

## [1.5.1] - 2025-10-13

### Changed - Node.js Runtime Upgrade

**Lambda runtime updated from Node.js 18.x to Node.js 20.x (LTS)**

#### Runtime Update

1. **Node.js 20.x Runtime**

   - Updated Lambda function runtime from `nodejs18.x` to `nodejs20.x`
   - Updated package.json engine requirement from `>=18.0.0` to `>=20.0.0`
   - Node.js 20.x is LTS (Long Term Support) until April 2026
   - Addresses AWS deprecation warning for Node.js 18.x

2. **Deployment Verification**

   - Successfully deployed via SAM
   - Tested Lambda invocation with Node.js 20.x runtime
   - Confirmed full functionality (regions fetch, services discovery, S3 storage, SNS notifications)
   - No code changes required - fully backward compatible

3. **Documentation Updates**
   - Updated template.yaml: `Runtime: nodejs20.x`
   - Updated package.json: `"node": ">=20.0.0"`
   - Updated docs/LAMBDA_DEPLOYMENT_GUIDE.md: All runtime references changed to nodejs20.x
   - Updated CHANGELOG.md: Documented runtime upgrade

#### Benefits

1. **Extended Support**

   - Node.js 20.x supported until April 2026
   - No more deprecation warnings from AWS
   - Future-proof for the next 1-2 years

2. **Performance Improvements**

   - Native Node.js 20.x performance enhancements
   - Improved security features
   - Latest AWS SDK compatibility

3. **Zero Downtime**
   - Backward compatible upgrade
   - No code changes required
   - Seamless deployment via SAM

#### Files Modified

- `template.yaml`: Runtime changed from `nodejs18.x` to `nodejs20.x`
- `package.json`: Engine requirement changed from `>=18.0.0` to `>=20.0.0`
- `docs/LAMBDA_DEPLOYMENT_GUIDE.md`: All runtime references updated to nodejs20.x
- `CHANGELOG.md`: This entry

#### Deployment

```bash
# Build with new runtime
sam build

# Deploy to AWS
sam deploy

# Verify runtime
aws lambda get-function-configuration \
  --function-name aws-data-fetcher \
  --query 'Runtime'
# Output: nodejs20.x
```

## [1.5.0] - 2025-10-12

### Added - AWS Lambda Deployment

**Complete serverless deployment with automated scheduling and notifications**

#### Major Features

1. **AWS Lambda Function**

   - Serverless execution with 180-second timeout and 512MB memory
   - Automated daily execution via EventBridge scheduler (2 AM UTC by default)
   - Environment-based configuration for flexible deployment
   - Production-ready error handling and logging
   - **Impact**: Zero server maintenance, pay-per-execution pricing (~$0.04/month)

2. **SAM/CloudFormation Infrastructure**

   - Complete Infrastructure as Code deployment
   - Single-command deployment: `sam deploy --guided`
   - Parameterized configuration (batch size, pagination delay, notification email)
   - CloudFormation stack management for infrastructure updates
   - **Impact**: Reproducible deployments, version-controlled infrastructure

3. **S3 Storage Integration**

   - Automated S3 bucket creation with versioning enabled
   - Data files stored in S3 with organized folder structure
   - 24-hour cache stored in S3 for cross-execution persistence
   - S3 lifecycle policies (30-day history retention, 7-day version expiration)
   - Public access blocked by default for security
   - **Impact**: Persistent storage, versioned data history, automated cleanup

4. **SNS Email Notifications**

   - Success notifications with execution summary and S3 paths
   - Error notifications with stack traces and CloudWatch log links
   - Optional email subscription via CloudFormation parameter
   - Notification includes: regions count, services count, duration, cache stats
   - **Impact**: Immediate visibility into execution status

5. **CloudWatch Monitoring & Alarms**

   - Automatic log group creation with 7-day retention
   - Error alarm: triggers on any Lambda error
   - Duration alarm: triggers if execution exceeds 120 seconds
   - Alarms send notifications to SNS topic
   - **Impact**: Proactive monitoring, immediate error detection

6. **Storage Abstraction Pattern**

   - Factory pattern for storage selection (local vs S3)
   - `STORAGE_TYPE` environment variable controls storage backend
   - `StorageInterface` defines common contract
   - `LocalStorage` for CLI usage (filesystem)
   - `S3Storage` for Lambda usage (S3 bucket)
   - Seamless switching without code changes
   - **Impact**: Single codebase supports both CLI and Lambda deployments

7. **Environment-Based Configuration**
   - `STORAGE_TYPE`: local or s3 (default: local)
   - `S3_BUCKET_NAME`: Target bucket for data storage
   - `S3_PREFIX`: Folder prefix for organization (default: aws-data)
   - `BATCH_SIZE`: Parallel region processing (default: 10, range: 5-20)
   - `PAGINATION_DELAY`: SSM request delay in ms (default: 40, range: 20-100)
   - `CACHE_TTL`: Cache expiration in ms (default: 86400000 = 24 hours)
   - `SNS_TOPIC_ARN`: Topic for notifications
   - `LOG_LEVEL`: Logging verbosity
   - **Impact**: Tunable performance without code changes

#### Technical Implementation

**New Files:**

- `template.yaml`: SAM/CloudFormation infrastructure definition
- `lambda/handler.js`: Lambda function entry point with SNS notification logic
- `lib/storage/StorageInterface.js`: Abstract storage interface
- `lib/storage/LocalStorage.js`: Filesystem storage implementation
- `lib/storage/S3Storage.js`: S3 storage implementation
- `lib/storage/StorageFactory.js`: Factory for storage selection
- `docs/DEPLOYMENT_QUICKSTART.md`: Step-by-step Lambda deployment guide
- `docs/NOTIFICATIONS_SETUP.md`: SNS email configuration guide

**Modified Files:**

- `fetch-aws-data.js`: Updated to use storage factory pattern
- `config.js`: Added S3 and environment variable configuration
- `package.json`: Added `@aws-sdk/client-s3` and `@aws-sdk/client-sns` dependencies

#### Infrastructure Resources Created

**S3 Resources:**

- S3 bucket with versioning enabled
- Lifecycle rules for automatic cleanup
- Public access blocking for security
- Tags for project identification

**Lambda Resources:**

- Lambda function with nodejs20.x runtime
- IAM role with least-privilege permissions (SSM read, S3 full, SNS publish)
- CloudWatch log group with 7-day retention
- EventBridge schedule rule for daily execution

**Monitoring Resources:**

- CloudWatch error alarm (threshold: 1 error)
- CloudWatch duration alarm (threshold: 120 seconds)
- SNS topic for notifications
- Optional SNS email subscription

#### Lambda Execution Flow

```
EventBridge (2 AM UTC)
    ↓
Lambda Function Invocation
    ↓
Fetch Regions/Services from SSM
    ↓
Check S3 Cache (24-hour TTL)
    ↓
Process Regions (batch processing)
    ↓
Save to S3 (regions.json, services.json, complete-data.json)
    ↓
Send SNS Success Notification
    ↓
CloudWatch Logs
```

#### Performance Characteristics

| Metric             | Without Cache | With Cache         | Cost Impact               |
| ------------------ | ------------- | ------------------ | ------------------------- |
| Execution time     | ~1m 49s       | ~13s               | Lambda charges            |
| SSM API calls      | ~2,300        | ~160               | Minimal (under free tier) |
| S3 operations      | 3 writes      | 3 reads + 3 writes | Minimal (under free tier) |
| Lambda memory      | 512MB         | 512MB              | $0.0000000083/ms          |
| Total monthly cost | -             | -                  | ~$0.04/month              |

#### Deployment Process

```bash
# 1. Install dependencies
npm install

# 2. Build Lambda package
sam build

# 3. Deploy infrastructure (first time with --guided)
sam deploy --guided

# 4. Deploy updates (after first deployment)
sam deploy

# 5. Manual invocation (standard)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# For force refresh (bypasses cache), use async invocation
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --invocation-type Event \
  --payload '{"forceRefresh":true}' \
  response.json
```

#### S3 Data Structure

```
s3://aws-data-fetcher-output/
└── aws-data/
    ├── regions.json           # 38 regions with AZ counts
    ├── services.json          # 394 services with names
    ├── complete-data.json     # Full dataset with service mapping
    ├── .cache-services-by-region.json  # 24-hour cache
    └── history/               # Versioned files (30-day retention)
```

#### SNS Notification Example

**Success Notification:**

```
Subject: ✅ AWS Data Fetcher Success - 13s

AWS Data Fetcher completed successfully!

Summary:
- Regions: 38
- Services: 394
- Duration: 13s
- Request ID: abc123-def456

S3 Paths:
- Regions: s3://aws-data-fetcher-output/aws-data/regions.json
- Services: s3://aws-data-fetcher-output/aws-data/services.json
- Complete: s3://aws-data-fetcher-output/aws-data/complete-data.json

Service Mapping:
- Total Regions: 38
- Average Services per Region: 227
- Cached Regions: 38
- Fetched Regions: 0
```

**Error Notification:**

```
Subject: ❌ AWS Data Fetcher Error - AccessDeniedException

AWS Data Fetcher execution failed!

Error: User is not authorized to perform: ssm:GetParametersByPath

Details:
- Request ID: abc123-def456
- Duration before failure: 5s
- Error Type: AccessDeniedException

Stack Trace:
[Full stack trace]

Please check CloudWatch Logs for more details:
[CloudWatch console link]
```

#### Benefits

1. **Zero Server Management**

   - No EC2 instances to maintain
   - Automatic scaling and high availability
   - AWS manages runtime and patching
   - **Impact**: Reduced operational overhead

2. **Cost-Effective**

   - Pay-per-execution pricing
   - ~$0.04/month for daily execution
   - Minimal S3 storage costs
   - No idle server costs
   - **Impact**: 99% cost reduction vs EC2

3. **Automated Execution**

   - Daily scheduled runs (configurable)
   - No manual intervention required
   - Automatic data freshness
   - **Impact**: Always up-to-date infrastructure data

4. **Immediate Error Visibility**

   - Email notifications for failures
   - CloudWatch alarms for anomalies
   - Detailed error context in notifications
   - **Impact**: Fast problem resolution

5. **Infrastructure as Code**

   - Version-controlled infrastructure
   - Reproducible deployments
   - Easy parameter tuning
   - Safe infrastructure updates
   - **Impact**: DevOps best practices, audit trail

6. **Dual Deployment Options**
   - CLI tool for local development
   - Lambda for production automation
   - Same codebase for both
   - **Impact**: Development flexibility

#### IAM Permissions Required

**SSM Permissions:**

```yaml
- ssm:GetParameter
- ssm:GetParameters
- ssm:GetParametersByPath
Resource: arn:aws:ssm:*::parameter/aws/service/global-infrastructure/*
```

**S3 Permissions:**

```yaml
- s3:GetObject
- s3:PutObject
- s3:DeleteObject
- s3:ListBucket
Resource: [S3 bucket and objects]
```

**SNS Permissions:**

```yaml
- sns:Publish
Resource: [SNS topic ARN]
```

#### Configuration Parameters

**CloudFormation Parameters:**

- `S3BucketName`: Bucket name (default: aws-data-fetcher-output)
- `ScheduleExpression`: Cron expression (default: cron(0 2 \* _ ? _))
- `BatchSize`: Parallel processing (default: 10, range: 5-20)
- `PaginationDelay`: SSM delay in ms (default: 40, range: 20-100)
- `NotificationEmail`: Email for notifications (optional)

#### CloudFormation Outputs

- `OutputBucketName`: S3 bucket name
- `LambdaFunctionArn`: Function ARN for integrations
- `LambdaFunctionName`: Function name for manual invocation
- `ScheduleExpression`: Current schedule
- `S3DataUrl`: Direct link to S3 console
- `NotificationTopicArn`: SNS topic ARN

#### Error Handling & Recovery

1. **SSM API Throttling**

   - Exponential backoff retry (up to 5 attempts)
   - Adaptive pagination delays
   - Per-region error isolation
   - **Impact**: Robust API handling

2. **S3 Operation Failures**

   - Graceful error messages
   - Stack trace included in notifications
   - CloudWatch logs for debugging
   - **Impact**: Clear failure visibility

3. **Lambda Timeout Protection**

   - 180-second timeout (3 minutes)
   - Duration alarm at 120 seconds
   - Notification if execution time anomalous
   - **Impact**: Early warning system

4. **Cache Corruption**
   - JSON parse error handling
   - Falls back to full fetch if cache invalid
   - Logs cache errors
   - **Impact**: Self-healing behavior

#### Migration from CLI to Lambda

**For existing CLI users:**

1. Code continues to work locally (STORAGE_TYPE=local)
2. Lambda deployment adds automation without removing CLI capability
3. Same data structure in both local and S3 storage
4. Cache works in both environments

**Deployment steps:**

```bash
# 1. Test CLI still works
npm run complete

# 2. Deploy to Lambda
sam build && sam deploy --guided

# 3. Verify Lambda execution
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# 4. Check S3 data
aws s3 ls s3://aws-data-fetcher-output/aws-data/
```

## [1.4.0] - 2025-10-11

### Added - Region Launch Dates and Blog URLs

**Regions now include launch dates and announcement blog URLs from AWS RSS feed**

#### Feature Overview

Each region now includes launch date and blog URL information fetched from the official AWS Regions RSS feed. This provides historical context and links to official AWS announcements for each region.

#### Implementation Details

**Data Source:**

- Fetches data from AWS RSS feed: `https://docs.aws.amazon.com/global-infrastructure/latest/regions/regions.rss`
- Parses RSS XML to extract launch dates and blog post URLs
- Handles CloudFront security with proper User-Agent headers
- Gracefully handles missing data for isolated partitions (China, GovCloud)

**Output Structure:**

```json
{
  "code": "us-west-2",
  "name": "US West (Oregon)",
  "availabilityZones": 4,
  "launchDate": "Wed, 9 Nov 2011 19:00:00 GMT",
  "blogUrl": "https://aws.amazon.com/blogs/aws/now-open-us-west-portland-region/"
}
```

**Coverage:**

- 34 regions have launch data from RSS feed
- 4 regions show `null` (China and GovCloud regions not in public feed)

**Performance Impact:**

- Adds ~100-200ms for single RSS feed fetch
- Minimal impact on overall execution time
- No additional API calls to AWS services

#### Benefits

1. **Historical Context**: Know when each region was launched
2. **Official Announcements**: Direct links to AWS blog posts
3. **Planning Insights**: Understand region maturity and evolution
4. **Documentation**: Rich metadata for infrastructure planning

### Added - Availability Zone Counts Per Region

**Regions now include the number of Availability Zones (AZs) for each region**

#### Feature Overview

Each region in the output now includes an `availabilityZones` field showing the number of AZs available in that region. This data is fetched dynamically from SSM Parameter Store using the official AWS availability zone metadata.

#### Implementation Details

**Data Source:**

- Fetches all 120+ AZ IDs from `/aws/service/global-infrastructure/availability-zones`
- Maps each AZ to its parent region using `/aws/service/global-infrastructure/availability-zones/{az-id}/parent-region`
- Counts AZs per region and includes in region data

**Output Structure:**

```json
{
  "count": 38,
  "regions": [
    {
      "code": "us-east-1",
      "name": "US East (N. Virginia)",
      "availabilityZones": 6
    },
    {
      "code": "us-west-2",
      "name": "US West (Oregon)",
      "availabilityZones": 4
    }
  ]
}
```

**Console Output:**

```
📍 Fetching availability zones...
📍 Found 120 availability zones
📍 Mapping AZs to regions...
✅ us-east-1: US East (N. Virginia) (6 AZs)
✅ us-west-2: US West (Oregon) (4 AZs)
```

#### Performance Impact

| Metric             | Before       | After                       | Change     |
| ------------------ | ------------ | --------------------------- | ---------- |
| Regions fetch time | ~6-8 seconds | ~12-13 seconds              | +6 seconds |
| API calls          | ~38          | ~158 (38 regions + 120 AZs) | +120 calls |
| Data completeness  | Region names | Region names + AZ counts    | Enhanced   |

**Trade-off Justification**: The ~6 second increase provides valuable infrastructure planning data while maintaining fast execution (~12 seconds for complete region discovery).

#### Benefits

1. **Infrastructure Planning**: Know AZ availability before multi-region deployments
2. **Capacity Assessment**: Understand regional redundancy capabilities
3. **Complete Metadata**: Single source for all region information
4. **Official Data**: Uses AWS's authoritative AZ mapping from SSM

#### Use Cases

- **High-Availability Planning**: Design multi-AZ architectures based on actual AZ counts
- **Regional Capacity**: Identify regions with more AZ options (us-east-1: 6 AZs)
- **Compliance Requirements**: Verify AZ availability for regulatory requirements
- **Cost Optimization**: Consider AZ counts when planning regional deployments

### Changed - Dynamic Service Name Fetching from SSM

**Service names are now fetched dynamically from AWS SSM Parameter Store, eliminating manual maintenance**

#### Major Architecture Change

Previously, service names were hardcoded in `aws-service-names.js` (394 manual entries). Now, service names are fetched dynamically from SSM, making the tool truly zero-maintenance.

#### What Changed

**Code Changes:**

- Modified `discoverServices()` to fetch service names from SSM Parameter Store
- Added dynamic fetching from `/aws/service/global-infrastructure/services/{code}/longName`
- Consistent architecture: both regions and services use SSM as single source
- Progress indicators: shows "Fetched 10/394 service names..." during execution
- Removed unmapped service detection logic (no longer needed)
- Removed `unmapped-services.json` output file generation
- Removed `aws-service-names.js` hardcoded mapping file

**Benefits:**

1. **Zero Maintenance Required**

   - No manual tracking of new AWS services
   - Service names automatically up-to-date when AWS adds new services
   - No need to update hardcoded mapping files
   - **Impact**: Fully automatic, always current

2. **Official Names from AWS**

   - Uses AWS's authoritative SSM Parameter Store
   - Exact service names as defined by AWS
   - No risk of outdated or incorrect names
   - **Impact**: 100% accuracy

3. **Consistent Architecture**

   - Regions: fetched from SSM
   - Services: fetched from SSM
   - Service names: fetched from SSM (new!)
   - Single source of truth for all data
   - **Impact**: Simpler, more maintainable codebase

4. **Graceful Error Handling**
   - Uses service code as name if SSM fetch fails
   - Reports services with missing names in console
   - Continues processing even if some names unavailable
   - **Impact**: Robust operation

#### Performance Impact

| Metric              | Before (v1.3.0)    | After (v1.4.0)      | Change               |
| ------------------- | ------------------ | ------------------- | -------------------- |
| Services fetch time | ~4 seconds         | ~30-35 seconds      | Slower but automatic |
| API calls           | 0 (hardcoded)      | 394 (1 per service) | More API calls       |
| Maintenance effort  | Manual updates     | Zero                | Eliminated           |
| Data accuracy       | Risk of stale data | Always current      | Guaranteed fresh     |

**Trade-off Justification**: The ~30 second increase is acceptable because:

- Eliminates manual maintenance entirely
- Ensures names are always official and current
- Total runtime still under 40 seconds for complete fetch
- Consistent with region name fetching pattern

#### Example Service Names Fetched from SSM

```bash
# SSM provides official service names
/aws/service/global-infrastructure/services/ec2/longName
→ "Amazon Elastic Compute Cloud (EC2)"

/aws/service/global-infrastructure/services/bedrock/longName
→ "Amazon Bedrock"

/aws/service/global-infrastructure/services/arc-zonal-shift/longName
→ "Route53 Application Recovery Controller - Zonal Shift"
```

#### Output Changes

**services.json** now contains dynamically fetched names:

```json
{
  "count": 394,
  "services": [
    {
      "code": "ec2",
      "name": "Amazon Elastic Compute Cloud (EC2)"
    },
    {
      "code": "s3",
      "name": "Amazon Simple Storage Service (S3)"
    }
  ],
  "source": "ssm",
  "timestamp": "2025-10-11T19:16:13.537Z"
}
```

**Console Output** shows progress:

```
✅ Discovered 394 services from SSM
   Fetching service names from SSM...
   📋 Fetched 10/394 service names...
   📋 Fetched 20/394 service names...
   ...
   ✅ Fetched 394 service names from SSM
```

#### Files Affected

**Modified:**

- `fetch-aws-data.js`: Updated `discoverServices()` method
- `README.md`: Documented dynamic fetching and zero maintenance
- `CLAUDE.md`: Updated architecture documentation
- `PERFORMANCE.md`: Added v1.4.0 performance analysis
- `package.json`: Version bumped to 1.4.0

**Removed:**

- `aws-service-names.js`: Hardcoded service name mapping (no longer needed)
- Unmapped service tracking logic
- `unmapped-services.json` output file generation

#### Discovery Credit

This improvement was discovered by testing the SSM Parameter Store path:

```bash
aws ssm get-parameter \
  --name /aws/service/global-infrastructure/services/ec2/longName \
  --query "Parameter.Value" --output text
```

The tool now uses this same pattern for all 394 services, ensuring always-current, official AWS service names.

## [1.3.0] - 2025-10-11

### Changed - Simplified to SSM-Only Discovery

**Removed EC2 DescribeRegions API - SSM Parameter Store is the single authoritative source**

#### Simplification Benefits

1. **Single Authoritative Source**

   - SSM Parameter Store provides all 38 regions (commercial + China + GovCloud)
   - No need for dual-source comparison logic
   - SSM is AWS's official global infrastructure metadata source
   - **Impact**: Simpler, more maintainable codebase

2. **Reduced Dependencies**

   - Removed `@aws-sdk/client-ec2` dependency
   - Only one AWS SDK client needed
   - Smaller node_modules footprint
   - **Impact**: Faster npm install, reduced package size

3. **Cleaner Data Structure**

   - No more SSM vs EC2 comparison object
   - Direct region list from authoritative source
   - Simpler JSON output structure
   - **Impact**: Easier to understand and consume data

4. **Code Reduction**
   - Removed `getEC2Regions()` method
   - Removed `compareRegions()` method
   - Removed EC2 client initialization
   - **Impact**: ~100 lines of code removed

#### What Changed

**Code Changes:**

- Removed EC2Client import and initialization
- Removed `getEC2Regions()` method
- Removed `compareRegions()` method
- Simplified `run()` method to use only SSM regions
- Updated `regions.json` structure (no comparison object)

**Documentation Updates:**

- Updated README.md to reflect SSM-only approach
- Updated CLAUDE.md to remove dual-source methodology
- Removed all EC2 API references

**Dependencies:**

- Removed `@aws-sdk/client-ec2` from package.json

#### regions.json Structure (Before vs After)

**Before (v1.2.0)**:

```json
{
  "ssm": { "count": 38, "regions": [...] },
  "ec2": { "count": 34, "regions": [...] },
  "comparison": { "common": 34, "ssmOnly": [...], "merged": [...] }
}
```

**After (v1.3.0)**:

```json
{
  "count": 38,
  "regions": ["af-south-1", "ap-east-1", ...],
  "source": "ssm",
  "timestamp": "2025-10-11T02:32:48.616Z"
}
```

### Added - Runtime Tracking

**Display script execution time in summary output**

#### New Features

1. **Runtime Display**

   - Shows total execution time at end of script
   - Format: "Runtime: 45.23s" or "Runtime: 3m 15s"
   - **Impact**: Better performance monitoring

2. **Cumulative Services Display**
   - Changed from unique services count to cumulative sum across all regions
   - Shows sum of service counts per region (e.g., ~8,640 total service instances)
   - Uses comma formatting for readability (e.g., "8,640" instead of "8640")
   - More accurate representation of total service availability
   - **Impact**: Shows actual scale of service distribution (38 regions × ~227 avg services ≈ 8,640)

## [1.2.0] - 2025-10-11

### Changed - Architecture Simplification

**Removed redundant `services-by-region.json` file - using `complete-data.json` as single source of truth**

#### Simplification Benefits

1. **Single Source of Truth**

   - All data now lives in `complete-data.json` only
   - No more duplicate files with identical data
   - Clearer architecture and easier maintenance
   - **Impact**: Simpler codebase, less confusion

2. **Reduced Disk Usage**

   - Saves ~350KB per run by eliminating duplicate file
   - Only one file to backup/archive instead of two
   - **Impact**: 50% reduction in output file count for service mapping

3. **Data Extraction**
   - Users can extract portions using `jq` if needed
   - Example: `cat complete-data.json | jq '.servicesByRegion' > my-file.json`
   - **Impact**: Flexibility without redundancy

#### Files Removed

- `services-by-region.json` - data now only in `complete-data.json`

#### Files Retained

- `complete-data.json` - **single source of truth** for all data
- `regions.json` - lightweight region comparison
- `services.json` - lightweight service list
- `region-details.json` - optional detailed metadata

### Added - Time-Based Caching System

**10-50x Speedup for Repeated Runs: 3-5 minutes → <5 seconds**

#### Intelligent 24-Hour Cache

1. **Time-Based Caching**

   - Automatic caching of service-by-region data
   - 24-hour TTL (Time To Live) per region
   - Cache file: `.cache-services-by-region.json` in output directory
   - **Impact**: Subsequent runs complete in <5 seconds instead of 3-5 minutes

2. **Smart Cache Validation**

   - Per-region cache validation (not all-or-nothing)
   - Automatically detects and refreshes stale regions
   - Partial cache hits supported (mix of cached and fresh data)
   - **Impact**: Optimal balance between speed and data freshness

3. **Force Refresh Option**

   - New CLI flag: `--force-refresh` / `-f`
   - Bypass cache entirely when needed
   - Useful after AWS service announcements
   - **Impact**: Full control over cache behavior

4. **Cache Statistics**
   - Real-time reporting of cache hits/misses
   - Shows cached vs fetched region counts
   - Console output includes cache status
   - **Impact**: Transparency in cache performance

#### Technical Implementation

- **Cache Methods**: `loadCache()`, `saveCache()`, `isCacheValid()`
- **Cache Structure**: Identical to `services-by-region.json` with `lastFetched` timestamps
- **Validation Logic**: Compares `Date.now()` to `lastFetched + 24 hours`
- **Early Return**: If all regions cached, skips API calls entirely

#### Performance Impact

| Scenario                 | Before  | After   | Improvement           |
| ------------------------ | ------- | ------- | --------------------- |
| First run (no cache)     | 3-5 min | 3-5 min | Same                  |
| Second run (fresh cache) | 3-5 min | <5 sec  | 10-50x faster         |
| Partial cache (10 stale) | 3-5 min | ~1 min  | 3-5x faster           |
| Force refresh            | 3-5 min | 3-5 min | Same (bypasses cache) |

#### Usage Examples

```bash
# First run - fetches all data, saves cache
npm run complete
# → Takes 3-5 minutes

# Second run - uses cache
npm run complete
# → ✅ All 38 regions loaded from cache, no API calls needed!
# → Takes <5 seconds

# Force refresh - bypasses cache
node fetch-aws-data.js --include-service-mapping --force-refresh
# → Takes 3-5 minutes, updates cache
```

#### Benefits

- **Massive speedup**: 10-50x faster for repeated runs
- **Reduced AWS costs**: Fewer SSM API calls
- **Rate limit protection**: Fewer API requests overall
- **Developer experience**: Instant feedback during development/testing
- **Flexible control**: Force refresh when needed

### Changed

- Updated CLI help text to include `--force-refresh` option
- Enhanced console output with cache statistics
- Modified `fetchServicesByRegion()` to support caching and force refresh

## [1.1.0] - 2025-10-11

### Performance Improvements - Phase 1

**4-5x Speedup for Service-by-Region Mapping: 15 minutes → 3-5 minutes**

#### Optimizations Implemented

1. **Parallel Batch Processing**

   - Changed from sequential region processing to parallel batches
   - Batch size: 5 regions processed simultaneously (conservative for rate limit safety)
   - Uses `Promise.all()` to process multiple regions concurrently
   - **Impact**: ~4-5x speedup

2. **Adaptive Throttling with Retry Logic**

   - Base delay: 50ms between paginated requests (increased from 25ms for stability)
   - Exponential backoff retry: Automatically retries rate-limited requests
   - Adaptive delays: Increases delay if retries are needed
   - **Impact**: Robust rate limit handling with minimal slowdown

3. **Real-time Progress Tracking**

   - Added batch progress indicators (Batch 1/8, 2/8, etc.)
   - Displays ETA (Estimated Time Remaining) for each region
   - Shows average processing time per region
   - Better user experience with live progress updates

4. **Exponential Backoff Retry System**
   - Up to 5 retries for rate-limited requests
   - Backoff delays: 100ms, 200ms, 400ms, 800ms, 1600ms
   - Per-request and per-region retry logic
   - Graceful error recovery

#### Technical Details

- Processes 38 regions in 8 batches (5+5+5+5+5+5+5+3)
- Each region makes ~50-60 paginated API calls
- Total API calls: ~2,000-2,300 requests
- Concurrent requests: Up to 5 regions × ~20 req/sec = 100 req/sec
- Conservative approach to avoid AWS SSM rate limits (40 TPS per region)

#### Performance Metrics

| Metric               | Before        | After                | Improvement   |
| -------------------- | ------------- | -------------------- | ------------- |
| Total execution time | ~15 min       | ~3-5 min             | 4-5x faster   |
| Throttle delay       | 100ms         | 50ms (adaptive)      | More reliable |
| Region processing    | Sequential    | Parallel (batch=5)   | 5x faster     |
| User feedback        | Basic counter | ETA + batch progress | Enhanced      |
| Error handling       | None          | Exponential backoff  | Robust        |

### Changed

- Updated all documentation to reflect new performance timings
- Modified CLI help text: "very slow, ~10-15 min" → "optimized, ~2-3 min"
- Enhanced console output with batch processing and ETA information

## [Unreleased] - 2025-10-10

### Added

- **Service-by-Region Mapping**: Comprehensive feature to map every AWS service available in each region
  - New method `fetchServicesByRegion()` to query service availability per region
  - New CLI option `--include-service-mapping` / `-m` to enable this feature
  - New npm script `npm run complete` for full data fetch including service mapping
  - New output file `services-by-region.json` containing:
    - Service count per region
    - Complete list of services for each region
    - Summary statistics (total regions, total services, average services per region)
  - Updated `complete-data.json` to include `servicesByRegion` when mapping is enabled

### Changed

- Updated README.md with comprehensive npm command documentation
  - Added NPM commands table with execution times
  - Added CLI options reference table
  - Added documentation for new service mapping feature
  - Fixed all markdown linting errors
- Updated package.json with new `complete` script
- Enhanced complete-data.json output structure to include optional service-by-region mapping

### Performance Notes

- Service-by-region mapping is **very slow** (~10-15 minutes)
  - Queries 38 regions × ~200-250 services per region
  - Makes thousands of API calls with pagination
  - Recommended to run only when comprehensive data is needed

### Technical Details

- **Discovery**: Fetches 394 AWS services from SSM Parameter Store
- **Regions**: Processes all 38 regions (34 commercial + 4 specialized)
- **Per-Region Data**: Queries `/aws/service/global-infrastructure/regions/{region}/services` path
- **Output Size**: `complete-data.json` increases from ~12KB to ~500KB+ with service mapping

### Data Structure

#### services-by-region.json Format

```json
{
  "byRegion": {
    "{region-code}": {
      "regionCode": "string",
      "serviceCount": number,
      "services": ["service1", "service2", "..."]
    }
  },
  "summary": {
    "totalRegions": 38,
    "totalServices": 394,
    "averageServicesPerRegion": number,
    "timestamp": "ISO-8601"
  }
}
```

### Usage Examples

```bash
# Quick fetch (regions + services only)
npm start

# Full fetch with service-by-region mapping (slow)
npm run complete

# Direct command with service mapping
node fetch-aws-data.js --include-service-mapping

# Everything (region details + service mapping)
node fetch-aws-data.js --include-details --include-service-mapping
```

### Benefits

- **Service Availability Analysis**: See exactly which services are available in each region
- **Regional Planning**: Plan deployments based on service availability
- **Gap Analysis**: Identify services missing in specific regions
- **Coverage Metrics**: Calculate average service availability across regions
- **Verification**: Cross-check service availability data from AWS

### Known Limitations

- Very time-consuming operation (10-15 minutes for full execution)
- Requires AWS credentials with SSM read permissions
- May hit API rate limits on slower connections (100ms throttle included)
- Large output file size (~500KB+ JSON)

## [1.0.0] - 2025-10-10

### Initial Release

- Dual-source region discovery (SSM + EC2)
- Service discovery from SSM Parameter Store
- Region comparison and merging
- Optional detailed region metadata
- JSON output for all data
- CLI interface with Commander.js
- NPM scripts for common operations
