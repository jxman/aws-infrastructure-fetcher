# Post-Deployment Testing for GitHub Actions

This document describes the post-deployment testing capabilities added to the GitHub Actions deployment workflow.

## Overview

The GitHub Actions workflow (`deploy.yml`) now includes comprehensive post-deployment testing to verify that the Lambda functions and SNS notifications are working correctly after each deployment.

## Testing Steps

### 1. Lambda Function Invocation Test

**Step**: `Test Data Fetcher Lambda Invocation`

- **Purpose**: Invokes the Data Fetcher Lambda function to verify it executes without errors
- **Method**: Uses `aws lambda invoke` with a test payload
- **Payload**: `{"includeServiceMapping": false, "forceRefresh": true}`
- **Success Criteria**: No function errors, successful execution

**What it verifies**:
- Lambda function is deployed correctly
- Function code executes without runtime errors
- Function can access required AWS services (SSM, S3, SNS)

### 2. S3 Output Files Verification

**Step**: `Verify S3 Output Files`

- **Purpose**: Confirms that the Lambda function successfully created output files in S3
- **Method**: Uses `aws s3api head-object` to check file existence and metadata
- **Verified Files**:
  - `aws-data/complete-data.json`
  - `aws-data/regions.json`
  - `aws-data/services.json`

**What it verifies**:
- Lambda has proper S3 write permissions
- Data fetching logic completed successfully
- All required output files are present
- Files have recent timestamps (just created)

**Output Example**:
```
✅ Found: aws-data/complete-data.json
   Size: 412847 bytes, Last Modified: 2025-12-30T19:45:23+00:00
✅ Found: aws-data/regions.json
   Size: 8241 bytes, Last Modified: 2025-12-30T19:45:22+00:00
✅ Found: aws-data/services.json
   Size: 7892 bytes, Last Modified: 2025-12-30T19:45:23+00:00
```

### 3. CloudWatch Logs Verification

**Step**: `Check CloudWatch Logs`

- **Purpose**: Inspects Lambda execution logs for success messages or errors
- **Method**: Queries CloudWatch Logs for the most recent log stream and events
- **Success Indicators**: "Data fetch completed successfully" message
- **Failure Indicators**: Any error messages in logs

**What it verifies**:
- CloudWatch Logs integration is working
- Lambda execution completed without errors
- Application logic executed successfully

### 4. SNS Notification Verification

**Step**: `Verify SNS Notification`

- **Purpose**: Confirms that SNS notifications were sent successfully
- **Method**: Queries CloudWatch metrics for SNS publish events
- **Metric**: `NumberOfMessagesPublished` for the SNS topic
- **Timeframe**: Last 5 minutes
- **Note**: Marked as `continue-on-error: true` since metrics may take time to appear

**What it verifies**:
- SNS topic is configured correctly
- Lambda has SNS publish permissions
- Notification emails are being sent

## IAM Permissions Required

The GitHub Actions IAM policy requires the following additional permissions for post-deployment testing:

### S3 Permissions
```json
{
  "Action": [
    "s3:GetObject",
    "s3:HeadObject"
  ]
}
```

### CloudWatch Logs Permissions
```json
{
  "Action": [
    "logs:DescribeLogStreams",
    "logs:GetLogEvents"
  ]
}
```

### CloudWatch Metrics Permissions
```json
{
  "Action": [
    "cloudwatch:GetMetricStatistics",
    "cloudwatch:ListMetrics"
  ]
}
```

### Lambda Permissions
```json
{
  "Action": [
    "lambda:InvokeFunction"
  ]
}
```

## Updating IAM Permissions

### Method 1: Automated Script (Recommended)

Run the OIDC setup script in update mode to update the live IAM policy:

```bash
./scripts/setup-oidc.sh --update-policy
```

This command:
- Finds the existing policy ARN
- Creates a new policy version with added permissions
- Sets the new version as default
- Cleans up old policy versions (AWS limit: 5 versions)

### Method 2: Manual Update

1. **Navigate to IAM Console**:
   - Go to IAM → Policies → `GithubActions-AWSServicesDataFetcher-Policy`

2. **Create New Version**:
   - Click "Edit policy" → "JSON"
   - Add the following permissions to respective statements:
     - Add `s3:HeadObject` to the S3Access statement
     - Add `logs:DescribeLogStreams` and `logs:GetLogEvents` to CloudWatchLogsAccess statement
     - Add a new CloudWatchMetricsAccess statement for metrics reading

3. **Save and Set as Default**

4. **Clean Up Old Versions** (if you have 5 versions):
   - Delete the oldest non-default version

## Deployment Summary Output

After deployment completes, the GitHub Actions workflow generates a comprehensive summary:

```markdown
### Deployment Successful 🚀

**Stack Name:** sam-aws-services-fetch
**Data Fetcher Function:** aws-data-fetcher
**What's New Function:** aws-whats-new-fetcher
**Output Bucket:** aws-data-fetcher-output
**Region:** us-east-1

**Deployed at:** Mon Dec 30 19:45:30 UTC 2025

### Post-Deployment Tests 🧪

✅ **Lambda Invocation**: Passed
✅ **S3 Output Files**: All required files present
✅ **CloudWatch Logs**: Success message found
✅ **SNS Notifications**: Message(s) published successfully

### Resources
- Data Fetcher: Runs daily at 2 AM UTC
- What's New Fetcher: Runs 4x daily (2 AM, 8 AM, 2 PM, 8 PM UTC)
- Public Data: https://aws-services.synepho.com/data/
```

## Test Results Interpretation

### Success Scenario
All tests pass with green checkmarks (✅):
- Lambda function invoked successfully
- All S3 files created
- CloudWatch Logs show success message
- SNS notification sent

### Partial Success Scenario
Some tests pass, some show warnings (⚠️):
- Lambda invoked but logs not yet available → Normal, logs may take a few seconds
- SNS metrics not detected → Normal, metrics can take 1-5 minutes to appear

### Failure Scenario
Any test fails with red X (❌):
- Lambda invocation failed → Check function code or permissions
- S3 files missing → Check S3 permissions or application logic
- CloudWatch Logs show errors → Review application logs for error details

## Troubleshooting

### Lambda Invocation Fails
```bash
# Check Lambda function status
aws lambda get-function --function-name aws-data-fetcher

# Check function logs manually
aws logs tail /aws/lambda/aws-data-fetcher --follow
```

### S3 Files Not Found
```bash
# List bucket contents
aws s3 ls s3://aws-data-fetcher-output/aws-data/ --recursive

# Check bucket permissions
aws s3api get-bucket-policy --bucket aws-data-fetcher-output
```

### CloudWatch Logs Not Available
- **Cause**: Logs may take 5-10 seconds to appear after function execution
- **Solution**: Re-run the workflow or check logs manually after a few minutes

### SNS Metrics Not Detected
- **Cause**: CloudWatch metrics have a delay of 1-5 minutes
- **Solution**: This is normal behavior; metrics will appear shortly
- **Verification**: Check your email for the SNS notification

## CI/CD Integration

The post-deployment tests are automatically triggered for:
- **Push to main branch**: Full test suite runs after deployment
- **Pull requests**: Tests are skipped (deployment doesn't occur)
- **Manual workflow dispatch**: Full test suite runs after deployment

## Cost Impact

Post-deployment testing adds minimal cost:
- **Lambda Invocation**: ~$0.0000002 per test run
- **CloudWatch API Calls**: ~$0.000001 per test run
- **S3 API Calls**: ~$0.000004 per test run

**Total per deployment**: Less than $0.00001 (~negligible)

## Benefits

1. **Immediate Feedback**: Know instantly if deployment was successful
2. **Automated Verification**: No manual testing required
3. **Comprehensive Coverage**: Tests all critical components (Lambda, S3, SNS, Logs)
4. **Failure Detection**: Catch deployment issues before users are affected
5. **Audit Trail**: Complete test results in GitHub Actions summary

## Future Enhancements

Potential additions to consider:
- Test the What's New Fetcher Lambda function
- Verify CloudFront invalidation completed successfully
- Check data quality (e.g., region count, service count)
- Performance benchmarking (execution time)
- Cost tracking and alerts
