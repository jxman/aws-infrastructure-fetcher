# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed - Node.js Runtime Upgrade to 22.x with ARM64

**Runtime Update**: Upgraded Lambda functions from Node.js 20.x to Node.js 22.x with ARM64 (Graviton2) architecture.

**Changes**:
- **Lambda Runtime**: Updated from `nodejs20.x` to `nodejs22.x`
- **Architecture**: Added ARM64 (Graviton2) for 20% cost savings
- **Support Extended**: Node.js 22.x support until April 2027 (vs April 2026 for 20.x)
- **Package.json**: Updated Node.js engine requirement from >=20.0.0 to >=22.0.0
- **GitHub Actions**: Updated CI/CD workflow from Node.js 20 to Node.js 22

**Functions Updated**:
- `DataFetcherFunction` (aws-data-fetcher)
- `WhatsNewFetcherFunction` (aws-whats-new-fetcher)

**Benefits**:
- ✅ Extended support timeline (additional 1 year)
- ✅ 20% cost reduction with ARM64 architecture
- ✅ Better performance with Graviton2 processors
- ✅ Follows AWS Lambda best practices (ARM64 mandatory for cost optimization)
- ✅ Fully backward compatible (no code changes required)

**Cost Impact**:
- Lambda compute cost reduced by ~20% due to ARM64 pricing
- Total monthly cost: ~$1.06/month → ~$0.85/month (estimated)

**SAM Template Changes**:
- `template.yaml`: Updated Runtime to `nodejs22.x` for both functions
- `template.yaml`: Added `Architectures: [arm64]` for both functions
- `.github/workflows/deploy.yml`: Updated Node.js version to 22

### Added - GitHub Actions CI/CD Pipeline

**Automated Deployment**: Complete GitHub Actions workflow for test, validate, and deploy operations.

**OIDC Authentication**:
- Bootstrap script for one-time IAM setup: `scripts/setup-oidc.sh`
- IAM Role: `GithubActionsOIDC-AWSServicesDataFetcher-Role`
- IAM Policy: `GithubActions-AWSServicesDataFetcher-Policy`
- OIDC Provider: `token.actions.githubusercontent.com`
- No long-lived AWS credentials in GitHub (federated authentication)

**Workflow Features** (`.github/workflows/deploy.yml`):
- **Test & Validate Job**: Runs on all branches and PRs
  - Node.js 20.x setup with dependency caching
  - npm install with dependency verification
  - SAM template validation with linting
  - SAM build verification
- **Deploy Job**: Runs only on main branch pushes
  - OIDC authentication with AWS
  - SAM build and deployment
  - Stack outputs and deployment summary
  - Automatic parameter injection (Environment, ProjectName, ServiceName, GithubRepository)

**Documentation**:
- **Created**: `DEPLOYMENT.md` (14KB comprehensive deployment guide)
  - Architecture overview with deployment pipeline diagram
  - Prerequisites and initial setup instructions
  - Bootstrap script execution steps
  - GitHub repository configuration
  - Automated and manual deployment procedures
  - Monitoring and verification commands
  - Troubleshooting guide with common issues
  - IAM permission update synchronization pattern
  - Security best practices and emergency procedures

**Benefits**:
- ✅ Automated deployment on every push to main
- ✅ OIDC-based authentication (no AWS credentials in GitHub)
- ✅ Repository isolation (dedicated IAM role per project)
- ✅ Comprehensive testing before deployment
- ✅ Full audit trail via CloudTrail and GitHub Actions logs

### Added - Customer-Managed KMS Encryption

**Security Compliance**: Resolved Snyk security issue SNYK-CC-AWS-415 (CloudWatch log group not encrypted with managed key).

**KMS Key Configuration**:
- **Resource**: `LogsKmsKey` (AWS::KMS::Key)
- **Description**: KMS key for CloudWatch Logs encryption (aws-data-fetcher)
- **Automatic Rotation**: Enabled (annual rotation for compliance)
- **Key Alias**: `alias/sam-aws-services-fetch-logs`
- **Key Policy**: Allows CloudWatch Logs service and root account access
- **Resource Location**: `template.yaml` lines 160-213

**CloudWatch Log Group Encryption**:
- Both Lambda function log groups now use customer-managed KMS encryption:
  - Data Fetcher: `/aws/lambda/aws-data-fetcher`
  - What's New Fetcher: `/aws/lambda/aws-whats-new-fetcher`
- 7-day retention with KMS encryption at rest
- KmsKeyId property links log groups to customer-managed key

**IAM Permissions**:
- Added comprehensive KMS permissions to GitHub Actions IAM policy
- **Live Policy**: Updated to version v2 with KMS permissions
- **Bootstrap Script**: Updated `scripts/setup-oidc.sh` with matching KMS permissions
- **Synchronization**: Both updates committed together to prevent drift

**Security Benefits**:
- ✅ Customer control over encryption keys and rotation
- ✅ Meets security compliance requirements (SNYK-CC-AWS-415 resolved)
- ✅ Automatic key rotation without downtime
- ✅ CloudTrail audit trail for all KMS key usage
- ✅ Granular permissions via key policy conditions
- ✅ Data protection with customer-managed keys

**Cost Impact**:
- KMS Key: $1.00/month (single key for both log groups)
- API Calls: ~$0.02/month (encrypt/decrypt operations)
- Total KMS Cost: ~$1.02/month
- **Total Project Cost**: ~$1.06/month (including Lambda, S3, SNS, and KMS)

**Documentation**:
- **Updated**: README.md - Added KMS encryption to Security Features section
- **Updated**: README.md - Updated cost estimate from $0.04/month to $1.06/month
- **Updated**: DEPLOYMENT.md - Added KMS verification commands and troubleshooting
- **Updated**: CLAUDE.md - Added comprehensive "Security and Compliance" section

### Changed - Complete AWS Tagging Compliance

**100% Tagging Compliance**: All 10 AWS resources now have complete standardized tags.

**Tagging Implementation**:
- **SAM Template Parameters**: Added Environment, ProjectName, ServiceName, GithubRepository
- **Globals Section**: Lambda function tags applied automatically via Globals
- **Resource-Specific Tags**: All 10 resources have Name and SubService tags
- **Tag Values**:
  - Environment: `prod`
  - ManagedBy: `sam` (for SAM-deployed resources)
  - Owner: `John Xanthopoulos`
  - Project: `aws-services`
  - Service: `aws-infrastructure-data-fetcher`
  - GithubRepo: `github.com/jxman/aws-infrastructure-fetcher`
  - Name: Resource-specific names
  - SubService: Component identifiers (e.g., `data-fetcher-function`, `whats-new-fetcher-function`)

**Resources Tagged** (8/8 required tags):
1. DataFetcherFunction (Lambda)
2. WhatsNewFetcherFunction (Lambda)
3. OutputBucket (S3)
4. NotificationTopic (SNS)
5. FunctionLogGroup (CloudWatch Logs)
6. WhatsNewFunctionLogGroup (CloudWatch Logs)
7. DataFetcherErrorAlarm (CloudWatch Alarm)
8. DataFetcherDurationAlarm (CloudWatch Alarm)
9. WhatsNewErrorAlarm (CloudWatch Alarm)
10. WhatsNewDurationAlarm (CloudWatch Alarm)
11. LogsKmsKey (KMS Key)
12. LogsKmsKeyAlias (KMS Key Alias)

**Standards Updated**:
- **Global CLAUDE.md**: Added `ManagedBy = sam` to tagging standards
- Also added support for `cloudformation`, `cdk`, and `pulumi` for future projects

**Benefits**:
- ✅ Complete cost allocation tracking by Environment, Project, Service
- ✅ Resource discovery via AWS Resource Groups Tagging API
- ✅ Tag-based IAM policies for access control
- ✅ Compliance with organizational tagging standards
- ✅ Easier resource management and automation

### Changed - Documentation Updates

**Comprehensive Documentation Refresh**: All project documentation updated to reflect KMS encryption, CI/CD pipeline, and tagging compliance.

**README.md Updates**:
- Security Features section: Added KMS encryption details
- Monitoring section: Added KMS encryption and complete tagging notes
- Cost Estimate: Updated from $0.04/month to $1.06/month
- Deployment section: Now recommends GitHub Actions as primary deployment method
- Added "CI/CD Ready" feature highlight

**DEPLOYMENT.md Updates**:
- Architecture section: Added KMS Key and KMS Key Alias to application resources
- CloudWatch Log Groups: Updated description to indicate KMS encryption
- Monitoring section: Added "Verify KMS Encryption" subsection with verification commands
- Troubleshooting section: Added "KMS Key Permission Errors" troubleshooting guide
- Complete guide for bootstrap script execution and GitHub Actions setup

**CLAUDE.md Updates**:
- Added comprehensive "Security and Compliance" section (130+ lines)
- KMS Key Configuration details with key policy highlights
- CloudWatch Log Group Encryption specifics
- IAM Permissions for KMS with full policy JSON
- Verification Commands for KMS encryption validation
- Cost Impact breakdown for customer-managed KMS
- Security Benefits checklist
- Critical considerations when modifying KMS configuration
- IAM Policy Synchronization pattern reference

---

## [1.9.0] - 2025-10-30

### Changed - What's New Fetcher: Increased Frequency

**Schedule Update**: What's New fetcher now runs **4 times daily** instead of once daily.

**New Schedule** (evenly spaced every 6 hours):

- 2 AM UTC
- 8 AM UTC
- 2 PM UTC
- 8 PM UTC

**Previous Schedule**:

- 3 AM UTC (once daily)

**Rationale**:

- More timely updates throughout the day
- Better coverage for time-sensitive AWS announcements
- Ensures users see new announcements within 6 hours of publication
- Minimal cost increase (~$0.0012/month total operational cost)

**Implementation**:

- `template.yaml`: Replaced single `DailySchedule` with four separate schedules
  - Schedule2AM: `cron(0 2 * * ? *)`
  - Schedule8AM: `cron(0 8 * * ? *)`
  - Schedule2PM: `cron(0 14 * * ? *)`
  - Schedule8PM: `cron(0 20 * * ? *)`
- Each schedule creates its own EventBridge rule and Lambda permission
- All schedules enabled by default

### Changed - What's New Fetcher: Time-Based Filtering

**Breaking Change**: What's New fetcher now uses time-based filtering instead of count-based.

**Previous Behavior**:

- Fetched latest 20 articles (count-based)
- Configurable via `OUTPUT_LIMIT` environment variable

**New Behavior**:

- Fetches all articles from **last 14 days**
- Safety cap at **100 items maximum** (whichever is smaller)
- Configurable via `DAYS_TO_INCLUDE` and `MAX_ITEMS` environment variables

**Rationale**:

- More predictable and consistent data volume over time
- Captures all announcements regardless of AWS announcement frequency
- Better for tracking recent changes comprehensively
- Prevents missing announcements during high-activity periods (e.g., re:Invent)

**Implementation Details**:


Changes in `src/core/whats-new-fetcher.js`:

- Updated constructor: `outputLimit` → `daysToInclude` + `maxItems`
- Added date threshold calculation (14 days ago)
- Added time-based filtering before count-based cap
- Enhanced logging with threshold dates and cap warnings
- Updated metadata: added `daysIncluded`, `maxItemsCap`, `dateThreshold`
- Version bumped to 1.1.0

Changes in `src/lambda/whats-new-handler.js`:

- Updated environment variable handling
- Changed from `OUTPUT_LIMIT` (20) → `DAYS_TO_INCLUDE` (14) + `MAX_ITEMS` (100)
- Updated documentation comments

Changes in `template.yaml`:

- Updated environment variables for WhatsNewFetcherFunction
- Changed `OUTPUT_LIMIT: 20` → `DAYS_TO_INCLUDE: 14` + `MAX_ITEMS: 100`
- Updated function description

**Expected Output**:

- Typical volume: 50-80 announcements per 14-day window
- During quiet periods: May be as low as 20-30 announcements
- During high activity (e.g., re:Invent): Capped at 100 announcements
- Variable output size based on AWS announcement frequency

**Testing**:

- Verified with live RSS feed: 74 announcements within 14-day window
- Confirmed date filtering logic works correctly
- Validated metadata includes new fields

---

## [1.8.0] - 2025-10-29

### Added - AWS What's New RSS Feed Fetcher

**New Lambda Function: aws-whats-new-fetcher**

- **RSS Feed Parser**: Fetches and parses AWS What's New announcements from official RSS feed
- **Latest 20 Articles**: Automatically limits output to most recent 20 announcements
- **Structured JSON Output**: Clean schema with title, summary, date, categories, link, HTML content
- **HTML Sanitization**: Removes dangerous tags (script, iframe, object) and inline event handlers
- **Daily Schedule**: Runs at 3 AM UTC (1 hour after infrastructure fetcher)
- **Dual-Bucket Storage**: Writes to both source bucket (`aws-data-fetcher-output/aws-data/`) and distribution bucket (`www.aws-services.synepho.com/data/`) for consistency
- **CloudFront Integration**: Uses natural 5-minute cache TTL (no manual invalidation)
- **SNS Notifications**: Success and error notifications with announcement preview
- **Fast Execution**: Typical runtime <5 seconds
- **Low Cost**: ~$0.0003/month operational cost

**Core Implementation**:
- `src/core/whats-new-fetcher.js`: RSS parsing and formatting logic (300+ lines)
- `src/lambda/whats-new-handler.js`: Lambda entry point (200+ lines)
- Dependencies: xml2js (XML parsing), he (HTML entity decoding)

**SAM Template Updates**:
- Added WhatsNewFetcherFunction resource
- Added WhatsNewFunctionLogGroup resource
- Added WhatsNewErrorAlarm and WhatsNewDurationAlarm
- Daily EventBridge schedule at 3 AM UTC
- IAM permissions: S3 write to both source and distribution buckets, SNS publish
- Environment variables: S3_BUCKET_NAME, S3_PREFIX for source bucket consistency
- Timeout: 30 seconds, Memory: 256 MB

### Changed - Handler Rename for Consistency

- **Renamed**: `src/lambda/handler.js` → `src/lambda/infra-data-handler.js`
- **Rationale**: Establishes consistent `<purpose>-handler.js` naming pattern
- **Impact**: Prepares project for multi-function architecture, improves clarity
- **SAM Template**: Updated `Handler` path to `src/lambda/infra-data-handler.handler`
- **Git History**: Preserved via `git mv` command (use `--follow` to view full history)

### Documentation

- **Created**: `docs/AWS_WHATS_NEW_FETCHER_DESIGN.md` - comprehensive design document (900+ lines)
- **Created**: `docs/PROJECT_RESTRUCTURING_PLAN.md` - handler rename and implementation strategy
- **Updated**: README.md - added What's New fetcher documentation
- **Updated**: ROADMAP.md - marked RSS fetcher as completed (v1.8.0)

### Dependencies

- **Added**: `xml2js@^0.6.2` - RSS XML parsing
- **Added**: `he@^1.2.0` - HTML entity decoding and sanitization

### Architecture

```text
┌─────────────────────┐    ┌─────────────────────┐
│  EventBridge        │    │  EventBridge        │
│  2 AM UTC           │    │  3 AM UTC (old)     │
└──────────┬──────────┘    └──────────┬──────────┘
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Lambda             │    │  Lambda             │
│  infra-data-handler │    │  whats-new-handler  │
│  (Infrastructure)   │    │  (RSS Feed - 4x/day)│
└──────────┬──────────┘    └──────────┬──────────┘
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│  S3 Distribution    │    │  S3 Distribution    │
│  complete-data.json │    │  aws-whats-new.json │
└─────────────────────┘    └─────────────────────┘
```

---

## [1.7.0] - 2025-10-29

### Changed - Removed CloudFront Manual Invalidation

**Rationale**: CloudFront's 5-minute cache TTL provides sufficient freshness for daily updates. Manual invalidation adds unnecessary cost, complexity, and potential failure modes.

**Infrastructure Fetcher Changes**:
- **Removed**: `invalidateCloudFrontCache()` method from `src/storage/s3-storage.js`
- **Removed**: CloudFront client initialization and lazy loading
- **Removed**: CloudFront IAM permissions from SAM template
- **Removed**: `CloudFrontDistributionId` parameter from SAM template
- **Removed**: `CLOUDFRONT_DISTRIBUTION_ID` environment variable
- **Updated**: SNS notifications to reflect automatic cache refresh (no invalidation status)
- **Updated**: Console logging to indicate automatic 5-minute cache refresh

**Benefits**:
- ✅ **Cost Savings**: $0.15/month → $0 (100% reduction in invalidation costs)
- ✅ **Simpler Code**: Removed 60+ lines of CloudFront invalidation logic
- ✅ **Fewer IAM Permissions**: No CloudFront permissions needed
- ✅ **Same User Experience**: 5-minute cache TTL is perfectly acceptable for daily updates
- ✅ **Fewer Failure Modes**: Eliminates potential CloudFront API errors

**Cache Behavior**:
- **Edge Cache TTL**: 5 minutes (respects `Cache-Control: max-age=300` header)
- **Natural Cache Expiration**: CloudFront automatically refreshes after 5 minutes
- **After Update**: Cache refreshes automatically within 0-5 minutes (no manual invalidation needed)

**Documentation**:
- **Created**: `docs/CLOUDFRONT_INVALIDATION_ANALYSIS.md` - detailed cost and technical analysis
- **Created**: `docs/CLOUDFRONT_REMOVAL_SUMMARY.md` - implementation summary and verification
- **Updated**: README.md - cache behavior section revised

---

## [1.6.0] - 2025-10-16

### Changed - Project Restructuring

**Architecture**: Reorganized codebase into modular structure following Node.js best practices.

**Directory Structure**:
- **src/**: All source code organized by concern
  - `src/cli.js`: CLI entry point (Commander.js)
  - `src/core/`: Core business logic (aws-data-fetcher.js, config.js)
  - `src/lambda/`: Lambda deployment (handler.js)
  - `src/storage/`: Storage abstraction (local, S3, factory)
- **scripts/**: Operational scripts (setup.sh)
- **tests/**: Test organization (unit/, integration/, fixtures/)
- **docs/**: Documentation files

**Benefits**:
- ✅ Clear separation of concerns
- ✅ Professional project structure
- ✅ Better IDE support and navigation
- ✅ Easier to maintain and extend
- ✅ Scalable for future growth

**Committed**: package-lock.json for reproducible builds

---

## [1.5.1] - 2025-10-13

### Changed - Node.js Runtime Upgrade

- **Upgraded**: Node.js 18.x → 20.x
- **SAM Template**: Updated Runtime from `nodejs18.x` to `nodejs20.x`
- **Rationale**: Resolved AWS deprecation warning (Node.js 18.x EOL April 2025)
- **Support**: Extended LTS support until April 2026
- **Impact**: No code changes required, fully backward compatible

---

## [1.5.0] - 2025-10-12

### Added - Change Tracking MVP

**Feature**: Track and report infrastructure data changes between runs.

**Implementation**:
- `src/core/change-tracker.js`: Change detection and formatting
- Storage-agnostic design (local filesystem and S3 support)
- Date-based change detection (daily granularity)
- Persistent change history in `change-history.json`

**Changes Tracked**:
- New regions added to AWS
- New services launched
- Service availability changes per region
- Timestamp and date for each change

**Benefits**:
- ✅ Automatic change detection
- ✅ Historical change tracking
- ✅ No duplicate entries (date-based deduplication)
- ✅ Works with both local and Lambda deployments

---

## [1.4.0] - 2025-10-11

### Added - Enhanced Region Metadata & Dynamic Names

**Region Launch Data**:
- Launch dates and blog announcement URLs from AWS RSS feed
- Historical context for all 34 commercial regions (4 regions have no public announcements)
- Fetched from: `https://docs.aws.amazon.com/global-infrastructure/latest/regions/regions.rss`

**Availability Zone Counts**:
- Added `availabilityZones` count to all regions
- Fetched from SSM Parameter Store (`/aws/service/global-infrastructure/availability-zones/`)
- Essential data for multi-AZ architecture planning

**Dynamic Service Names**:
- Service names now fetched from SSM Parameter Store (zero maintenance)
- Official AWS service names always up-to-date
- Fetched from: `/aws/service/global-infrastructure/services/{service-code}/longName`

**Performance Impact**:
- Adds ~6 seconds for AZ mapping (120+ API calls)
- Adds ~30 seconds for service name fetching (394 API calls)
- **Trade-off**: Slower but fully automatic with rich metadata

**Removed**:
- Unmapped service tracking (no longer needed with dynamic names)

---

## [1.3.0] - 2025-10-11

### Changed - SSM-Only Architecture

**Simplification**: Removed EC2 API dependency, using SSM as single authoritative source.

**Changes**:
- Removed EC2 DescribeRegions API calls
- Removed region comparison logic
- Removed EC2 IAM permissions from SAM template
- Simplified output (no more dual-source comparison)

**Benefits**:
- ✅ Simpler codebase (~100 lines removed)
- ✅ Fewer AWS API calls (fewer rate limit concerns)
- ✅ Single source of truth (SSM Parameter Store)
- ✅ Faster execution (no EC2 API calls)

**Runtime Tracking**:
- Added runtime duration to console output
- Added runtime to output JSON metadata

---

## [1.2.0] - 2025-10-11

### Added - Intelligent Caching System

**24-Hour Cache**:
- Service-by-region mapping cached for 24 hours
- Cache file: `output/.cache-services-by-region.json`
- Automatic cache validation and expiration
- Partial cache refresh (only fetch stale regions)

**Architecture Simplification**:
- Removed redundant `services-by-region.json`
- **Single source of truth**: `complete-data.json` contains all data
- Service mapping only in `complete-data.json` (under `servicesByRegion` key)

**Performance**:
- **First run (no cache)**: ~3-5 minutes
- **Subsequent runs (cached)**: <5 seconds
- **Speedup**: 10-50x faster for repeated runs

---

## [1.1.0] - 2025-10-11

### Added - Performance Phase 1

**Parallel Batch Processing**:
- Processes 5 regions simultaneously
- 4-5x speedup over sequential processing
- Configurable batch size in `src/core/config.js`

**Adaptive Throttling**:
- Base delay: 25-50ms between requests
- Automatic delay increases on rate limit errors
- Exponential backoff retry (up to 5 attempts)

**Real-time Progress Tracking**:
- Shows current region being processed
- Displays processed/total counts
- Calculates and shows estimated time remaining (ETA)

**Performance Results**:
- ~3-5 minutes for service-by-region mapping (first run)
- Consistent execution without rate limit errors

---

## [1.0.0] - 2025-10-10

### Added - Initial Release

**Core Features**:
- Dual-source region discovery (SSM + EC2)
- Service discovery from SSM Parameter Store
- Region comparison and merging logic
- JSON output with metadata and timestamps

**AWS Deployment**:
- Lambda function with SAM template
- S3 storage for data and cache
- SNS notifications for success/errors
- EventBridge daily schedule (2 AM UTC)

**CLI Interface**:
- Commander.js CLI with multiple run modes
- `--regions-only`, `--services-only`, `--include-service-mapping`
- `--force-refresh` to bypass cache

**Discovered Data**:
- **38 AWS Regions**: All commercial, China, and GovCloud regions
- **394+ AWS Services**: Complete service inventory
- **Service-by-Region Mapping**: Availability per region
- **eu-west-3 Verification**: Original project goal achieved ✅

---

## Version Format

- **MAJOR.MINOR.PATCH**
- **MAJOR**: Breaking changes (data contract, architecture)
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes, documentation, performance improvements

---

**Last Updated**: 2025-10-29
