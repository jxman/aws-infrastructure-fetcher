# Lambda Deployment Quick Start

This guide will help you deploy the AWS SSM Data Fetcher to AWS Lambda using SAM (Serverless Application Model).

## Prerequisites

### 1. Install AWS SAM CLI

```bash
# macOS (using Homebrew)
brew install aws-sam-cli

# Verify installation
sam --version
```

### 2. Configure AWS Credentials

```bash
# Configure AWS CLI with your credentials
aws configure

# You'll need:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (e.g., us-east-1)
```

### 3. Choose a Unique S3 Bucket Name

Your S3 bucket name must be globally unique across all AWS accounts. Choose something like:
- `aws-data-fetcher-[your-company]-[random]`
- `aws-ssm-data-[your-name]-2025`

**Note**: You cannot use the default `aws-data-fetcher-output` as it's not unique.

## Deployment Steps

### Step 1: Build the Lambda Package

```bash
# Navigate to project directory
cd /Users/johxan/Documents/my-projects/nodejs/nodejs-aws-fetcher

# Build the Lambda function
sam build
```

This will:
- Create a `.aws-sam` directory
- Package your code and dependencies
- Prepare for deployment

### Step 2: Deploy to AWS (First Time - Guided)

```bash
# Deploy with guided setup
sam deploy --guided
```

You'll be prompted for:

```
Stack Name [aws-data-fetcher]: aws-data-fetcher (press Enter)
AWS Region [us-east-1]: us-east-1 (or your preferred region)
Parameter S3BucketName [aws-data-fetcher-output]: YOUR-UNIQUE-BUCKET-NAME
Parameter ScheduleExpression [cron(0 2 * * ? *)]: (press Enter for daily at 2 AM UTC)
Parameter BatchSize [10]: 10 (press Enter for conservative default)
Parameter PaginationDelay [40]: 40 (press Enter for default)
Confirm changes before deploy [Y/n]: Y
Allow SAM CLI IAM role creation [Y/n]: Y
Disable rollback [y/N]: N
DataFetcherFunction may not have authorization defined, Is this okay? [y/N]: y
Save arguments to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: (press Enter)
SAM configuration environment [default]: (press Enter)
```

**IMPORTANT**: Replace `YOUR-UNIQUE-BUCKET-NAME` with your globally unique bucket name!

### Step 3: Wait for Deployment

SAM will:
1. Create a CloudFormation stack
2. Create the S3 bucket
3. Upload your Lambda code
4. Create the Lambda function
5. Set up EventBridge schedule
6. Configure CloudWatch alarms
7. Set up all IAM roles and permissions

This takes about 2-5 minutes.

### Step 4: Verify Deployment

```bash
# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name aws-data-fetcher

# List Lambda functions
aws lambda list-functions | grep aws-data-fetcher

# View EventBridge rules
aws events list-rules | grep aws-data-fetcher
```

## Manual Testing

### Test Lambda Function Immediately

```bash
# Invoke the Lambda function manually
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# View the response
cat response.json | jq .
```

### Check CloudWatch Logs

```bash
# View recent logs
sam logs --name DataFetcherFunction --tail

# Or use AWS CLI
aws logs tail /aws/lambda/aws-data-fetcher --follow
```

### Check S3 Bucket

```bash
# List files in your bucket
aws s3 ls s3://YOUR-BUCKET-NAME/aws-data/

# Download a file
aws s3 cp s3://YOUR-BUCKET-NAME/aws-data/regions.json ./downloaded-regions.json
```

## Subsequent Deployments

After the first deployment, you can deploy updates simply:

```bash
# Build and deploy with saved configuration
sam build && sam deploy
```

## Manual Invocation Options

### Default (Complete Fetch with Service Mapping)

```bash
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json
```

### Regions Only (Faster)

```bash
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"regionsOnly":true}' \
  response.json
```

### Services Only (Faster)

```bash
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"servicesOnly":true}' \
  response.json
```

### Force Refresh (Bypass 24-Hour Cache)

**Recommended**: Use asynchronous invocation for force refresh (takes ~1m 46s):

```bash
# Async invocation - returns immediately, Lambda runs in background
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --invocation-type Event \
  --payload '{"forceRefresh":true}' \
  response.json

# Monitor execution in CloudWatch logs
aws logs tail /aws/lambda/aws-data-fetcher --follow
```

**Alternative** (synchronous - waits for completion):
```bash
# Requires increased timeout to prevent CLI read timeout
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout 180 \
  --payload '{"forceRefresh":true}' \
  response.json
```

## EventBridge Schedule Management

### Disable Daily Schedule

```bash
# List rules to find the rule name
aws events list-rules | grep aws-data-fetcher

# Disable the rule (pause automated runs)
aws events disable-rule --name aws-data-fetcher-DataFetcherFunctionDailySchedule-XXXXX
```

### Enable Daily Schedule

```bash
# Enable the rule (resume automated runs)
aws events enable-rule --name aws-data-fetcher-DataFetcherFunctionDailySchedule-XXXXX
```

### Change Schedule Time

Edit `template.yaml` and change the `ScheduleExpression` parameter, then redeploy:

```yaml
Parameters:
  ScheduleExpression:
    Default: cron(0 3 * * ? *)  # Change to 3 AM UTC
```

Then run:
```bash
sam build && sam deploy
```

## Performance Tuning

If you want to adjust performance after deployment:

### Update Environment Variables

Edit `template.yaml` and modify these parameters:

```yaml
Parameters:
  BatchSize:
    Default: 12  # Increase for faster execution

  PaginationDelay:
    Default: 35  # Decrease for faster execution
```

Then redeploy:
```bash
sam build && sam deploy
```

### Performance Presets

**Conservative** (default, safe for all accounts):
- BatchSize: 10
- PaginationDelay: 40
- Expected: ~77 seconds

**Balanced** (faster, low risk):
- BatchSize: 12
- PaginationDelay: 35
- Expected: ~65-70 seconds

**Aggressive** (fastest, medium risk):
- BatchSize: 15
- PaginationDelay: 30
- Expected: ~55-60 seconds
- ⚠️ May encounter throttling in some accounts

## Monitoring

### CloudWatch Dashboard

View metrics in AWS Console:
1. Go to CloudWatch Console
2. Navigate to Alarms
3. Check `aws-data-fetcher-errors` and `aws-data-fetcher-duration`

### View Logs

```bash
# Follow logs in real-time
sam logs --name DataFetcherFunction --tail

# Search for errors
sam logs --name DataFetcherFunction --filter 'ERROR'

# Search for throttling
sam logs --name DataFetcherFunction --filter 'ThrottlingException'
```

## Troubleshooting

### Error: S3 bucket already exists

Your bucket name must be globally unique. Choose a different name and redeploy.

### Error: ThrottlingException

Your account is hitting AWS rate limits. Solutions:
1. Reduce BatchSize (e.g., from 10 to 8)
2. Increase PaginationDelay (e.g., from 40 to 50)
3. Redeploy with new settings

### Lambda Timeout

If execution exceeds 180 seconds:
1. Check if cache is working (should speed up subsequent runs)
2. Consider increasing timeout in `template.yaml`
3. Or reduce scope (fetch only regions/services, not mapping)

### CLI Read Timeout

**Problem**: `Read timeout on endpoint URL` when invoking Lambda

**Cause**: AWS CLI default timeout is 60 seconds. Force refresh operations take ~1m 46s.

**Solution**:
```bash
# Use async invocation (recommended - returns immediately)
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --invocation-type Event \
  --payload '{"forceRefresh":true}' \
  response.json

# Or increase CLI timeout
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout 180 \
  --payload '{"forceRefresh":true}' \
  response.json
```

**Important**: Even if CLI times out, Lambda continues running and completes successfully. Check CloudWatch logs to verify.

### Duplicate Lambda Invocations

**Problem**: Multiple Lambda executions and SNS notifications

**Cause**: CLI timeout causes you to retry the command, starting a new Lambda invocation while the first is still running.

**Solution**: Use async invocation or increase timeout as shown above. Never retry when you see timeout - Lambda is still running.

## Cleanup / Delete

To remove all resources:

```bash
# Delete the CloudFormation stack
sam delete

# Note: S3 bucket is retained by default for safety
# To delete the bucket manually:
aws s3 rm s3://YOUR-BUCKET-NAME/ --recursive
aws s3 rb s3://YOUR-BUCKET-NAME
```

## Cost Estimate

With daily execution:
- Lambda: ~$0.02/month
- S3: ~$0.01/month
- CloudWatch: ~$0.01/month
- **Total: ~$0.04/month** (less than 5 cents!)

## Next Steps

1. **Test the deployment** - Run a manual invocation
2. **Monitor first scheduled execution** - Check CloudWatch logs at 2 AM UTC
3. **Review S3 data** - Verify files are being created correctly
4. **Tune performance** - Adjust batch size if needed
5. **Set up notifications** (optional) - Add SNS topic for error alerts

## Support

For detailed information, see:
- [LAMBDA_DEPLOYMENT_GUIDE.md](docs/LAMBDA_DEPLOYMENT_GUIDE.md) - Complete deployment guide
- [README.md](README.md) - Project documentation
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)

## Summary

✅ **Simple deployment** - Just `sam build` and `sam deploy --guided`

✅ **Automated daily updates** - EventBridge runs at 2 AM UTC

✅ **Manual trigger ready** - Invoke anytime via AWS CLI

✅ **Cost-effective** - Less than 5 cents per month

✅ **Production-ready** - Includes monitoring and alarms
