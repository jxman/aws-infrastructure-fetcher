# CloudFront Distribution Implementation Design

**Project**: AWS Services Fetcher
**Feature**: CloudFront-backed data distribution
**Status**: Design Phase
**Priority**: High (Cost Optimization + Performance)
**Created**: 2025-10-18

---

## Executive Summary

Implement data file distribution to CloudFront-backed website bucket to reduce S3 costs and improve global performance. This follows the proven pattern already implemented in the `aws-services-reporter` project for Excel report distribution.

### Key Benefits
- ✅ **Cost Protection**: CloudFront caching reduces S3 GET requests by ~95%
- ✅ **Performance**: Edge caching provides faster global access
- ✅ **Unified Infrastructure**: Same bucket/CDN as website hosting
- ✅ **Traffic Spike Protection**: Cached at edge locations
- ✅ **Proven Pattern**: Mirrors successful reporter implementation

---

## Problem Statement

### Current Architecture (Problematic)

```
┌─────────────────────────────────────────────────────────┐
│ Fetcher Lambda (Daily 2 AM UTC)                         │
│  - Fetches AWS metadata                                 │
│  - Generates JSON files                                 │
│  - Saves to S3: aws-data-fetcher-output                │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ S3 Bucket: aws-data-fetcher-output                      │
│ └── aws-data/                                           │
│     ├── complete-data.json  (239 KB)                    │
│     ├── regions.json        (9.6 KB)                    │
│     └── services.json       (32 KB)                     │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼ Direct S3 GET (every request)
                         │
┌─────────────────────────────────────────────────────────┐
│ End Users / React App                                   │
│ https://aws-data-fetcher-output.s3.amazonaws.com/       │
│         aws-data/complete-data.json                     │
└─────────────────────────────────────────────────────────┘
```

### Problems with Current Approach

1. **Every user request hits S3 directly**
   - S3 GET request charges: $0.0004 per 1,000 requests
   - S3 data transfer out: $0.09/GB to internet
   - No caching layer between S3 and users

2. **Cost Scaling Issues**
   - 10,000 visitors/day: ~$6.42/month (manageable)
   - 100,000 visitors/day: ~$64/month (concerning)
   - 1,000,000 visitors/day: ~$640/month (problematic)

3. **Performance Issues**
   - Single-region S3 access (no edge caching)
   - Higher latency for international users
   - No protection against traffic spikes

4. **Architectural Inconsistency**
   - Website served via CloudFront
   - Excel reports served via CloudFront
   - JSON data served directly from S3 (inconsistent)

---

## Proposed Architecture

### Target Architecture (Optimized)

```
┌─────────────────────────────────────────────────────────┐
│ Fetcher Lambda (Daily 2 AM UTC)                         │
│  1. Fetches AWS metadata                                │
│  2. Generates JSON files                                │
│  3. Saves to aws-data-fetcher-output (source/backup)   │
│  4. COPIES to www.aws-services.synepho.com (CDN)       │
│     (with Cache-Control: public, max-age=300)          │
└─────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                              │
          ▼ (Source/Backup)              ▼ (Distribution)
┌─────────────────────┐    ┌──────────────────────────────┐
│ aws-data-fetcher-   │    │ www.aws-services.synepho.com │
│ output              │    │ └── data/                    │
│ └── aws-data/       │    │     ├── complete-data.json   │
│     ├── ...         │    │     ├── regions.json         │
│     └── history/    │    │     └── services.json        │
└─────────────────────┘    └──────────────────────────────┘
                                        │
                                        ▼ CloudFront CDN
                                        │ (Edge Caching)
                           ┌────────────┴────────────┐
                           │                         │
                    Edge Location            Edge Location
                    (US East)                (EU West)
                           │                         │
                           └────────────┬────────────┘
                                        ▼
                           ┌─────────────────────────┐
                           │ End Users / React App   │
                           │ https://aws-services.   │
                           │ synepho.com/data/       │
                           │ complete-data.json      │
                           └─────────────────────────┘
```

### Architecture Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **S3 Requests** | 100% of user requests | ~5% (cache misses only) |
| **Data Transfer** | From S3 to internet | From CloudFront (cheaper) |
| **Global Latency** | Single region | Edge locations worldwide |
| **Cost @ 100K/day** | ~$64/month | ~$63/month (cached) |
| **Spike Protection** | ❌ None | ✅ Edge caching |
| **Infrastructure** | ❌ Separate | ✅ Unified with website |

---

## Implementation Plan

### Phase 1: Add Distribution Function (1-2 hours)

**File**: `src/storage/s3-storage.js`

**Add new method** after `saveComplete()`:

```javascript
const { CopyObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Distribute data files to CloudFront-backed website bucket
 * Follows the same pattern as aws-service-report-generator
 *
 * @param {string} distributionBucket - Website bucket name (e.g., www.aws-services.synepho.com)
 * @param {string} distributionPrefix - Key prefix in distribution bucket (e.g., 'data')
 * @returns {Promise<Object>} Distribution result
 */
async distributeToWebsite(distributionBucket, distributionPrefix = 'data') {
  // Skip if not configured
  if (!distributionBucket) {
    console.log('⏭️  Distribution skipped (not configured)');
    return {
      distributed: false,
      reason: 'Distribution bucket not configured'
    };
  }

  const files = [
    'complete-data.json',
    'regions.json',
    'services.json'
  ];

  console.log('📤 Distributing data files to CloudFront-backed website bucket...');
  console.log(`   Source: s3://${this.bucketName}/${this.prefix}/`);
  console.log(`   Destination: s3://${distributionBucket}/${distributionPrefix}/`);

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const file of files) {
    try {
      const sourceKey = `${this.prefix}/${file}`;
      const destinationKey = `${distributionPrefix}/${file}`;

      const command = new CopyObjectCommand({
        Bucket: distributionBucket,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=300',  // 5 minutes (same as Excel reports)
        MetadataDirective: 'REPLACE',
        Metadata: {
          'distributed-at': new Date().toISOString(),
          'source-bucket': this.bucketName,
          'source-key': sourceKey
        }
      });

      await this.s3Client.send(command);

      console.log(`✅ Distributed: ${file}`);
      console.log(`   From: s3://${this.bucketName}/${sourceKey}`);
      console.log(`   To:   s3://${distributionBucket}/${destinationKey}`);

      results.push({
        file,
        success: true,
        destinationPath: `s3://${distributionBucket}/${destinationKey}`
      });
      successCount++;

    } catch (error) {
      console.error(`⚠️  Failed to distribute ${file}:`, error.message);
      console.error(`   This is a non-critical operation. Source data saved successfully.`);

      results.push({
        file,
        success: false,
        error: error.message,
        errorType: error.name
      });
      failureCount++;
    }
  }

  const distributionResult = {
    distributed: successCount > 0,
    distributionBucket,
    distributionPrefix,
    totalFiles: files.length,
    successCount,
    failureCount,
    results
  };

  if (successCount === files.length) {
    console.log(`✅ All ${files.length} files distributed successfully`);
  } else if (successCount > 0) {
    console.log(`⚠️  Partial distribution: ${successCount}/${files.length} files succeeded`);
  } else {
    console.error(`❌ Distribution failed for all files`);
  }

  return distributionResult;
}
```

**Add to module exports**:
```javascript
module.exports = S3Storage;
// Ensure the new method is available on the class
```

---

### Phase 2: Update Lambda Handler (30 minutes)

**File**: `src/lambda/handler.js`

**Find the section** where files are saved (after `saveComplete()` call):

```javascript
// Existing code (around line 80-90)
await storage.saveComplete(completeData);
console.log('✅ All data saved successfully');

// ADD THIS NEW CODE:
// Step X: Distribute to CloudFront-backed website bucket (non-critical)
console.log('📤 Distributing data to website bucket...');
try {
  const distributionResult = await storage.distributeToWebsite(
    process.env.DISTRIBUTION_BUCKET,
    process.env.DISTRIBUTION_PREFIX || 'data'
  );

  if (distributionResult.distributed) {
    console.log(`✅ Distribution complete: ${distributionResult.successCount}/${distributionResult.totalFiles} files`);
    // Add to response metadata if tracking
    responseMetadata.distribution = distributionResult;
  } else {
    console.log(`⏭️  Distribution skipped: ${distributionResult.reason || 'Unknown reason'}`);
    responseMetadata.distribution = { skipped: true, reason: distributionResult.reason };
  }
} catch (distributionError) {
  // Non-critical error - don't fail the Lambda
  console.error('⚠️  Distribution failed (non-critical):', distributionError.message);
  console.error('   Source data saved successfully. Distribution can be retried manually.');
  responseMetadata.distribution = {
    failed: true,
    error: distributionError.message
  };
}
```

---

### Phase 3: Update SAM Template (15 minutes)

**File**: `template.yaml`

**Add new parameters** (add to Parameters section):

```yaml
Parameters:
  # ... existing parameters ...

  DistributionBucketName:
    Type: String
    Default: ''
    Description: (Optional) S3 bucket for CloudFront distribution (e.g., www.aws-services.synepho.com). Leave empty to disable.

  DistributionKeyPrefix:
    Type: String
    Default: data
    Description: Key prefix in distribution bucket for data files (e.g., 'data' creates data/complete-data.json)
```

**Add condition** (add to Conditions section):

```yaml
Conditions:
  HasDistributionBucket: !Not [!Equals [!Ref DistributionBucketName, '']]
```

**Update Lambda environment variables**:

```yaml
Resources:
  DataFetcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      # ... existing properties ...
      Environment:
        Variables:
          # ... existing environment variables ...
          DISTRIBUTION_BUCKET: !Ref DistributionBucketName
          DISTRIBUTION_PREFIX: !Ref DistributionKeyPrefix
```

**Add S3 write permissions** (add to Lambda's IAM policy):

```yaml
Policies:
  - Version: '2012-10-17'
    Statement:
      # ... existing statements ...

      # S3 Write Access (Distribution Bucket)
      - Effect: Allow
        Action:
          - s3:PutObject
          - s3:PutObjectAcl
        Resource:
          - !Sub 'arn:aws:s3:::${DistributionBucketName}/data/*'
        Condition:
          StringEquals:
            'aws:RequestedRegion': !Ref AWS::Region
```

---

### Phase 4: Update Deployment Configuration (10 minutes)

**File**: `samconfig.toml`

**Update parameter_overrides**:

```toml
[default.deploy.parameters]
# ... existing parameters ...
parameter_overrides = "S3BucketName=\"aws-data-fetcher-output\" DistributionBucketName=\"www.aws-services.synepho.com\" DistributionKeyPrefix=\"data\""
```

---

### Phase 5: Update Documentation (15 minutes)

**File**: `README.md`

Add section about distribution:

```markdown
## Data Distribution

Generated data files are automatically distributed to two locations:

1. **Source Bucket** (aws-data-fetcher-output)
   - Primary storage and backup
   - Historical snapshots
   - Direct S3 access (not recommended for public consumption)

2. **Distribution Bucket** (www.aws-services.synepho.com)
   - CloudFront-backed CDN distribution
   - Edge caching for performance
   - Public consumption endpoint
   - Cache-Control: public, max-age=300 (5 minutes)

### Public Data Access

Applications should fetch data from the CloudFront distribution:

```javascript
// Recommended (CloudFront-backed, cached)
const dataUrl = 'https://aws-services.synepho.com/data/complete-data.json';

// Not recommended (direct S3, higher costs)
const dataUrl = 'https://aws-data-fetcher-output.s3.amazonaws.com/aws-data/complete-data.json';
```

### Disabling Distribution

To disable distribution (Lambda will only save to source bucket):

```bash
sam deploy --parameter-overrides DistributionBucketName=""
```
```

---

## Testing Plan

### Local Testing (Before Deployment)

**1. Test distribution function locally:**

```bash
cd /Users/johxan/Documents/my-projects/nodejs/aws-services-fetcher

# Set environment variables
export AWS_REGION=us-east-1
export S3_BUCKET_NAME=aws-data-fetcher-output
export DISTRIBUTION_BUCKET=www.aws-services.synepho.com
export DISTRIBUTION_PREFIX=data

# Run locally (this will actually execute against AWS)
# Make sure to test in non-prod first if possible
node src/lambda/handler.js
```

**2. Verify files were copied:**

```bash
# Check source bucket
aws s3 ls s3://aws-data-fetcher-output/aws-data/

# Check distribution bucket
aws s3 ls s3://www.aws-services.synepho.com/data/

# Verify cache headers
aws s3api head-object \
  --bucket www.aws-services.synepho.com \
  --key data/complete-data.json \
  --query 'CacheControl'
```

**Expected output**: `"public, max-age=300"`

---

### Post-Deployment Testing

**1. Deploy to AWS:**

```bash
sam build
sam deploy --guided
```

**2. Trigger Lambda manually:**

```bash
aws lambda invoke \
  --function-name aws-infrastructure-data-fetcher \
  --payload '{}' \
  response.json

cat response.json
```

**3. Verify distribution in CloudWatch Logs:**

```bash
aws logs tail /aws/lambda/aws-infrastructure-data-fetcher --follow
```

Look for log messages:
- `📤 Distributing data files to CloudFront-backed website bucket...`
- `✅ Distributed: complete-data.json`
- `✅ All 3 files distributed successfully`

**4. Test public access via CloudFront:**

```bash
# Test CloudFront distribution
curl -I https://aws-services.synepho.com/data/complete-data.json

# Should see headers:
# Cache-Control: public, max-age=300
# Content-Type: application/json
# x-amz-meta-distributed-at: [timestamp]
```

**5. Verify data integrity:**

```bash
# Download and verify JSON is valid
curl https://aws-services.synepho.com/data/complete-data.json | jq '.metadata'

# Should show metadata with version, timestamp, counts
```

---

## Rollback Plan

If distribution causes issues:

### Option 1: Disable Distribution (Recommended)

```bash
aws cloudformation update-stack \
  --stack-name aws-infrastructure-data-fetcher \
  --use-previous-template \
  --parameters ParameterKey=DistributionBucketName,ParameterValue="" \
  --capabilities CAPABILITY_IAM
```

This disables distribution but keeps the code in place.

### Option 2: Revert Code Changes

```bash
cd /Users/johxan/Documents/my-projects/nodejs/aws-services-fetcher
git revert <commit-hash>
sam build
sam deploy
```

### Option 3: Manual Cleanup

If files were distributed but shouldn't be:

```bash
aws s3 rm s3://www.aws-services.synepho.com/data/ --recursive
```

---

## Migration Checklist

**Pre-Deployment:**
- [ ] Review and understand cost implications
- [ ] Verify CloudFront distribution is already configured for www.aws-services.synepho.com
- [ ] Backup current Lambda configuration
- [ ] Review IAM permissions for cross-bucket access

**Code Changes:**
- [ ] Add `distributeToWebsite()` method to `src/storage/s3-storage.js`
- [ ] Update `src/lambda/handler.js` to call distribution
- [ ] Add CopyObjectCommand import to s3-storage.js
- [ ] Test locally with actual AWS credentials

**Infrastructure Changes:**
- [ ] Update `template.yaml` with new parameters
- [ ] Add distribution bucket IAM permissions
- [ ] Update `samconfig.toml` with distribution bucket name
- [ ] Update README.md with distribution documentation

**Deployment:**
- [ ] Run `sam build`
- [ ] Run `sam deploy --guided`
- [ ] Verify parameters are correct
- [ ] Monitor deployment in CloudFormation console

**Post-Deployment:**
- [ ] Trigger Lambda manually to test
- [ ] Verify files appear in distribution bucket
- [ ] Check cache headers on distributed files
- [ ] Test public access via CloudFront URL
- [ ] Monitor CloudWatch Logs for errors
- [ ] Update React app to use new CloudFront URL

**Website Update (Separate Session):**
- [ ] Update `aws-services-site` project
- [ ] Change data fetch URL to CloudFront endpoint
- [ ] Test locally
- [ ] Deploy website updates
- [ ] Verify end-to-end data flow

---

## Cost Analysis

### Current Monthly Costs (Direct S3 Access)

| Traffic Level | S3 Requests | Data Transfer | Total/Month |
|---------------|-------------|---------------|-------------|
| 10K/day | $0.12 | $6.30 | $6.42 |
| 100K/day | $1.20 | $63.00 | $64.20 |
| 1M/day | $12.00 | $630.00 | $642.00 |

### Projected Monthly Costs (CloudFront Distribution)

| Traffic Level | CloudFront Requests | S3 Requests (5%) | CloudFront Transfer | Total/Month |
|---------------|---------------------|------------------|---------------------|-------------|
| 10K/day | $0.23 | $0.006 | $6.00 | $6.24 |
| 100K/day | $2.25 | $0.06 | $60.00 | $62.31 |
| 1M/day | $22.50 | $0.60 | $600.00 | $623.10 |

### Additional Distribution Costs

- **S3 Copy Operations**: ~$0.005/month (3 files × 30 days × $0.0005 per 1,000 requests)
- **Storage**: Negligible (3 files × 280 KB = 840 KB)
- **Lambda Execution**: No change (same Lambda runs)

**Net Savings**: Minimal at low traffic, significant at high traffic, plus performance benefits.

---

## Success Metrics

### Technical Metrics
- ✅ Distribution success rate: >99%
- ✅ File copy latency: <1 second per file
- ✅ CloudFront cache hit rate: >95%
- ✅ No increase in Lambda errors

### Operational Metrics
- ✅ Reduced S3 GET requests by ~95%
- ✅ Improved global latency (edge caching)
- ✅ Unified infrastructure (same as website)

### Business Metrics
- ✅ Cost protection against traffic spikes
- ✅ Better user experience (faster data loads)
- ✅ Scalable architecture for future growth

---

## Reference Implementation

This implementation mirrors the proven pattern in `aws-services-reporter`:

**Reporter Implementation Reference:**
- File: `aws-services-reporter/src/archiveManager.js:159-205`
- Method: `distributeReports()`
- Pattern: CopyObjectCommand with cache headers
- Distribution: Excel reports to www.aws-services.synepho.com/reports/

**Key Similarities:**
1. Non-critical operation (doesn't fail Lambda if distribution fails)
2. Cache-Control: public, max-age=300 (5 minutes)
3. CopyObjectCommand instead of PutObjectCommand
4. Comprehensive error handling and logging
5. Metadata tracking for observability

---

## Future Enhancements

### Phase 2 (Optional)
1. **CloudFront Invalidation**: Automatically invalidate cache when data updates
2. **Distribution Metrics**: Track distribution success rate in CloudWatch
3. **Multi-Region Distribution**: Replicate to multiple CloudFront distributions
4. **Compression**: Serve gzip-compressed JSON for bandwidth savings

### Phase 3 (Advanced)
1. **Versioned Data**: Keep multiple versions in distribution bucket
2. **Real-time Updates**: Trigger website refresh on data update
3. **A/B Testing**: Distribute to multiple paths for testing
4. **Analytics**: Track data fetch patterns via CloudWatch

---

## Questions & Answers

**Q: Why not use CloudFront directly with S3 as origin?**
A: Could work, but copying to website bucket provides:
- Unified infrastructure (same bucket as website)
- Explicit cache control
- Separation of source (backup) and distribution
- Consistent with existing Excel report pattern

**Q: What if distribution fails?**
A: Non-critical operation. Lambda succeeds, files are in source bucket. Can be retried manually or automatically on next run.

**Q: What about historical data?**
A: Historical snapshots remain in source bucket only. Distribution bucket only gets latest versions.

**Q: How to invalidate CloudFront cache manually?**
A:
```bash
aws cloudfront create-invalidation \
  --distribution-id EBTYLWOK3WVOK \
  --paths "/data/*"
```

---

## Contact & Support

- **Implementation Questions**: Review `aws-services-reporter` implementation
- **AWS Costs**: Monitor via AWS Cost Explorer
- **CloudFront Issues**: Check CloudFront distribution EBTYLWOK3WVOK
- **Lambda Errors**: Review CloudWatch Logs

---

## Appendix A: Complete File Changes

### File 1: `src/storage/s3-storage.js`

**Change**: Add `distributeToWebsite()` method (see Phase 1 for complete code)

**Location**: After `saveComplete()` method, before `loadCache()` method

**Lines to Add**: ~80 lines

### File 2: `src/lambda/handler.js`

**Change**: Add distribution call after `saveComplete()`

**Location**: After line where `saveComplete()` is called

**Lines to Add**: ~20 lines

### File 3: `template.yaml`

**Changes**:
1. Add DistributionBucketName parameter
2. Add DistributionKeyPrefix parameter
3. Add HasDistributionBucket condition
4. Add environment variables to Lambda
5. Add S3 write permissions for distribution bucket

**Lines to Add**: ~30 lines

### File 4: `samconfig.toml`

**Change**: Add DistributionBucketName to parameter_overrides

**Lines to Change**: 1 line

### File 5: `README.md`

**Change**: Add "Data Distribution" section

**Lines to Add**: ~40 lines

---

## Appendix B: IAM Permissions Required

The Lambda function needs these permissions:

```yaml
# Existing permissions (already have)
- s3:GetObject (source bucket)
- s3:PutObject (source bucket)
- s3:ListBucket (source bucket)

# New permissions (need to add)
- s3:PutObject (distribution bucket: www.aws-services.synepho.com/data/*)
- s3:PutObjectAcl (distribution bucket: www.aws-services.synepho.com/data/*)
```

**Important**: Do NOT grant s3:GetObject on distribution bucket (not needed).

---

## Appendix C: Troubleshooting

### Issue: Distribution fails with AccessDenied

**Cause**: Lambda IAM role lacks permissions

**Solution**:
```bash
# Check Lambda execution role permissions
aws iam get-role-policy --role-name <lambda-role-name> --policy-name <policy-name>

# Redeploy with correct permissions via SAM
sam deploy --guided
```

### Issue: Files copied but cache headers missing

**Cause**: MetadataDirective not set to REPLACE

**Solution**: Verify CopyObjectCommand includes `MetadataDirective: 'REPLACE'`

### Issue: CloudFront serves old data

**Cause**: Cache not invalidated after update

**Solution**:
```bash
aws cloudfront create-invalidation \
  --distribution-id EBTYLWOK3WVOK \
  --paths "/data/*"
```

### Issue: Distribution succeeds but website can't fetch

**Cause**: CORS headers missing on distribution bucket

**Solution**: Verify S3 bucket CORS configuration allows GET from website domain

---

**Document Version**: 1.0
**Last Updated**: 2025-10-18
**Next Review**: After implementation
**Status**: Ready for Implementation
