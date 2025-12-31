# Deployment Testing Changes Summary

## Overview

Added comprehensive post-deployment testing to the GitHub Actions workflow to automatically verify that Lambda functions and SNS notifications are working correctly after each deployment.

## Files Modified

### 1. `.github/workflows/deploy.yml`
**Changes**: Added 5 new testing steps after deployment

#### Added Steps:

1. **Enhanced Stack Outputs Retrieval** (line 112-134)
   - Added SNS topic ARN extraction
   - Stores: data-function-name, whats-new-function-name, output-bucket, sns-topic-arn

2. **Test Data Fetcher Lambda Invocation** (line 136-161)
   - Invokes Lambda function with test payload
   - Checks for execution errors
   - Captures and displays response
   - Outputs: test-result (success/failed)

3. **Verify S3 Output Files** (line 163-199)
   - Checks for required files: complete-data.json, regions.json, services.json
   - Verifies file existence using `s3api head-object`
   - Displays file size and last modified timestamp
   - Outputs: s3-verification (success/failed), missing-files

4. **Check CloudWatch Logs** (line 201-248)
   - Retrieves most recent log stream
   - Searches for success/error messages
   - Waits 5 seconds for logs to be available
   - Outputs: log-check (success/failed/warning)

5. **Verify SNS Notification** (line 250-274)
   - Queries CloudWatch metrics for SNS publish events
   - Checks NumberOfMessagesPublished metric (last 5 minutes)
   - Marked as `continue-on-error: true` (metrics may be delayed)
   - Outputs: sns-verification (success/warning)

6. **Enhanced Deployment Summary** (line 276-325)
   - Added "Post-Deployment Tests" section
   - Shows pass/fail status for each test
   - Visual indicators: ✅ (pass), ❌ (fail), ⚠️ (warning)
   - Displays all test results in GitHub Actions summary

### 2. `scripts/setup-oidc.sh`
**Changes**: Updated IAM policy with permissions for post-deployment testing

#### Added Permissions:

1. **S3Access** (line 280)
   - Added: `s3:HeadObject`
   - Required for: Verifying S3 file existence and metadata

2. **CloudWatchLogsAccess** (lines 322-323)
   - Added: `logs:DescribeLogStreams`
   - Added: `logs:GetLogEvents`
   - Required for: Reading Lambda execution logs

3. **CloudWatchMetricsAccess** (lines 354-367) - NEW STATEMENT
   - Added: `cloudwatch:GetMetricStatistics`
   - Added: `cloudwatch:ListMetrics`
   - Resource: `"*"` with region condition
   - Required for: Reading SNS publish metrics

## Script Consolidation

The OIDC setup script (`scripts/setup-oidc.sh`) now supports both initial setup and policy updates through a single unified interface:

**Features**:
- `--update-policy` flag for updating existing IAM policy
- Finds current policy ARN and version automatically
- Creates new policy version with all required permissions
- Sets new version as default
- Cleans up old policy versions (AWS limit: 5 versions)
- Provides detailed output and confirmation

**Usage**:
```bash
# Initial setup (first time)
./scripts/setup-oidc.sh

# Update policy (when permissions change)
./scripts/setup-oidc.sh --update-policy
```

### 2. `docs/POST_DEPLOYMENT_TESTING.md`
**Purpose**: Comprehensive documentation for post-deployment testing

**Contents**:
- Overview of testing steps
- Detailed explanation of each test
- IAM permissions required
- Instructions for updating permissions (automated and manual)
- Deployment summary examples
- Troubleshooting guide
- Cost impact analysis
- CI/CD integration details

## IAM Policy Synchronization

Following the project's CLAUDE.md guidelines for IAM policy synchronization:

### ✅ Bootstrap Script Updated
- File: `scripts/setup-oidc.sh`
- Status: Updated with all required permissions
- Version: Ready for future deployments

### ⏳ Live Policy Update Required
- Policy Name: `GithubActions-AWSServicesDataFetcher-Policy`
- Action Required: Run `./scripts/setup-oidc.sh --update-policy`
- Urgency: Required before next GitHub Actions deployment

## Testing Capabilities

The workflow now automatically tests:

1. **Lambda Function Execution**
   - Invokes function with test payload
   - Verifies no runtime errors
   - Confirms AWS service access (SSM, S3, SNS)

2. **S3 Data Output**
   - Verifies all required files exist
   - Checks file timestamps (confirms recent execution)
   - Displays file sizes

3. **CloudWatch Logs**
   - Reads execution logs
   - Searches for success/error messages
   - Provides log snippets for failures

4. **SNS Notifications**
   - Checks CloudWatch metrics for publish events
   - Confirms notification system is working
   - Handles metric delay gracefully

## Deployment Summary Enhancement

**Before** (old summary):
```markdown
### Deployment Successful 🚀
**Stack Name:** sam-aws-services-fetch
**Data Fetcher Function:** aws-data-fetcher
**Region:** us-east-1
```

**After** (new summary with tests):
```markdown
### Deployment Successful 🚀
**Stack Name:** sam-aws-services-fetch
**Data Fetcher Function:** aws-data-fetcher
**Region:** us-east-1

### Post-Deployment Tests 🧪
✅ **Lambda Invocation**: Passed
✅ **S3 Output Files**: All required files present
✅ **CloudWatch Logs**: Success message found
✅ **SNS Notifications**: Message(s) published successfully
```

## Benefits

1. **Immediate Verification**: Know instantly if deployment succeeded
2. **Automated Testing**: No manual verification needed
3. **Early Failure Detection**: Catch issues before users are affected
4. **Comprehensive Coverage**: Tests all critical components
5. **Audit Trail**: Complete test results in GitHub Actions
6. **Cost Effective**: Negligible cost (<$0.00001 per deployment)

## Next Steps

### 1. Update Live IAM Policy (REQUIRED)

Run the OIDC setup script in update mode:
```bash
cd /Users/johxan/Documents/my-projects/aws-services/aws-services-fetcher
./scripts/setup-oidc.sh --update-policy
```

This creates a new version of the GitHub Actions IAM policy with the required permissions.

### 2. Verify Permissions

After updating the policy, verify the permissions are active:
```bash
# Check policy version
aws iam get-policy \
  --policy-arn $(aws iam list-policies --scope Local \
    --query "Policies[?PolicyName=='GithubActions-AWSServicesDataFetcher-Policy'].Arn" \
    --output text) \
  --query 'Policy.DefaultVersionId'

# Test S3 access
aws s3api head-object \
  --bucket aws-data-fetcher-output \
  --key aws-data/complete-data.json

# Test CloudWatch Logs access
aws logs describe-log-streams \
  --log-group-name /aws/lambda/aws-data-fetcher \
  --max-items 1
```

### 3. Test the Workflow

Trigger a deployment to test the new workflow:

**Option 1: Push to main**
```bash
git add .
git commit -m "feat: add post-deployment testing to GitHub Actions workflow"
git push origin main
```

**Option 2: Manual workflow dispatch**
- Go to GitHub Actions → Deploy SAM Application
- Click "Run workflow" → "Run workflow"

### 4. Review Test Results

After the workflow runs:
1. Navigate to GitHub Actions → Deploy SAM Application
2. Click on the latest run
3. Check the "Deployment Summary" at the bottom
4. Verify all tests passed (green checkmarks)

## Rollback Plan

If issues occur after updating the IAM policy:

1. **Revert to previous policy version**:
   ```bash
   POLICY_ARN=$(aws iam list-policies --scope Local \
     --query "Policies[?PolicyName=='GithubActions-AWSServicesDataFetcher-Policy'].Arn" \
     --output text)

   # List versions
   aws iam list-policy-versions --policy-arn "$POLICY_ARN"

   # Set previous version as default
   aws iam set-default-policy-version \
     --policy-arn "$POLICY_ARN" \
     --version-id v1  # Replace with actual previous version
   ```

2. **Disable testing steps** (temporary):
   - Edit `.github/workflows/deploy.yml`
   - Comment out testing steps (lines 136-274)
   - Push changes to disable tests

## Security Considerations

All added permissions follow least-privilege principles:

- **S3**: Only read access (HeadObject), limited to specific buckets
- **CloudWatch Logs**: Read-only access, limited to Lambda log groups
- **CloudWatch Metrics**: Read-only, region-restricted with condition
- **Lambda**: InvokeFunction already existed, not newly added

No new destructive or write permissions were added.

## Cost Impact

**Post-Deployment Testing Cost** (per deployment):
- Lambda invocation: ~$0.0000002
- S3 API calls (3x HeadObject): ~$0.0000012
- CloudWatch API calls (4 calls): ~$0.0000004
- **Total**: Less than $0.00001 per deployment (~negligible)

**Annual Cost** (assuming 50 deployments/year):
- Less than $0.0005/year (~$0.50 over 1000 years)

## Documentation Updates

Created comprehensive documentation:
- `docs/POST_DEPLOYMENT_TESTING.md` - Full testing guide
- `scripts/setup-oidc.sh` - Enhanced with `--update-policy` mode for policy updates
- `DEPLOYMENT_TESTING_CHANGES.md` - This summary document

## Script Consolidation Benefits

Eliminated duplicate code by consolidating IAM policy management:
- **Before**: 2 separate scripts (setup-oidc.sh + update-github-actions-policy.sh) with 280+ lines of duplicated policy document
- **After**: 1 unified script with `--update-policy` flag
- **Benefit**: Single source of truth for IAM policy - no risk of drift between scripts
- **Maintenance**: Update policy once, works for both create and update operations

## Validation

- ✅ YAML syntax validated with `yaml-lint`
- ✅ IAM policy JSON structure verified
- ✅ All file paths and references checked
- ✅ Permissions aligned with AWS best practices
- ✅ Bootstrap script synchronized with live policy requirements

## Questions or Issues?

If you encounter any issues:
1. Check `docs/POST_DEPLOYMENT_TESTING.md` for troubleshooting
2. Review GitHub Actions logs for detailed error messages
3. Verify IAM policy permissions are active
4. Check CloudWatch Logs manually for function execution details
