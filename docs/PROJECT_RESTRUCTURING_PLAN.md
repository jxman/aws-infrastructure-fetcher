# Project Restructuring Plan - Handler Rename & New RSS Fetcher

**Date**: October 29, 2025
**Version**: 1.7.0 → 1.8.0 (future)
**Purpose**: Establish consistent naming for multi-function Lambda project

---

## Overview

This document outlines the plan to:
1. Rename existing handler for consistency (optional but recommended)
2. Add new AWS What's New RSS feed fetcher
3. Establish naming pattern for future Lambda functions

---

## Current vs. Proposed Structure

### Current Structure (v1.7.0)

```
nodejs-aws-fetcher/
├── src/
│   ├── lambda/
│   │   └── handler.js                 # Infrastructure data fetcher
│   └── core/
│       ├── aws-data-fetcher.js        # Infrastructure logic
│       └── config.js
└── template.yaml
```

### Proposed Structure (v1.8.0)

```
nodejs-aws-fetcher/
├── src/
│   ├── lambda/
│   │   ├── infra-data-handler.js      # RENAMED: Infrastructure data fetcher
│   │   └── whats-new-handler.js       # NEW: RSS feed fetcher
│   └── core/
│       ├── aws-data-fetcher.js        # Infrastructure logic
│       ├── whats-new-fetcher.js       # NEW: RSS parsing logic
│       └── config.js
└── template.yaml                      # UPDATED: Both Lambda functions
```

---

## Why Rename?

### Benefits of Consistent Naming

1. **Professional Structure**
   - Clear purpose from filename
   - Consistent `<purpose>-handler.js` pattern
   - Ready for future growth (more handlers)

2. **Better Organization**
   - Easy to find specific handler
   - No confusion about "main" vs "secondary" functions
   - Self-documenting codebase

3. **Team-Friendly**
   - New developers understand immediately
   - No need to check file contents to know purpose
   - Scales well as project grows

### Pattern Established

```
src/lambda/
├── <purpose>-handler.js       # Pattern for all handlers
├── <purpose>-handler.js       # Descriptive, clear names
└── <purpose>-handler.js       # Easy to maintain
```

**Examples**:
- `infra-data-handler.js` - Infrastructure data fetcher
- `whats-new-handler.js` - What's New RSS fetcher
- `pricing-handler.js` - Future: Pricing data fetcher
- `blog-posts-handler.js` - Future: Blog posts fetcher

---

## Implementation Options

### Option 1: Rename First, Then Add New Handler (Recommended)

**Why**: Cleanest approach, separate concerns

**Steps**:
```bash
# 1. Rename existing handler
git mv src/lambda/handler.js src/lambda/infra-data-handler.js
git commit -m "Rename handler.js to infra-data-handler.js for consistency"

# 2. Update SAM template
# Edit template.yaml:
#   Handler: src/lambda/handler.handler
#   → Handler: src/lambda/infra-data-handler.handler

# 3. Deploy rename
sam build && sam deploy

# 4. Verify existing function still works
aws lambda invoke --function-name aws-data-fetcher response.json

# 5. Then implement new RSS fetcher (separate PR/commit)
```

**Benefits**:
- ✅ Two clean commits with clear purposes
- ✅ Easy to revert if issues arise
- ✅ Can test rename independently
- ✅ Clear git history

**Timeline**: 10 minutes for rename, then proceed with RSS fetcher

### Option 2: Rename and Add Together (Faster)

**Why**: Less deployment cycles, get everything done at once

**Steps**:
```bash
# 1. Rename existing handler
git mv src/lambda/handler.js src/lambda/infra-data-handler.js

# 2. Create new RSS fetcher files
# Create: src/core/whats-new-fetcher.js
# Create: src/lambda/whats-new-handler.js

# 3. Update SAM template for both
# Edit template.yaml:
#   - Update existing Handler path
#   - Add new Lambda function

# 4. Commit everything together
git add .
git commit -m "Rename handler for consistency and add What's New RSS fetcher"

# 5. Deploy both
sam build && sam deploy

# 6. Verify both functions work
aws lambda invoke --function-name aws-data-fetcher response-infra.json
aws lambda invoke --function-name aws-whats-new-fetcher response-whats-new.json
```

**Benefits**:
- ✅ Single deployment cycle
- ✅ Faster overall implementation
- ✅ Both changes tested together

**Drawbacks**:
- ⚠️ Larger changeset to review
- ⚠️ Harder to isolate issues if problems arise

**Timeline**: 8-12 hours total (combined)

### Option 3: Skip Rename (Fastest)

**Why**: Minimal changes, get RSS fetcher working ASAP

**Steps**:
```bash
# 1. Keep handler.js as-is

# 2. Create new RSS fetcher files
# Create: src/core/whats-new-fetcher.js
# Create: src/lambda/whats-new-handler.js

# 3. Update SAM template
# Add new Lambda function only

# 4. Deploy
sam build && sam deploy
```

**Benefits**:
- ✅ Fastest implementation
- ✅ Minimal risk to existing function
- ✅ No SAM template changes to existing function

**Drawbacks**:
- ⚠️ Inconsistent naming (`handler.js` vs `whats-new-handler.js`)
- ⚠️ Can rename later, but adds another deployment

**Timeline**: 8-12 hours (just RSS fetcher)

---

## Recommendation

### ✅ Choose Option 1: Rename First, Then Add

**Rationale**:
1. **You're already at v1.7.0** - perfect time for housekeeping
2. **Separate concerns** - easier to troubleshoot if issues arise
3. **Clean git history** - clear commits with single purposes
4. **Low risk** - rename is simple, deploy takes 5 minutes
5. **Sets precedent** - establishes pattern for future handlers

**Timeline**:
- **Phase 1 (Rename)**: 10 minutes
  - Rename file: 1 minute
  - Update SAM template: 2 minutes
  - Deploy and test: 5 minutes
  - Commit: 2 minutes

- **Phase 2 (RSS Fetcher)**: 8-12 hours
  - Implementation: 6-8 hours
  - Testing: 1-2 hours
  - Deployment: 30 minutes
  - Documentation: 1-2 hours

**Total**: ~10 minutes + 8-12 hours

---

## SAM Template Changes

### Phase 1: Update Existing Function Handler Path

```yaml
Resources:
  DataFetcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: aws-data-fetcher
      # CHANGE THIS LINE:
      Handler: src/lambda/infra-data-handler.handler  # ← Changed from handler.handler
      Runtime: nodejs20.x
      Timeout: 180
      MemorySize: 512
      # ... rest unchanged
```

### Phase 2: Add New RSS Fetcher Function

```yaml
Resources:
  # Existing function (with updated handler path)
  DataFetcherFunction:
    # ... (see above)

  # NEW: What's New RSS Fetcher
  WhatsNewFetcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: aws-whats-new-fetcher
      Handler: src/lambda/whats-new-handler.handler
      Runtime: nodejs20.x
      Timeout: 30
      MemorySize: 256
      Environment:
        Variables:
          RSS_FEED_URL: https://aws.amazon.com/about-aws/whats-new/recent/feed/
          OUTPUT_LIMIT: 20
          DISTRIBUTION_BUCKET: !Ref DistributionBucketName
          DISTRIBUTION_PREFIX: !Ref DistributionKeyPrefix
          SNS_TOPIC_ARN: !Ref NotificationTopic
      # ... rest of config
```

---

## Git Strategy

### Recommended Commit Flow

**Commit 1: Rename handler**
```bash
git mv src/lambda/handler.js src/lambda/infra-data-handler.js
# Update template.yaml handler path
git add template.yaml
git commit -m "Rename handler.js to infra-data-handler.js for consistency

- Establishes <purpose>-handler.js naming pattern
- Prepares project for multi-function architecture
- No functional changes, just file rename"
```

**Commit 2: Add RSS fetcher**
```bash
# Create new files
# Update template.yaml with new function
git add src/core/whats-new-fetcher.js
git add src/lambda/whats-new-handler.js
git add template.yaml
git commit -m "Add AWS What's New RSS feed fetcher

- Fetches latest 20 announcements from official RSS feed
- Daily schedule at 3 AM UTC
- Publishes to distribution bucket
- No CloudFront invalidation (uses natural TTL)
- See docs/AWS_WHATS_NEW_FETCHER_DESIGN.md for details"
```

### Git History Preservation

**Viewing history after rename**:
```bash
# See full history including pre-rename commits
git log --follow src/lambda/infra-data-handler.js

# Compare rename with previous version
git log -p --follow src/lambda/infra-data-handler.js

# See when file was renamed
git log --all --full-history -- src/lambda/handler.js
```

Git's `--follow` flag automatically tracks file renames!

---

## Testing Strategy

### Phase 1: Test Rename

```bash
# 1. Deploy rename
sam build && sam deploy

# 2. Invoke function
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# 3. Verify success
cat response.json | jq .statusCode  # Should be 200

# 4. Check CloudWatch logs
aws logs tail /aws/lambda/aws-data-fetcher --since 5m

# 5. Verify public URLs still work
curl https://aws-services.synepho.com/data/complete-data.json | jq .metadata
```

**Expected**: Everything works exactly as before, just different handler filename.

### Phase 2: Test Both Functions

```bash
# 1. Deploy both functions
sam build && sam deploy

# 2. Test infrastructure fetcher
aws lambda invoke \
  --function-name aws-data-fetcher \
  --payload '{"includeServiceMapping":true}' \
  response-infra.json

# 3. Test What's New fetcher
aws lambda invoke \
  --function-name aws-whats-new-fetcher \
  response-whats-new.json

# 4. Verify both outputs
cat response-infra.json | jq .result.regions
cat response-whats-new.json | jq .result.count

# 5. Check both public URLs
curl https://aws-services.synepho.com/data/complete-data.json | jq
curl https://aws-services.synepho.com/data/aws-whats-new.json | jq
```

---

## Rollback Plan

### If Rename Causes Issues

```bash
# 1. Revert commit
git revert HEAD

# 2. Redeploy
sam build && sam deploy

# 3. Verify
aws lambda invoke --function-name aws-data-fetcher response.json
```

**Time to rollback**: 5 minutes

### If Both Changes Cause Issues

```bash
# 1. Revert both commits
git revert HEAD~1..HEAD

# 2. Redeploy
sam build && sam deploy

# 3. Verify original function works
aws lambda invoke --function-name aws-data-fetcher response.json
```

**Time to rollback**: 5 minutes

---

## Cost Impact

### Phase 1: Rename Only
**Additional Cost**: $0 (same function, different filename)

### Phase 2: Add RSS Fetcher
**Additional Cost**: <$0.01/month
- Lambda: $0.0003/month
- S3: $0.0002/month
- CloudWatch Logs: $0.001/month

**Total Project Cost** (both functions):
- Infrastructure Fetcher: $0.026/month (after CloudFront removal)
- What's New Fetcher: <$0.01/month
- **Total**: ~$0.03/month ($0.36/year)

---

## Success Criteria

### Phase 1: Rename Success
- ✅ Lambda function invokes successfully
- ✅ Same output as before
- ✅ No errors in CloudWatch logs
- ✅ Public URLs still accessible
- ✅ SNS notifications working

### Phase 2: RSS Fetcher Success
- ✅ Both Lambda functions work independently
- ✅ Infrastructure data updates as expected
- ✅ What's New data fetched correctly (20 items)
- ✅ Both public URLs accessible
- ✅ Both SNS notifications working
- ✅ CloudWatch logs show no errors

---

## Timeline Summary

### Recommended Timeline (Option 1)

**Day 1: Rename Handler (10 minutes)**
- Rename file
- Update SAM template
- Deploy and test
- Commit changes

**Day 2-3: Implement RSS Fetcher (8-12 hours)**
- Create RSS parsing logic
- Create Lambda handler
- Update SAM template
- Write tests
- Deploy and verify

**Total**: 10 minutes + 8-12 hours

---

## Questions & Answers

### Q: Will renaming break anything?

**A**: No. As long as you update the SAM template `Handler` path, everything works identically. Git preserves full history with `--follow`.

### Q: Can I skip the rename?

**A**: Yes, absolutely! The RSS fetcher works perfectly without renaming. But renaming establishes a better long-term pattern.

### Q: What if I want to rename later?

**A**: You can rename anytime. It's just another `git mv` + SAM template update + deployment. Takes 10 minutes.

### Q: Should both functions share code?

**A**: Yes! The `src/storage/` and `src/core/config.js` modules are shared. Each function has its own handler and business logic but shares infrastructure.

---

## Next Actions

### Immediate (Choose One)

**Option A: Start with rename**
```bash
git mv src/lambda/handler.js src/lambda/infra-data-handler.js
# Edit template.yaml
sam build && sam deploy
```

**Option B: Skip rename, implement RSS fetcher directly**
```bash
# Start implementing RSS fetcher
# Keep handler.js as-is
```

### After Rename (If Option A)

1. Verify existing function works
2. Proceed with RSS fetcher implementation per design document
3. Deploy both together

---

**Document Status**: ✅ Plan Complete - Ready for Decision
**Recommended Option**: Option 1 (Rename first, then add RSS fetcher)
**Risk Level**: Very Low (rename is simple, easy rollback)
**Time Investment**: 10 minutes (rename) + 8-12 hours (RSS fetcher)
