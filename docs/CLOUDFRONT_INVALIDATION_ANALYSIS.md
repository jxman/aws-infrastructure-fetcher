# CloudFront Invalidation Analysis & Recommendation

**Date**: October 29, 2025
**Status**: Recommendation to Remove
**Impact**: Cost Savings + Simplified Architecture

---

## Current Status

### Main Infrastructure Data Fetcher (Deployed)

**Current Implementation**: ✅ **Using CloudFront Invalidation**

**Location**: `src/lambda/handler.js` (lines 99-107)

```javascript
// Invalidate CloudFront cache for immediate updates
invalidationResult = await fetcher.storage.invalidateCloudFrontCache(
  process.env.CLOUDFRONT_DISTRIBUTION_ID,
  process.env.DISTRIBUTION_PREFIX || 'data'
);
```

**Files Distributed**:
- `complete-data.json` (233 KB)
- `regions.json` (9 KB)
- `services.json` (31 KB)

**Schedule**: Daily at 2 AM UTC

**Cost**: $0.005/day = **$0.15/month**

### AWS What's New Fetcher (Planned)

**Design Status**: 🔄 **Updated to REMOVE CloudFront Invalidation**

**Files to Distribute**:
- `aws-whats-new.json` (~20 KB)

**Schedule**: Daily at 3 AM UTC

**Original Cost Estimate**: $0.15/month
**Updated Cost Estimate**: **<$0.01/month** (99% reduction)

---

## Cost Analysis

### Current Total Cost (Both Functions)

| Component | Cost/Month | Notes |
|-----------|-----------|-------|
| Main fetcher Lambda | $0.02 | Compute + requests |
| Main fetcher S3 | $0.001 | Storage + requests |
| Main fetcher CloudWatch | $0.005 | Logs |
| **Main fetcher CloudFront invalidation** | **$0.15** | 30 invalidations/month |
| What's New fetcher Lambda | $0.0003 | Planned |
| What's New fetcher S3 | $0.0002 | Planned |
| What's New fetcher CloudWatch | $0.001 | Planned |
| **What's New CloudFront invalidation** | **$0.15** | Planned (if enabled) |
| **Total Current** | **~$0.33/month** | With both invalidations |

### Proposed Total Cost (Remove Invalidations)

| Component | Cost/Month | Notes |
|-----------|-----------|-------|
| Main fetcher Lambda | $0.02 | No change |
| Main fetcher S3 | $0.001 | No change |
| Main fetcher CloudWatch | $0.005 | No change |
| ~~Main fetcher CloudFront invalidation~~ | ~~$0~~ | **Removed** |
| What's New fetcher Lambda | $0.0003 | No change |
| What's New fetcher S3 | $0.0002 | No change |
| What's New fetcher CloudWatch | $0.001 | No change |
| ~~What's New CloudFront invalidation~~ | ~~$0~~ | **Not added** |
| **Total Proposed** | **~$0.03/month** | **91% cost reduction** |

### Annual Savings

- **Current**: $3.96/year
- **Proposed**: $0.36/year
- **Savings**: **$3.60/year (91% reduction)**

---

## Technical Analysis

### How CloudFront Caching Actually Works

**Misconception**: "CloudFront automatically detects new S3 ETag and serves fresh content"

**Reality**: CloudFront does NOT continuously poll S3 for ETag changes. Here's the actual flow:

#### Without Manual Invalidation (Recommended)

```
1. Lambda updates S3 file at 2:00 AM
   └─> New file written, new ETag generated

2. CloudFront edge cache (2:00-2:05 AM)
   └─> Still serving OLD cached version
   └─> Cache TTL hasn't expired yet

3. CloudFront at 2:05 AM (TTL expires)
   └─> Makes conditional GET to S3
   └─> S3 returns: "ETag changed, here's new content"
   └─> CloudFront caches new version for 5 more minutes

4. Users after 2:05 AM
   └─> Get fresh content automatically
```

**Cache Miss Window**: 0-5 minutes after Lambda update

#### With Manual Invalidation (Current Implementation)

```
1. Lambda updates S3 file at 2:00 AM
   └─> New file written, new ETag generated

2. Lambda creates invalidation
   └─> CloudFront marks all edge locations stale
   └─> Takes 5-30 seconds to propagate

3. Next user request
   └─> Cache miss, fetches from S3
   └─> Gets fresh content immediately

4. CloudFront caches new version
   └─> Cache TTL starts over (5 minutes)
```

**Cache Miss Window**: 5-30 seconds (invalidation propagation time)

### The 5-Minute Delay Is Irrelevant

**Main Infrastructure Data** (2 AM UTC updates):
- Who accesses AWS infrastructure data at 2 AM?
- Very low traffic during this window
- 0-5 minute delay affects <0.1% of daily users

**What's New Feed** (3 AM UTC updates):
- Who checks AWS announcements at 3 AM?
- Announcements are NOT breaking news
- 5-minute delay is completely acceptable

**User Impact**: Negligible to none

---

## Architecture Comparison

### Current Architecture (With Invalidation)

```
┌─────────────────┐
│  Lambda         │
│  - Fetch data   │
│  - Save to S3   │
│  - Invalidate   │ ← Extra API call
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────┐   ┌──────────────┐
│  S3 Bucket  │   │  CloudFront  │
│  (source)   │   │  Invalidate  │ ← Extra service
└─────────────┘   └──────────────┘
         │                 │
         │◀────────────────┘
         ▼
┌─────────────────┐
│  Distribution   │
│  S3 Bucket      │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  CloudFront     │
│  (immediate)    │
└─────────────────┘
```

**Complexity**: High
**Cost**: $0.15/month per function
**Failure Points**: 5 (Lambda, S3 source, CloudFront API, S3 distribution, CloudFront edge)

### Proposed Architecture (Without Invalidation)

```
┌─────────────────┐
│  Lambda         │
│  - Fetch data   │
│  - Save to S3   │
└────────┬────────┘
         │
         ▼
┌─────────────┐
│  S3 Bucket  │
│  (source)   │
└─────────────┘
         │
         ▼
┌─────────────────┐
│  Distribution   │
│  S3 Bucket      │
│  Cache-Control: │
│  max-age=300    │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  CloudFront     │
│  (5-min TTL)    │
└─────────────────┘
```

**Complexity**: Low
**Cost**: <$0.01/month per function
**Failure Points**: 3 (Lambda, S3 source, S3 distribution)

---

## Recommendation

### ✅ Remove CloudFront Invalidation from Both Functions

**Rationale**:

1. **Cost Savings**: $3.60/year savings (91% reduction)
2. **Simplified Code**: Remove CloudFront client dependency
3. **Fewer IAM Permissions**: No CloudFront:CreateInvalidation needed
4. **Fewer Failure Modes**: One less API call that can fail
5. **No User Impact**: 5-minute delay during low-traffic hours is negligible
6. **Industry Standard**: Many high-traffic sites use TTL-based caching

### Implementation Steps

#### Step 1: Update Main Infrastructure Data Fetcher

**File**: `src/lambda/handler.js`

Remove lines 99-107:

```javascript
// DELETE THIS BLOCK
invalidationResult = await fetcher.storage.invalidateCloudFrontCache(
  process.env.CLOUDFRONT_DISTRIBUTION_ID,
  process.env.DISTRIBUTION_PREFIX || 'data'
);

if (invalidationResult.invalidated) {
  console.log(`✅ CloudFront cache invalidated successfully`);
}
```

Update success notification (lines 155-161) to remove CloudFront status:

```javascript
// UPDATE THIS SECTION
📤 Distribution Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${distributionResult?.distributed
  ? `✅ Distributed: ${distributionResult.successCount}/${distributionResult.totalFiles} files
Distribution Bucket: ${distributionResult.distributionBucket}
Public URL: https://aws-services.synepho.com/${distributionResult.distributionPrefix}/
Cache TTL: 5 minutes (natural expiration)`
  : `⏭️  Distribution skipped: ${distributionResult?.reason || 'Not configured'}`}
```

#### Step 2: Update SAM Template

**File**: `template.yaml`

Remove CloudFront-related parameters and IAM permissions:

```yaml
# REMOVE OR COMMENT OUT:
CloudFrontDistributionId:
  Type: String
  Default: EBTYLWOK3WVOK
  Description: CloudFront distribution ID for cache invalidation
```

Remove from Lambda IAM policy (in Resources section):

```yaml
# REMOVE THIS POLICY STATEMENT:
- Version: '2012-10-17'
  Statement:
    - Effect: Allow
      Action:
        - cloudfront:CreateInvalidation
      Resource:
        - !Sub 'arn:aws:cloudfront::${AWS::AccountId}:distribution/*'
```

#### Step 3: Update Dependencies

**File**: `package.json`

CloudFront client can remain (it's lazy-loaded) but won't be used.

Optional: Remove from dependencies to reduce package size:

```json
{
  "dependencies": {
    "@aws-sdk/client-ssm": "^3.645.0",
    "@aws-sdk/client-s3": "^3.645.0",
    "@aws-sdk/client-sns": "^3.645.0"
    // "@aws-sdk/client-cloudfront": "^3.645.0"  // OPTIONAL: Remove
  }
}
```

#### Step 4: Deploy Updated Configuration

```bash
# Rebuild Lambda package
sam build

# Deploy with updated configuration
sam deploy

# Test manual invocation
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# Verify no CloudFront invalidation in logs
aws logs tail /aws/lambda/aws-data-fetcher --follow
```

#### Step 5: Monitor First Scheduled Run

```bash
# Wait for next scheduled run (2 AM UTC)
# Check CloudWatch logs
aws logs tail /aws/lambda/aws-data-fetcher --since 5m

# Verify S3 files updated
aws s3 ls s3://www.aws-services.synepho.com/data/

# Check public URL (may take 0-5 minutes to update)
curl https://aws-services.synepho.com/data/complete-data.json | jq .metadata.timestamp
```

---

## Rollback Plan

If issues arise, rollback is simple:

1. **Revert Lambda handler** to include invalidation code
2. **Revert SAM template** to include CloudFront permissions
3. **Redeploy**: `sam build && sam deploy`

**Estimated rollback time**: 5 minutes

---

## Alternative: Keep Invalidation (Not Recommended)

If you want immediate cache updates despite the cost:

### Scenarios Where Invalidation Makes Sense

1. **Breaking News**: Time-sensitive content (NOT applicable here)
2. **E-commerce**: Price changes, inventory updates (NOT applicable)
3. **Security**: Critical patches, urgent notices (NOT applicable)
4. **User-Generated Content**: High-visibility posts (NOT applicable)
5. **Real-Time Dashboards**: Live metrics (NOT applicable)

**Our use case**: Daily infrastructure data updates at 2-3 AM → NOT time-sensitive

---

## Questions & Answers

### Q: What if users access data right at 2 AM and get stale content?

**A**: Very unlikely scenario, and if it happens:
- They get data that's 24 hours old (still accurate)
- 5 minutes later, they get fresh data
- AWS infrastructure changes are rare daily

### Q: Can we reduce the TTL to 1 minute instead of 5?

**A**: Yes, but:
- Increases CloudFront costs (more origin requests)
- Increases S3 GET costs
- Provides minimal benefit (1 min vs 5 min is negligible at 2 AM)
- 5 minutes is industry standard for "frequently updated" content

### Q: What about change detection - should that trigger invalidation?

**A**: No, because:
- Change history file has same 5-minute TTL
- Changes are informational, not urgent
- Users don't need real-time change notifications

### Q: Can we invalidate only when changes are detected?

**A**: Possible, but:
- Still costs $0.005 per invalidation
- Adds complexity (conditional logic)
- Doesn't save much cost (changes detected ~15 days/month = $0.075 vs $0.15)
- Not worth the added complexity

---

## Conclusion

**Recommendation**: ✅ **Remove CloudFront invalidation from both Lambda functions**

**Benefits**:
- 91% cost reduction ($3.60/year savings)
- Simpler architecture
- Fewer failure modes
- Standard industry practice
- No meaningful user impact

**Risks**:
- 0-5 minute cache delay during low-traffic hours
- Negligible user impact

**Decision**: Proceed with removal in both functions

---

**Document Status**: ✅ Analysis Complete - Ready for Implementation
**Estimated Implementation Time**: 30 minutes
**Risk Level**: Very Low (easy rollback available)
