# AWS Lambda Deployment Guide

**Date**: October 12, 2025
**Version**: 1.4.0
**Purpose**: Deploy AWS SSM Data Fetcher as a Lambda function with S3 storage

---

## Executive Summary

**Architecture**: Single Lambda function with EventBridge scheduler and S3 storage

**Performance**:

- Regions + Services only: ~33 seconds
- Complete with service mapping: **~77 seconds** (optimized)
- With aggressive settings: ~60 seconds ⚡ (Excellent rating)

**Lambda Suitability**: ✅ **Excellent fit** with minimal modifications

**Key Features**:

- ✅ Centralized configuration system (`config.js`)
- ✅ Performance optimized (25% faster, 103s → 77s)
- ✅ S3 storage for both data and cache
- ✅ Daily automated updates via EventBridge
- ✅ Manual trigger support for on-demand updates
- ✅ Sub-60-second performance achievable with tuning

**Monthly Cost**: ~$0.15-0.22 (daily execution)

---

## Architecture

### Single Lambda Function with EventBridge (RECOMMENDED)

This is the recommended architecture for most use cases - simple, cost-effective, and handles complete data fetch efficiently.

```text
┌─────────────────────────────────────────────────────────────┐
│                  EventBridge Scheduler                       │
│                    (Daily at 2 AM UTC)                       │
└────────────────────────────┬────────────────────────────────┘
                             │ trigger (daily)
                             ▼
                ┌─────────────────────────┐
                │   Lambda Function       │
                │ (512MB, 3min timeout)   │
                │                         │
                │  - Fetch regions        │
                │  - Fetch services       │
                │  - Service mapping      │
                │  - Check cache (S3)     │
                │  - Update data (S3)     │
                └─────────────┬───────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │   S3 Bucket     │
                     │                 │
                     │  📁 Data files  │
                     │  - regions.json │
                     │  - services.json│
                     │  - complete.json│
                     │                 │
                     │  💾 Cache files │
                     │  - .cache-*.json│
                     └─────────────────┘
```

**Manual Trigger**: Invoke Lambda directly via AWS Console, CLI, or SDK

**Performance**:

- Runtime: ~77 seconds (with BATCH_SIZE=10, PAGINATION_DELAY=40)
- Fits comfortably within 3-minute Lambda timeout
- Cold start overhead: ~1-2 seconds

**Pros**:

- ✅ Simple architecture - easy to understand and maintain
- ✅ Low cost (~$0.22/month for daily runs)
- ✅ No database needed - S3 handles everything
- ✅ Complete data fetch with service mapping
- ✅ Manual trigger support for on-demand updates
- ✅ Automatic cache management via S3

**Use Cases**:

- Daily automated updates of AWS infrastructure data
- On-demand data refresh when needed
- Development and testing environments
- Production systems with daily update requirements

---

## Implementation

### 1. S3 Storage Implementation

The Lambda function uses S3 for both output data and cache storage.

#### S3 Bucket Structure

```text
s3://your-bucket-name/
├── aws-data/
│   ├── regions.json            # Current regions data
│   ├── services.json           # Current services data
│   ├── complete-data.json      # Complete dataset
│   ├── cache/
│   │   └── services-by-region.json  # 24-hour cache
│   └── history/
│       ├── complete-data-<timestamp>.json  # Historical snapshots
│       └── ...
```

#### S3Storage Class

```javascript
// storage/s3-storage.js
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

class S3Storage {
  constructor(bucketName, prefix = 'aws-data') {
    this.s3Client = new S3Client({});
    this.bucketName = bucketName;
    this.prefix = prefix;
  }

  async saveRegions(data) {
    const key = `${this.prefix}/regions.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'generated-at': new Date().toISOString(),
        'version': '1.4.0'
      }
    }));

    return `s3://${this.bucketName}/${key}`;
  }

  async saveServices(data) {
    const key = `${this.prefix}/services.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'generated-at': new Date().toISOString()
      }
    }));

    return `s3://${this.bucketName}/${key}`;
  }

  async saveComplete(data) {
    const key = `${this.prefix}/complete-data.json`;

    // Save current version
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'generated-at': new Date().toISOString()
      }
    }));

    // Save historical snapshot
    const timestamp = Date.now();
    const historyKey = `${this.prefix}/history/complete-data-${timestamp}.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: historyKey,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    }));

    return `s3://${this.bucketName}/${key}`;
  }

  async loadCache() {
    try {
      const key = `${this.prefix}/cache/services-by-region.json`;

      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));

      const body = await response.Body.transformToString();
      const cacheData = JSON.parse(body);

      // Check if cache is still valid (24 hours)
      if (cacheData.timestamp) {
        const cacheAge = Date.now() - new Date(cacheData.timestamp).getTime();
        const cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

        if (cacheAge > cacheTTL) {
          console.log('Cache expired, will refresh');
          return null;
        }
      }

      return cacheData;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.log('No cache found in S3');
        return null;
      }
      throw error;
    }
  }

  async saveCache(data) {
    const key = `${this.prefix}/cache/services-by-region.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'cached-at': new Date().toISOString(),
        'ttl-hours': '24'
      }
    }));

    console.log(`Cache saved to S3: ${key}`);
  }
}

module.exports = S3Storage;
```

---

### 2. Lambda Handler

The Lambda handler integrates with the existing `AWSDataFetcher` class and uses S3 storage.

```javascript
// lambda/handler.js
const AWSDataFetcher = require('../fetch-aws-data');

exports.handler = async (event, context) => {
  const startTime = Date.now();

  console.log('Lambda invoked', {
    event,
    requestId: context.requestId,
    batchSize: process.env.BATCH_SIZE,
    paginationDelay: process.env.PAGINATION_DELAY,
    s3Bucket: process.env.S3_BUCKET_NAME
  });

  try {
    // Parse options from event
    const options = {
      regionsOnly: event.regionsOnly || false,
      servicesOnly: event.servicesOnly || false,
      includeServiceMapping: event.includeServiceMapping !== false, // Default to true
      forceRefresh: event.forceRefresh || false,
      region: event.region || process.env.AWS_REGION || 'us-east-1'
    };

    console.log('Fetch options:', options);

    // Create fetcher with S3 storage
    // Configuration is pulled from environment variables
    const fetcher = new AWSDataFetcher(options.region);

    console.log('Starting fetch with config:', {
      batchSize: fetcher.batchSize,
      paginationDelay: fetcher.paginationDelay,
      cacheTTL: fetcher.cacheTTL,
      storageType: 's3'
    });

    // Run the fetch
    const result = await fetcher.run(options);

    const duration = Date.now() - startTime;

    console.log('Fetch completed successfully', {
      regions: result.regions?.count,
      services: result.services?.count,
      duration: `${Math.round(duration / 1000)}s`
    });

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Data fetch completed successfully',
        result: {
          metadata: result.metadata,
          regions: result.regions ? result.regions.count : undefined,
          services: result.services ? result.services.count : undefined,
          duration: `${Math.round(duration / 1000)}s`,
          s3Paths: {
            regions: result.regionPath,
            services: result.servicePath,
            complete: result.completePath
          }
        },
        requestId: context.requestId
      })
    };

  } catch (error) {
    console.error('Lambda execution failed', {
      error: error.message,
      stack: error.stack,
      requestId: context.requestId
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        requestId: context.requestId
      })
    };
  }
};
```

---

### 3. SAM Template (Recommended)

AWS SAM (Serverless Application Model) provides the easiest way to deploy Lambda functions.

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: AWS SSM Data Fetcher - Lambda Deployment

Parameters:
  S3BucketName:
    Type: String
    Description: S3 bucket for storing output data and cache
    Default: aws-data-fetcher-output

  ScheduleExpression:
    Type: String
    Description: Schedule for automatic updates (EventBridge cron/rate expression)
    Default: cron(0 2 * * ? *)  # Daily at 2 AM UTC

  BatchSize:
    Type: Number
    Description: Parallel region processing batch size (10=conservative, 12=balanced, 15=aggressive)
    Default: 10
    MinValue: 5
    MaxValue: 20

  PaginationDelay:
    Type: Number
    Description: Delay between SSM pagination requests in milliseconds
    Default: 40
    MinValue: 20
    MaxValue: 100

Resources:
  # S3 Bucket for outputs and cache
  OutputBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref S3BucketName
      VersioningConfiguration:
        Status: Enabled
      LifecycleConfiguration:
        Rules:
          # Delete old historical snapshots after 30 days
          - Id: DeleteOldHistoryFiles
            Prefix: aws-data/history/
            Status: Enabled
            ExpirationInDays: 30
          # Keep current data and cache indefinitely
          - Id: KeepCurrentData
            Prefix: aws-data/
            Status: Enabled
            NoncurrentVersionExpirationInDays: 7
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      Tags:
        - Key: Project
          Value: aws-data-fetcher
        - Key: ManagedBy
          Value: SAM

  # Lambda Function
  DataFetcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: aws-data-fetcher
      CodeUri: ./
      Handler: lambda/handler.handler
      Runtime: nodejs20.x
      Description: Fetches AWS infrastructure data from SSM (complete with service mapping)
      Timeout: 180  # 3 minutes (77s runtime + buffer)
      MemorySize: 512
      Environment:
        Variables:
          # Storage configuration
          STORAGE_TYPE: s3
          S3_BUCKET_NAME: !Ref OutputBucket
          S3_PREFIX: aws-data

          # Performance tuning (from config.js)
          BATCH_SIZE: !Ref BatchSize
          PAGINATION_DELAY: !Ref PaginationDelay
          CACHE_TTL: 86400000  # 24 hours in milliseconds

          # Logging
          LOG_LEVEL: info
          NODE_ENV: production
      Policies:
        # SSM read-only access
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - ssm:GetParameter
                - ssm:GetParameters
                - ssm:GetParametersByPath
              Resource:
                - !Sub 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/aws/service/global-infrastructure/*'
        # S3 access for data and cache
        - S3CrudPolicy:
            BucketName: !Ref OutputBucket
      Events:
        # Daily EventBridge schedule
        DailySchedule:
          Type: Schedule
          Properties:
            Schedule: !Ref ScheduleExpression
            Description: Daily AWS data fetch
            Enabled: true
            Input: |
              {
                "includeServiceMapping": true,
                "forceRefresh": false
              }
      Tags:
        Project: aws-data-fetcher
        ManagedBy: SAM

  # CloudWatch Log Group (explicit creation for retention control)
  FunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub '/aws/lambda/${DataFetcherFunction}'
      RetentionInDays: 7

  # CloudWatch Alarm - Error detection
  ErrorAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: aws-data-fetcher-errors
      AlarmDescription: Alert when Lambda function encounters errors
      MetricName: Errors
      Namespace: AWS/Lambda
      Statistic: Sum
      Period: 300
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: FunctionName
          Value: !Ref DataFetcherFunction
      TreatMissingData: notBreaching

  # CloudWatch Alarm - Duration monitoring
  DurationAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: aws-data-fetcher-duration
      AlarmDescription: Alert when Lambda execution exceeds expected duration
      MetricName: Duration
      Namespace: AWS/Lambda
      Statistic: Average
      Period: 300
      EvaluationPeriods: 1
      Threshold: 120000  # 120 seconds (2 minutes)
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: FunctionName
          Value: !Ref DataFetcherFunction
      TreatMissingData: notBreaching

Outputs:
  OutputBucketName:
    Description: S3 bucket for output data and cache
    Value: !Ref OutputBucket
    Export:
      Name: !Sub '${AWS::StackName}-OutputBucket'

  LambdaFunctionArn:
    Description: Lambda function ARN
    Value: !GetAtt DataFetcherFunction.Arn
    Export:
      Name: !Sub '${AWS::StackName}-FunctionArn'

  LambdaFunctionName:
    Description: Lambda function name (for manual invocation)
    Value: !Ref DataFetcherFunction

  ScheduleExpression:
    Description: EventBridge schedule expression
    Value: !Ref ScheduleExpression

  S3DataUrl:
    Description: S3 console URL for data files
    Value: !Sub 'https://s3.console.aws.amazon.com/s3/buckets/${OutputBucket}?prefix=aws-data/'
```

---

## Deployment Process

### Prerequisites

1. **Install AWS SAM CLI**:

   ```bash
   # macOS (Homebrew)
   brew install aws-sam-cli

   # Verify installation
   sam --version
   ```

2. **Configure AWS Credentials**:

   ```bash
   aws configure
   # Enter AWS Access Key ID, Secret Access Key, and Region
   ```

3. **Prepare Project**:

   ```bash
   # Ensure all dependencies are installed
   npm install

   # Test locally first
   npm run complete
   ```

### Deployment Steps

#### First-Time Deployment (Guided)

```bash
# 1. Build the Lambda package
sam build

# 2. Deploy with guided prompts
sam deploy --guided

# Follow the prompts:
# - Stack Name: aws-data-fetcher
# - AWS Region: us-east-1 (or your preferred region)
# - Parameter S3BucketName: choose a unique bucket name
# - Parameter ScheduleExpression: cron(0 2 * * ? *)
# - Parameter BatchSize: 10
# - Parameter PaginationDelay: 40
# - Confirm changes before deploy: Y
# - Allow SAM CLI IAM role creation: Y
# - Save arguments to configuration file: Y

# The deployment will create:
# - S3 bucket for data/cache
# - Lambda function
# - EventBridge schedule
# - CloudWatch alarms
# - IAM roles and policies
```

#### Subsequent Deployments

```bash
# Build and deploy with saved configuration
sam build && sam deploy
```

---

## Manual Execution

### Using AWS Console

1. Navigate to **AWS Lambda** console
2. Select the `aws-data-fetcher` function
3. Click **Test** tab
4. Create/select a test event:

   ```json
   {
     "includeServiceMapping": true,
     "forceRefresh": false
   }
   ```

5. Click **Test** to execute
6. View execution results in the console

### Using AWS CLI

```bash
# Simple invocation (uses default settings)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --output json \
  response.json

# View the response
cat response.json

# With custom options
aws lambda invoke \
  --function-name aws-data-fetcher \
  --payload '{"includeServiceMapping":true,"forceRefresh":true}' \
  --output json \
  response.json

# Regions only (faster)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --payload '{"regionsOnly":true}' \
  response.json

# Services only (faster)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --payload '{"servicesOnly":true}' \
  response.json
```

### Using Python (boto3)

```python
import boto3
import json

lambda_client = boto3.client('lambda', region_name='us-east-1')

# Invoke Lambda function
response = lambda_client.invoke(
    FunctionName='aws-data-fetcher',
    InvocationType='RequestResponse',  # Synchronous
    Payload=json.dumps({
        'includeServiceMapping': True,
        'forceRefresh': False
    })
)

# Parse response
result = json.loads(response['Payload'].read())
print(json.dumps(result, indent=2))
```

### Using Node.js (AWS SDK v3)

```javascript
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({ region: 'us-east-1' });

async function invokeFetcher() {
  const command = new InvokeCommand({
    FunctionName: 'aws-data-fetcher',
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({
      includeServiceMapping: true,
      forceRefresh: false
    })
  });

  const response = await lambda.send(command);
  const result = JSON.parse(Buffer.from(response.Payload).toString());

  console.log(JSON.stringify(result, null, 2));
}

invokeFetcher().catch(console.error);
```

---

## Configuration & Tuning

### Environment Variables

Configuration is managed through Lambda environment variables (set in SAM template):

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_TYPE` | `s3` | Storage backend (always `s3` for Lambda) |
| `S3_BUCKET_NAME` | - | S3 bucket name (set by SAM) |
| `S3_PREFIX` | `aws-data` | S3 key prefix for all files |
| `BATCH_SIZE` | `10` | Parallel region processing (primary tuning parameter) |
| `PAGINATION_DELAY` | `40` | Delay between SSM requests in milliseconds |
| `CACHE_TTL` | `86400000` | Cache TTL in milliseconds (24 hours) |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `NODE_ENV` | `production` | Environment mode |

### Performance Tuning

Different AWS accounts have different rate limit tolerances. Adjust these parameters based on your account:

**Conservative** (default, safe for all accounts):

```yaml
BatchSize: 10
PaginationDelay: 40
# Expected: ~77 seconds
```

**Balanced** (faster, low risk):

```yaml
BatchSize: 12
PaginationDelay: 35
# Expected: ~65-70 seconds
```

**Aggressive** (fastest, medium risk):

```yaml
BatchSize: 15
PaginationDelay: 30
# Expected: ~55-60 seconds
# ⚠️ May encounter throttling in some accounts
```

### Tuning Process

1. **Start with conservative settings** (BatchSize=10, PaginationDelay=40)
2. **Deploy and monitor** first execution via CloudWatch logs
3. **Check for throttling errors**:

   ```bash
   # View recent logs
   sam logs --name DataFetcherFunction --tail

   # Search for throttling
   sam logs --name DataFetcherFunction | grep -i throttling
   ```

4. **If no errors, increase performance**:
   - Increment BatchSize by 2 (10 → 12 → 14)
   - Decrease PaginationDelay by 5-10ms
   - Redeploy and test

5. **If throttling occurs**:
   - Decrease BatchSize by 2-3
   - Increase PaginationDelay by 10-20ms
   - Redeploy and test

6. **Update SAM template** with optimal values:

   ```bash
   # Update template.yaml with new defaults
   vim template.yaml

   # Redeploy
   sam build && sam deploy
   ```

---

## Monitoring & Operations

### CloudWatch Logs

```bash
# View recent logs
sam logs --name DataFetcherFunction --tail

# View logs from specific time
sam logs --name DataFetcherFunction --start-time '2025-10-12T10:00:00'

# Filter logs
sam logs --name DataFetcherFunction --filter 'ERROR'
sam logs --name DataFetcherFunction --filter 'ThrottlingException'

# Export logs
aws logs get-log-events \
  --log-group-name /aws/lambda/aws-data-fetcher \
  --log-stream-name 'latest-stream-name' \
  --output json > logs.json
```

### CloudWatch Metrics

```bash
# Get Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=aws-data-fetcher \
  --start-time 2025-10-12T00:00:00Z \
  --end-time 2025-10-12T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum

# Get error count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=aws-data-fetcher \
  --start-time 2025-10-12T00:00:00Z \
  --end-time 2025-10-12T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

### S3 Data Access

```bash
# List data files
aws s3 ls s3://your-bucket-name/aws-data/

# Download data files
aws s3 cp s3://your-bucket-name/aws-data/complete-data.json ./

# Check cache file
aws s3 cp s3://your-bucket-name/aws-data/cache/services-by-region.json ./

# View historical snapshots
aws s3 ls s3://your-bucket-name/aws-data/history/

# Download specific historical snapshot
aws s3 cp s3://your-bucket-name/aws-data/history/complete-data-1697123456789.json ./
```

### EventBridge Schedule Management

```bash
# List all rules
aws events list-rules --name-prefix aws-data-fetcher

# Describe schedule
aws events describe-rule --name aws-data-fetcher-DailySchedule-XXXXX

# Disable schedule (pause automated runs)
aws events disable-rule --name aws-data-fetcher-DailySchedule-XXXXX

# Enable schedule (resume automated runs)
aws events enable-rule --name aws-data-fetcher-DailySchedule-XXXXX

# Update schedule expression
aws events put-rule \
  --name aws-data-fetcher-DailySchedule-XXXXX \
  --schedule-expression "cron(0 3 * * ? *)"  # Change to 3 AM
```

---

## Cost Analysis

### Monthly Cost Breakdown

**Assumptions**:

- 1 execution/day (complete fetch with service mapping)
- **77 seconds runtime** (with BATCH_SIZE=10, PAGINATION_DELAY=40)
- 512MB memory

**Lambda**:

```text
Requests: 30/month × $0.20/million = $0.000006
Compute: 30 × 77s × (512/1024)GB × $0.0000166667/GB-second = $0.019
Total Lambda: ~$0.019/month
```

**S3**:

```text
Storage: 20MB × $0.023/GB = $0.00046
PUT requests: 35/month × $0.005/1000 = $0.000175
  (regions.json, services.json, complete.json, cache, history snapshot)
GET requests: 30/month × $0.0004/1000 = $0.000012 (cache reads)
Total S3: ~$0.0006/month
```

**CloudWatch Logs**:

```text
Ingestion: 10MB/month × $0.50/GB = $0.005
Storage: 10MB × $0.03/GB = $0.0003
Total CloudWatch: ~$0.005/month
```

**EventBridge**:

```text
Invocations: 30/month (free tier covers this)
Total EventBridge: $0
```

**Total Monthly Cost**: **~$0.025/month** ($0.30/year)

### Cost with Aggressive Settings

With BatchSize=15, PaginationDelay=30 (55s runtime):

```text
Lambda Compute: 30 × 55s × 0.5GB × $0.0000166667 = $0.014
Total: ~$0.020/month ($0.24/year)
```

### Cost Savings Compared to EC2

**EC2 t3.micro** (24/7 operation):

```text
Instance: $0.0104/hour × 730 hours/month = $7.59
EBS: $0.10/GB × 8GB = $0.80
Total: ~$8.39/month

Lambda Savings: $8.39 - $0.025 = $8.36/month (99.7% cost reduction)
```

---

## Troubleshooting

### Common Issues

#### 1. ThrottlingException Errors

**Symptom**: Logs show `ThrottlingException` or `Rate exceeded`

**Solution**:

```yaml
# Reduce batch size and increase delay
BatchSize: 8
PaginationDelay: 50
```

#### 2. Lambda Timeout

**Symptom**: Function execution exceeds 180 seconds

**Solution**:

```yaml
# Option 1: Increase timeout (if needed)
Timeout: 240  # 4 minutes

# Option 2: Reduce scope (fetch only changed data)
```

**Check if cache is working**:

```bash
# Check cache file exists
aws s3 ls s3://your-bucket/aws-data/cache/

# If cache doesn't exist, first run will be slower
```

#### 3. S3 Access Denied

**Symptom**: `AccessDenied` errors when reading/writing S3

**Solution**:

```bash
# Verify Lambda has S3 permissions
aws iam get-role-policy \
  --role-name aws-data-fetcher-DataFetcherFunctionRole-XXXXX \
  --policy-name DataFetcherFunctionRolePolicy

# Check bucket permissions
aws s3api get-bucket-policy --bucket your-bucket-name
```

#### 4. Cold Start Performance

**Symptom**: First execution much slower than subsequent ones

**Explanation**: Normal behavior - Lambda cold starts add ~1-2 seconds

**Solution (optional)**:

```yaml
# Enable Provisioned Concurrency (adds cost)
ProvisionedConcurrencyConfig:
  ProvisionedConcurrentExecutions: 1
# Cost: +$10-15/month
```

---

## Security Best Practices

### 1. IAM Least Privilege

The SAM template automatically creates an IAM role with minimal permissions:

```yaml
Policies:
  # SSM read-only (specific path)
  - Effect: Allow
    Action:
      - ssm:GetParameter
      - ssm:GetParameters
      - ssm:GetParametersByPath
    Resource:
      - 'arn:aws:ssm:*:*:parameter/aws/service/global-infrastructure/*'

  # S3 access (specific bucket)
  - S3CrudPolicy:
      BucketName: !Ref OutputBucket
```

### 2. S3 Bucket Security

```yaml
# Block all public access
PublicAccessBlockConfiguration:
  BlockPublicAcls: true
  BlockPublicPolicy: true
  IgnorePublicAcls: true
  RestrictPublicBuckets: true

# Enable versioning
VersioningConfiguration:
  Status: Enabled

# Lifecycle rules for history cleanup
LifecycleConfiguration:
  Rules:
    - ExpirationInDays: 30
```

### 3. Encryption

```yaml
# Add S3 encryption (optional)
BucketEncryption:
  ServerSideEncryptionConfiguration:
    - ServerSideEncryptionByDefault:
        SSEAlgorithm: AES256

# Or use KMS
BucketEncryption:
  ServerSideEncryptionConfiguration:
    - ServerSideEncryptionByDefault:
        SSEAlgorithm: aws:kms
        KMSMasterKeyID: !Ref KMSKey
```

### 4. CloudWatch Logs Encryption

```yaml
FunctionLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    KmsKeyId: !GetAtt LogsKMSKey.Arn
```

---

## Cleanup / Teardown

### Delete Entire Stack

```bash
# Delete CloudFormation stack (removes all resources)
sam delete

# Confirm deletion
# ⚠️ This will delete:
# - Lambda function
# - EventBridge schedule
# - CloudWatch alarms
# - IAM roles
# - BUT NOT S3 bucket (retained for safety)
```

### Manual S3 Bucket Deletion

```bash
# Empty bucket first
aws s3 rm s3://your-bucket-name/ --recursive

# Delete bucket
aws s3 rb s3://your-bucket-name
```

### Disable Without Deleting

```bash
# Just disable the EventBridge schedule
aws events disable-rule --name aws-data-fetcher-DailySchedule-XXXXX

# Lambda function remains but won't auto-execute
# Can still trigger manually
```

---

## Advanced Topics

### Multi-Region Deployment

Deploy the same function to multiple AWS regions:

```bash
# Deploy to us-east-1
sam build && sam deploy --region us-east-1 --stack-name aws-data-fetcher-us-east-1

# Deploy to eu-west-1
sam build && sam deploy --region eu-west-1 --stack-name aws-data-fetcher-eu-west-1

# Each region has its own S3 bucket and schedule
```

### Custom Schedule Expressions

```yaml
# Every 6 hours
Schedule: rate(6 hours)

# Every Monday at 2 AM
Schedule: cron(0 2 ? * MON *)

# Every day at 2 AM and 2 PM
# (requires two EventBridge rules)
Schedule: cron(0 2,14 * * ? *)

# First day of every month at midnight
Schedule: cron(0 0 1 * ? *)
```

### SNS Notifications on Failure

Add SNS topic for error notifications:

```yaml
Resources:
  # SNS Topic
  AlertTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: AWS Data Fetcher Alerts
      Subscription:
        - Endpoint: your-email@example.com
          Protocol: email

  # Update Error Alarm
  ErrorAlarm:
    Properties:
      AlarmActions:
        - !Ref AlertTopic
```

### API Gateway Integration (Optional)

Add API Gateway to serve data via HTTP:

```yaml
Resources:
  # API Lambda (lightweight, serves cached data)
  ApiFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: aws-data-fetcher-api
      Handler: lambda/api-handler.handler
      Runtime: nodejs20.x
      Timeout: 30
      MemorySize: 256
      Environment:
        Variables:
          S3_BUCKET_NAME: !Ref OutputBucket
      Policies:
        - S3ReadPolicy:
            BucketName: !Ref OutputBucket
      Events:
        GetRegions:
          Type: Api
          Properties:
            Path: /regions
            Method: GET
        GetServices:
          Type: Api
          Properties:
            Path: /services
            Method: GET
        GetComplete:
          Type: Api
          Properties:
            Path: /complete
            Method: GET
```

---

## Summary

### Key Takeaways

✅ **Simple architecture** - Single Lambda + EventBridge + S3

✅ **Cost-effective** - $0.025/month for daily complete fetch

✅ **No database needed** - S3 handles both data and cache

✅ **Fast execution** - 77 seconds (well within Lambda limits)

✅ **Manual trigger support** - On-demand execution via CLI/Console/SDK

✅ **Production-ready** - Includes monitoring, alarms, and best practices

✅ **Easy deployment** - SAM handles all infrastructure

### Deployment Checklist

- [ ] Install AWS SAM CLI
- [ ] Configure AWS credentials
- [ ] Choose unique S3 bucket name
- [ ] Update SAM template parameters (if needed)
- [ ] Run `sam build`
- [ ] Run `sam deploy --guided`
- [ ] Test manual execution
- [ ] Monitor first scheduled execution
- [ ] Tune performance if needed
- [ ] Set up CloudWatch alarm notifications (optional)

### Next Steps

1. **Deploy**: Follow deployment steps above
2. **Monitor**: Check CloudWatch logs after first execution
3. **Tune**: Adjust batch size if throttling occurs
4. **Automate**: Let EventBridge handle daily updates
5. **Access**: Retrieve data from S3 as needed

---

**Questions or Issues?** Check the main [README.md](../README.md) for additional documentation and troubleshooting tips.
