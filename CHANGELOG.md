# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

```
┌─────────────────────┐    ┌─────────────────────┐
│  EventBridge        │    │  EventBridge        │
│  2 AM UTC           │    │  3 AM UTC           │
└──────────┬──────────┘    └──────────┬──────────┘
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Lambda             │    │  Lambda             │
│  infra-data-handler │    │  whats-new-handler  │
│  (Infrastructure)   │    │  (RSS Feed)         │
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
