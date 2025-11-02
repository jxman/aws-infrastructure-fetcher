# AWS Infrastructure Data Fetcher

**Automated AWS Lambda function that fetches and maintains AWS global infrastructure data (regions, services, and availability mappings) with S3 storage, SNS notifications, and daily automated updates.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![AWS SDK](https://img.shields.io/badge/AWS%20SDK-v3.645.0-orange.svg)](https://aws.amazon.com/sdk-for-javascript/)
[![Runtime](https://img.shields.io/badge/runtime-AWS%20Lambda-FF9900.svg)](https://aws.amazon.com/lambda/)
[![Infrastructure](https://img.shields.io/badge/IaC-AWS%20SAM-232F3E.svg)](https://aws.amazon.com/serverless/sam/)

## Technology Stack

### Core Runtime & Languages

- **Node.js** 20.x - JavaScript runtime
- **AWS SDK v3** - AWS service clients (SSM, S3, SNS, CloudFront)
- **JavaScript/ES6+** - Modern async/await patterns

### AWS Cloud Services

- **AWS Lambda** - Serverless compute (2 functions: data fetcher + What's New fetcher)
- **Amazon S3** - Object storage for data files and cache
- **AWS Systems Manager (SSM)** - Parameter Store for AWS infrastructure metadata
- **Amazon SNS** - Email notifications with KMS encryption at rest
- **Amazon EventBridge** - Scheduled function triggers (daily + 4x daily)
- **Amazon CloudWatch** - Logs, metrics, and alarms
- **AWS CloudFormation** - Infrastructure as Code via SAM

### Infrastructure & Deployment

- **AWS SAM (Serverless Application Model)** - Deployment framework
- **CloudFormation** - Infrastructure provisioning
- **IAM** - Role-based access control with least privilege policies

### Dependencies & Libraries

- **@aws-sdk/client-ssm** (^3.645.0) - SSM Parameter Store operations
- **@aws-sdk/client-s3** (^3.645.0) - S3 read/write operations
- **@aws-sdk/client-sns** (^3.645.0) - SNS publish notifications
- **@aws-sdk/client-cloudfront** (^3.645.0) - CloudFront distribution management
- **chalk** (^4.1.2) - Terminal output formatting (CLI mode)
- **commander** (^11.1.0) - CLI argument parsing
- **xml2js** (^0.6.2) - RSS feed XML parsing
- **he** (^1.2.0) - HTML entity encoding/decoding

### Security Features

- **KMS Encryption** - SNS topics encrypted at rest
- **IAM Least Privilege** - Function-specific permissions only
- **S3 Bucket Security** - Public access blocked, versioning enabled
- **HTML Sanitization** - Dangerous tags and scripts removed from RSS content

### Monitoring & Observability

- **CloudWatch Logs** - Function execution logs (7-day retention)
- **CloudWatch Alarms** - Error detection and duration monitoring
- **SNS Notifications** - Email alerts for errors and successful runs
- **CloudWatch Metrics** - Lambda invocations, errors, duration

## Overview

This project deploys a serverless Lambda function that automatically fetches and maintains comprehensive AWS infrastructure data from AWS SSM Parameter Store. Data is stored in S3 with intelligent 24-hour caching, daily automated updates via EventBridge, and optional email notifications for all runs.

### What It Does

**Infrastructure Data Fetcher (aws-data-fetcher)**:
- **Discovers 38 AWS Regions**: All commercial, China, and GovCloud regions
- **Catalogs 394+ AWS Services**: Complete service inventory from SSM
- **Maps Service Availability**: Which services are available in each region
- **S3 Storage**: All data and cache files stored in S3
- **Daily Automated Updates**: EventBridge schedule (2 AM UTC)
- **Smart Caching**: 24-hour TTL reduces execution from 1m 49s to 13s

**What's New RSS Fetcher (aws-whats-new-fetcher)**:
- **14-Day Time Window**: Fetches all announcements from last 14 days (max 100 items)
- **4x Daily Updates**: Runs every 6 hours (2 AM, 8 AM, 2 PM, 8 PM UTC)
- **Structured JSON Output**: Title, summary, date, categories, link, HTML content
- **HTML Sanitization**: Removes dangerous tags and inline event handlers
- **CloudFront CDN**: Public access with 5-minute cache TTL
- **Fast Execution**: Typical runtime <5 seconds

**Shared Features**:
- **SNS Notifications**: Email alerts for successful runs and errors
- **Manual Triggers**: Invoke anytime via AWS CLI or console
- **CloudWatch Monitoring**: Built-in alarms and logging

### Why This Project Exists

Originally created to troubleshoot missing AWS regions (specifically `eu-west-3` - Paris), this evolved into a production-ready Lambda deployment that provides:

- **Authoritative Data Source**: Direct from AWS SSM Parameter Store
- **Always Current**: Automatically updates daily
- **Zero Maintenance**: Serverless architecture with intelligent caching
- **Cost-Effective**: ~$0.04/month total operational cost
- **Production Ready**: Includes monitoring, alarms, and notifications

## Quick Start

### Prerequisites

- **AWS Account** with permissions to deploy Lambda, S3, and CloudFormation
- **AWS CLI** installed and configured ([Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- **SAM CLI** installed ([Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html))
- **Node.js** >= 20.0.0 ([Download](https://nodejs.org/))

### Deploy to AWS Lambda (5 minutes)

```bash
# 1. Clone or navigate to project directory
cd /path/to/nodejs-aws-fetcher

# 2. Install dependencies
npm install

# 3. Build Lambda package
sam build

# 4. Deploy to AWS (guided - first time only)
sam deploy --guided

# Follow prompts:
# - Stack Name: sam-aws-services-fetch
# - AWS Region: us-east-1 (or your preferred region)
# - S3 Bucket: YOUR-UNIQUE-BUCKET-NAME (must be globally unique!)
# - Schedule: cron(0 2 * * ? *) (daily at 2 AM UTC)
# - Confirm all changes: Y
```

### Test Your Deployment

```bash
# Invoke Lambda manually
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# View response
cat response.json | jq

# Check S3 for data files
aws s3 ls s3://YOUR-BUCKET-NAME/aws-data/

# View CloudWatch logs
sam logs --name DataFetcherFunction --stack-name sam-aws-services-fetch --tail
```

**Done!** Your Lambda function is now running daily at 2 AM UTC, fetching fresh AWS infrastructure data.

## Architecture

### Infrastructure Data Fetcher (aws-data-fetcher)

```
┌─────────────────────┐
│  EventBridge        │
│  Schedule           │──Daily 2 AM UTC──┐
│  (cron)             │                  │
└─────────────────────┘                  │
                                         ▼
                              ┌─────────────────────┐
                              │  Lambda Function    │
                              │  aws-data-fetcher   │
                              │  (Node.js 20)       │
                              └─────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
         ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
         │  SSM Parameter  │  │  S3 Bucket      │  │  SNS Topic      │
         │  Store          │  │  Data + Cache   │  │  Notifications  │
         │  (Read)         │  │  (Read/Write)   │  │  (Publish)      │
         └─────────────────┘  └─────────────────┘  └─────────────────┘
               │                       │                     │
               │                       │                     ▼
               │                       │            ┌─────────────────┐
               │                       │            │  Email          │
               │                       │            │  Subscriptions  │
               │                       │            └─────────────────┘
               │                       │
               ▼                       ▼
    38 Regions + 394 Services    ┌─────────────────────────────────┐
                                  │  S3 Files:                      │
                                  │  - regions.json                 │
                                  │  - services.json                │
                                  │  - complete-data.json           │
                                  │  - cache/services-by-region.json│
                                  │  - history/*.json (30-day)      │
                                  └─────────────────────────────────┘
```

### What's New RSS Fetcher (aws-whats-new-fetcher)

```
┌─────────────────────┐
│  EventBridge        │
│  Schedule           │──Daily 3 AM UTC──┐
│  (cron)             │                  │
└─────────────────────┘                  │
                                         ▼
                              ┌─────────────────────┐
                              │  Lambda Function    │
                              │ aws-whats-new-fetcher│
                              │  (Node.js 20)       │
                              └─────────────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            │                            │                            │
            ▼                            ▼                            ▼
   ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
   │  AWS RSS Feed   │        │  S3 Source      │        │  S3 Distribution│
   │  What's New     │        │  Bucket         │        │  Bucket         │
   │  (Fetch)        │        │  (Write)        │        │  (Write)        │
   └─────────────────┘        └─────────────────┘        └─────────────────┘
            │                         │                            │
            │                         │                            ▼
            │                         │                 ┌─────────────────────┐
            │                         │                 │  CloudFront CDN     │
            │                         │                 │  5-min cache TTL    │
            │                         │                 └─────────────────────┘
            │                         │                            │
            ▼                         ▼                            ▼
   Latest 20 Announcements    aws-whats-new.json         aws-whats-new.json
   (RSS 2.0 format)           (Source Storage)           (Public URL)
```

## Features

### Core Functionality

- **38 AWS Regions Discovered**: Commercial (34) + China (2) + GovCloud (2)
- **394+ AWS Services Cataloged**: Complete service inventory
- **Service-by-Region Mapping**: 8,637 service instances across all regions
- **Availability Zone Counts**: Infrastructure planning data
- **Region Launch Dates**: Historical context and blog URLs

### Deployment Features

- **Serverless Architecture**: AWS Lambda + S3 + EventBridge + SNS
- **Automated Daily Updates**: EventBridge schedule (customizable)
- **Manual Invocation**: Trigger anytime via CLI or AWS Console
- **S3 Storage**: All data and cache files with versioning
- **SNS Notifications**: Success and error alerts via email
- **CloudWatch Monitoring**: Built-in alarms and dashboards
- **Security**: IAM least privilege, no hardcoded credentials
- **Cost-Effective**: ~$0.04/month total cost

### Performance Optimizations

- **Smart Caching**: 24-hour TTL (1m 49s → 13s execution)
- **Parallel Processing**: Batch processing with adaptive throttling
- **Automatic Retry**: Exponential backoff for rate limits
- **Historical Snapshots**: 30-day retention with S3 lifecycle
- **Tunable Performance**: Adjustable batch size and delays

## Data Output

All data is stored in S3 with the following structure:

### S3 Bucket Structure

**Source Bucket** (`aws-data-fetcher-output/aws-data/`):
```
s3://aws-data-fetcher-output/aws-data/
├── regions.json (9.4 KiB) - 38 regions with metadata
├── services.json (31.4 KiB) - 394 services with official names
├── complete-data.json (233.6 KiB) - Combined dataset (single source of truth)
├── aws-whats-new.json (49.2 KiB) - Latest 20 AWS announcements
├── cache/
│   └── services-by-region.json (197.7 KiB) - 24-hour cache
└── history/
    ├── complete-data-1760303239876.json
    ├── complete-data-1760303302796.json
    └── ... (auto-deleted after 30 days)
```

**Distribution Bucket** (`www.aws-services.synepho.com/data/`):
```
s3://www.aws-services.synepho.com/data/
├── regions.json - Public via CloudFront
├── services.json - Public via CloudFront
├── complete-data.json - Public via CloudFront
├── change-history.json - Public via CloudFront
└── aws-whats-new.json - Public via CloudFront (5-min TTL)
```

### Example Data: regions.json

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
      "code": "eu-west-3",
      "name": "Europe (Paris)",
      "availabilityZones": 3,
      "launchDate": "Wed, 12 Dec 2017 19:00:00 GMT",
      "blogUrl": "https://aws.amazon.com/blogs/aws/now-open-aws-europe-paris-region/"
    }
  ],
  "source": "ssm",
  "timestamp": "2025-10-12T22:48:10.401Z"
}
```

### Example Data: complete-data.json

The `complete-data.json` file is the **single source of truth** containing:

```json
{
  "metadata": {
    "timestamp": "2025-10-12T22:48:10.401Z",
    "tool": "nodejs-aws-fetcher",
    "version": "1.4.0"
  },
  "regions": {
    "count": 38,
    "regions": [
      /* full region objects */
    ],
    "source": "ssm",
    "timestamp": "2025-10-12T22:48:13.345Z"
  },
  "services": {
    "count": 394,
    "services": ["accessanalyzer", "account", "acm" /* ... */],
    "source": "ssm",
    "timestamp": "2025-10-12T22:48:24.178Z"
  },
  "servicesByRegion": {
    "byRegion": {
      "us-east-1": {
        "regionCode": "us-east-1",
        "serviceCount": 388,
        "services": ["accessanalyzer", "account", "acm" /* ... */],
        "lastFetched": "2025-10-12T21:08:08.493Z"
      },
      "eu-west-3": {
        "regionCode": "eu-west-3",
        "serviceCount": 248,
        "services": ["accessanalyzer", "account", "acm" /* ... */],
        "lastFetched": "2025-10-12T21:08:15.234Z"
      }
      /* ... all 38 regions ... */
    },
    "summary": {
      "totalRegions": 38,
      "totalServices": 394,
      "averageServicesPerRegion": 227,
      "cachedRegions": 38,
      "fetchedRegions": 0,
      "timestamp": "2025-10-12T22:48:29.943Z"
    }
  }
}
```

### Data Contract Specification

For applications consuming this data (dashboards, reporters, analysis tools), see **[DATA_CONTRACT.md](./docs/DATA_CONTRACT.md)** for the formal JSON schema specification including:

- Complete field definitions with types and constraints
- Validation rules and examples
- Version compatibility guidelines
- Breaking change policies
- TypeScript type definitions

This contract guarantees backward compatibility and provides validation patterns for downstream consumers.

## Data Distribution

Generated data files are automatically distributed to two locations for different use cases:

### 1. Source Bucket (Primary Storage)

**Location**: `s3://aws-data-fetcher-output/aws-data/`

- Primary storage and backup
- Historical snapshots (30-day retention)
- Direct S3 access (for AWS-internal use)
- Complete audit trail

### 2. Distribution Bucket (Public Access)

**Location**: `s3://www.aws-services.synepho.com/data/`
**Public URL**: `https://aws-services.synepho.com/data/`

- CloudFront-backed CDN distribution
- Edge caching for global performance
- **Recommended** for all public consumption
- Cache-Control: `public, max-age=300` (5 minutes)
- Automatic cache invalidation after updates

### Public Data Access

Applications should fetch data from the CloudFront distribution for optimal performance:

**Recommended (CloudFront-backed, globally cached)**:

```javascript
const completeDataUrl =
  "https://aws-services.synepho.com/data/complete-data.json";
const regionsUrl = "https://aws-services.synepho.com/data/regions.json";
const servicesUrl = "https://aws-services.synepho.com/data/services.json";

// Fetch with standard HTTP client
const response = await fetch(completeDataUrl);
const data = await response.json();
```

**Not Recommended (Direct S3, higher costs)**:

```javascript
// Avoid this - higher costs, no edge caching
const directS3Url =
  "https://aws-data-fetcher-output.s3.amazonaws.com/aws-data/complete-data.json";
```

### Distribution Process

The Lambda function automatically:

1. Fetches AWS infrastructure data from SSM Parameter Store
2. Saves to source bucket (`aws-data-fetcher-output`)
3. **Copies to distribution bucket** (`www.aws-services.synepho.com/data/`)
4. Sends SNS notification with distribution status

### Cache Behavior

- **Edge Cache TTL**: 5 minutes (respects `Cache-Control: max-age=300` header)
- **Natural Cache Expiration**: CloudFront automatically refreshes after 5 minutes
- **First Request**: May show `X-Cache: Miss from cloudfront`
- **Subsequent Requests**: Show `X-Cache: Hit from cloudfront`
- **After Update**: Cache refreshes automatically within 0-5 minutes (no manual invalidation needed)

### Disabling Distribution

To disable CloudFront distribution (Lambda will only save to source bucket):

```bash
sam deploy --parameter-overrides DistributionBucketName=""
```

Or update `samconfig.toml`:

```toml
parameter_overrides = "... DistributionBucketName=\"\" ..."
```

## Usage

### Lambda Invocation (Recommended)

```bash
# Standard fetch (complete with service mapping)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# Regions only (faster)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"regionsOnly":true}' \
  response.json

# Services only
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"servicesOnly":true}' \
  response.json

# Force cache refresh (async - returns immediately, runs in background)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --invocation-type Event \
  --payload '{"forceRefresh":true}' \
  response.json

# Monitor execution in CloudWatch logs
aws logs tail /aws/lambda/aws-data-fetcher --follow

# View response
cat response.json | jq .
```

### Local CLI Usage (Development/Testing)

```bash
# Install dependencies (if not already done)
npm install

# Fetch all data (regions + services)
npm start

# Fetch only regions
npm run regions

# Fetch only services
npm run services

# Complete fetch with service-by-region mapping
npm run complete

# Force fresh fetch (bypass cache)
npm run complete:fresh

# Clear cache
npm run cache:clear

# View output files
cat output/complete-data.json | jq
```

## SNS Notifications

### Setup Email Notifications

```bash
# Subscribe your email address
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:YOUR_ACCOUNT:aws-data-fetcher-notifications \
  --protocol email \
  --notification-endpoint your.email@example.com

# Check your email and confirm the subscription!
```

### What You'll Receive

**✅ Success Notifications** (after every run):

- Regions and services discovered
- Execution duration
- S3 file paths
- Cache hit statistics

**❌ Error Notifications** (on failures):

- Error message and type
- Stack trace
- Direct CloudWatch Logs link

**⚠️ CloudWatch Alarms**:

- Lambda execution errors
- Duration exceeding 2 minutes

For detailed notification setup, see [docs/NOTIFICATIONS_SETUP.md](./docs/NOTIFICATIONS_SETUP.md)

## Monitoring & Logs

### CloudWatch Logs

```bash
# Follow logs in real-time
sam logs --name DataFetcherFunction --stack-name sam-aws-services-fetch --tail

# View recent logs
aws logs tail /aws/lambda/aws-data-fetcher --since 5m

# Search for errors
sam logs --name DataFetcherFunction --filter 'ERROR'
```

### CloudWatch Alarms

Two alarms are automatically configured:

1. **Error Alarm** (`aws-data-fetcher-errors`)

   - Triggers on any Lambda error
   - Sends SNS notification

2. **Duration Alarm** (`aws-data-fetcher-duration`)
   - Triggers if execution exceeds 2 minutes
   - Sends SNS notification

### S3 Console

View your data files: [S3 Console URL is in CloudFormation outputs]

```bash
# Get S3 console URL from deployment
aws cloudformation describe-stacks \
  --stack-name sam-aws-services-fetch \
  --query 'Stacks[0].Outputs[?OutputKey==`S3DataUrl`].OutputValue' \
  --output text
```

## Configuration

### Performance Tuning

Edit the SAM parameters in `template.yaml` or via deployment:

| Parameter            | Default             | Description                | Impact                                                                 |
| -------------------- | ------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `BatchSize`          | 10                  | Parallel region batch size | 10=conservative (1m 49s), 12=balanced (1m 30s), 15=aggressive (1m 15s) |
| `PaginationDelay`    | 40ms                | Delay between SSM requests | Lower=faster but higher throttle risk                                  |
| `ScheduleExpression` | `cron(0 2 * * ? *)` | EventBridge cron schedule  | Adjust timing as needed                                                |

### Redeploy with New Settings

```bash
# Update template.yaml, then:
sam build && sam deploy
```

### Manual Performance Tuning

For balanced performance (30% faster):

```yaml
Parameters:
  BatchSize: 12 # Change from 10
  PaginationDelay: 35 # Change from 40
```

## Troubleshooting

### Deployment Issues

**Problem**: S3 bucket name already exists
**Solution**: Choose a globally unique bucket name

**Problem**: IAM permission errors
**Solution**: Ensure your AWS user has CloudFormation, Lambda, S3, and IAM permissions

### Lambda Execution Issues

**Problem**: Lambda timeout (180s)
**Solution**: Cache should prevent this. If persistent, increase timeout in `template.yaml`

**Problem**: ThrottlingException from SSM
**Solution**: Reduce `BatchSize` or increase `PaginationDelay`

### SNS Notifications Not Received

**Problem**: Not receiving emails
**Solution**:

1. Check spam folder
2. Verify subscription status (must be "Confirmed")
3. Re-subscribe if confirmation link expired

### CLI Read Timeout on Force Refresh

**Problem**: `Read timeout on endpoint URL` when using `forceRefresh: true`
**Solution**: Force refresh takes ~1m 46s which exceeds AWS CLI default timeout (60s)

```bash
# Option 1: Use async invocation (recommended)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --invocation-type Event \
  --payload '{"forceRefresh":true}' \
  response.json

# Option 2: Increase CLI timeout
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout 180 \
  --payload '{"forceRefresh":true}' \
  response.json
```

**Note**: Lambda completes successfully even if CLI times out. Check CloudWatch logs to verify completion.

For more troubleshooting, see [docs/DEPLOYMENT_QUICKSTART.md](./docs/DEPLOYMENT_QUICKSTART.md)

## Cost Breakdown

Monthly operational costs (based on daily execution):

| Service    | Usage                      | Cost               |
| ---------- | -------------------------- | ------------------ |
| Lambda     | ~30 invocations @ 15s each | ~$0.02             |
| S3         | Storage + requests         | ~$0.01             |
| CloudWatch | Logs retention (7 days)    | ~$0.01             |
| SNS        | Email notifications        | FREE (first 1,000) |
| **Total**  |                            | **~$0.04/month**   |

## Documentation

- **[Deployment Quick Start](./docs/DEPLOYMENT_QUICKSTART.md)** - Step-by-step deployment guide
- **[SNS Notifications Setup](./docs/NOTIFICATIONS_SETUP.md)** - Configure email alerts
- **[Lambda Deployment Guide](./docs/LAMBDA_DEPLOYMENT_GUIDE.md)** - Comprehensive Lambda guide
- **[Optimization Results](./docs/OPTIMIZATION_RESULTS.md)** - Performance benchmarks
- **[Changelog](./docs/CHANGELOG.md)** - Version history and changes

## Project Structure

```
nodejs-aws-fetcher/
├── src/                       # All source code
│   ├── cli.js                 # CLI entry point (Commander.js)
│   ├── core/                  # Core business logic
│   │   ├── aws-data-fetcher.js  # Main fetcher class
│   │   └── config.js          # Configuration settings
│   ├── lambda/                # Lambda deployment
│   │   └── handler.js         # Lambda entry point
│   └── storage/               # Storage abstraction layer
│       ├── storage-interface.js  # Storage abstraction
│       ├── local-storage.js   # Local filesystem storage
│       ├── s3-storage.js      # S3 storage implementation
│       └── storage-factory.js # Storage factory
├── scripts/                   # Operational scripts
│   └── setup.sh              # Setup script with verification
├── tests/                     # Test directory structure
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   └── fixtures/              # Test fixtures
├── docs/                      # Documentation
│   ├── DEPLOYMENT_QUICKSTART.md
│   ├── NOTIFICATIONS_SETUP.md
│   ├── LAMBDA_DEPLOYMENT_GUIDE.md
│   ├── OPTIMIZATION_RESULTS.md
│   └── archived/              # Archived documentation
├── output/                    # Local development output (gitignored)
│   ├── regions.json
│   ├── services.json
│   └── complete-data.json
├── template.yaml              # SAM/CloudFormation template
├── package.json               # Dependencies and scripts
└── .aws-sam/                  # SAM build artifacts (gitignored)
```

## Technical Details

### Data Source

All data is fetched from **AWS SSM Parameter Store** public parameters:

- **Regions**: `/aws/service/global-infrastructure/regions/*`
- **Services**: `/aws/service/global-infrastructure/services/*`
- **Service Availability**: `/aws/service/global-infrastructure/regions/{region}/services/*`

### Storage Architecture

**Storage Abstraction Layer** allows switching between local and S3 storage:

- **Local Storage**: Development and CLI usage
- **S3 Storage**: Lambda production environment

**Cache Strategy**: 24-hour TTL per region with validation:

- First run: Fetches all data (~1m 49s)
- Cached run: Loads from S3 (~13s, 8x faster)
- Stale regions: Automatically refreshed after 24 hours

### Security

- **No hardcoded credentials**: Uses IAM roles
- **Least privilege IAM**: Only required SSM read and S3 access
- **S3 encryption**: Default encryption at rest
- **VPC optional**: Can deploy in VPC if needed
- **CloudWatch auditing**: All executions logged

## Version History

See [CHANGELOG.md](./docs/CHANGELOG.md) for detailed version history.

**Current Version**: 1.5.1 (Node.js 20.x Runtime)

**Key Milestones**:

- **v1.0.0**: Initial CLI tool for region discovery
- **v1.1.0**: Added service-by-region mapping
- **v1.2.0**: Parallel processing and caching (4-5x speedup)
- **v1.3.0**: Region launch dates and availability zones
- **v1.4.0**: Dynamic service name fetching from SSM
- **v1.5.0**: Lambda deployment with S3 storage and SNS notifications
- **v1.5.1**: Node.js 20.x runtime upgrade (LTS until April 2026)

## Use Cases

This Lambda function is ideal for:

1. **Infrastructure Discovery**: Automated AWS region/service catalog
2. **Multi-Region Planning**: Determine service availability before deployment
3. **Compliance Auditing**: Complete AWS infrastructure inventory
4. **Documentation Generation**: Up-to-date reference data for docs
5. **Application Configuration**: Feed region/service data to applications
6. **Monitoring Changes**: Track when AWS adds new regions or services
7. **Cost Optimization**: Identify regions with specific service availability

## Contributing

Contributions are welcome! When contributing:

- Maintain serverless architecture
- Preserve storage abstraction layer
- Keep caching logic intact
- Update documentation
- Add tests for new features
- Follow existing code patterns

## License

MIT License - See [LICENSE](./LICENSE) file for details

## Support

For issues or questions:

1. Check [docs/DEPLOYMENT_QUICKSTART.md](./docs/DEPLOYMENT_QUICKSTART.md) for deployment help
2. Review [docs/NOTIFICATIONS_SETUP.md](./docs/NOTIFICATIONS_SETUP.md) for SNS setup
3. Check CloudWatch Logs for execution details
4. Verify IAM permissions and AWS credentials
5. Open an issue with detailed error messages and logs

---

**Last Updated**: October 2025
**Version**: 1.5.1
**Node.js**: >= 20.0.0
**AWS SDK**: v3.645.0
**Deployment**: AWS Lambda + SAM

**Built with**: Node.js, AWS Lambda, S3, SNS, EventBridge, CloudFormation, SAM
