# AWS What's New RSS Feed Fetcher - Design Document

**Date**: October 29, 2025
**Version**: 1.0.0 (Design Phase)
**Purpose**: Design a Lambda function to fetch AWS What's New announcements from RSS feed and publish to website

---

## Executive Summary

**Goal**: Create a standalone Lambda function that fetches the latest 20 AWS What's New announcements from the official RSS feed and publishes them to the Synepho website for public consumption.

**Architecture**: Separate Lambda function with EventBridge scheduler, independent of the existing AWS infrastructure data fetcher.

**Performance Target**: <10 seconds execution time (fetching and parsing RSS feed is fast)

**Monthly Cost**: ~$0.01-0.02 (minimal - fetching XML RSS feed is lightweight)

**Key Features**:
- ✅ Fetches latest 20 announcements from AWS What's New RSS feed
- ✅ Parses RSS XML into clean JSON format
- ✅ Publishes to Synepho distribution bucket (CloudFront-backed)
- ✅ Daily automated updates via EventBridge
- ✅ Manual trigger support
- ✅ SNS notifications for success/errors

---

## RSS Feed Analysis

### Source Feed
**URL**: `https://aws.amazon.com/about-aws/whats-new/recent/feed/`

### Feed Structure (RSS 2.0 Format)

```xml
<rss version="2.0">
  <channel>
    <title>AWS What's New</title>
    <link>https://aws.amazon.com/new/</link>
    <description>Recent Announcements</description>
    <lastBuildDate>Wed, 29 Oct 2025 21:09:05 GMT</lastBuildDate>

    <item>
      <guid isPermaLink="false">[hash]</guid>
      <title>AWS announces Amazon Aurora PostgreSQL 17 support</title>
      <description><![CDATA[
        <p>AWS announces support for PostgreSQL 17...</p>
        <p><a href="...">Learn more</a></p>
      ]]></description>
      <pubDate>Wed, 29 Oct 2025 21:09:05 GMT</pubDate>
      <category>databases, amazon-aurora</category>
      <author>aws@amazon.com</author>
      <link>https://aws.amazon.com/about-aws/whats-new/2025/10/...</link>
    </item>

    <!-- More items... -->
  </channel>
</rss>
```

### Key Fields Per Announcement

| Field | Format | Example | Notes |
|-------|--------|---------|-------|
| `guid` | Hash string | `urn:uuid:abc123...` | Unique identifier, not a URL |
| `title` | Plain text | "AWS announces..." | Concise announcement title |
| `description` | HTML (CDATA) | `<p>Content...</p>` | HTML content with links |
| `pubDate` | RFC 2822 | `Wed, 29 Oct 2025 21:09:05 GMT` | Publish date/time |
| `category` | Comma-separated | `compute, ec2` | Service categories/tags |
| `author` | Email | `aws@amazon.com` | Always AWS email |
| `link` | URL | `https://aws.amazon.com/...` | Full announcement URL |

### Feed Characteristics

- **Feed Size**: Typically contains 50 items
- **Update Frequency**: Multiple times per day (as AWS releases announcements)
- **No Pagination**: Single feed with most recent items
- **Date Format**: RFC 2822 (JavaScript-friendly)
- **HTML Content**: Description contains HTML that needs sanitization

---

## Architecture

### Lambda Function Design

```
┌─────────────────────────────────────────────────────────────┐
│                  EventBridge Scheduler                       │
│                    (Daily at 3 AM UTC)                       │
└────────────────────────────┬────────────────────────────────┘
                             │ trigger (daily)
                             ▼
                ┌─────────────────────────────┐
                │   Lambda Function           │
                │ aws-whats-new-fetcher       │
                │ (256MB, 30s timeout)        │
                │                             │
                │  1. Fetch RSS feed (XML)    │
                │  2. Parse XML to JSON       │
                │  3. Extract latest 20 items │
                │  4. Clean HTML content      │
                │  5. Format output JSON      │
                │  6. Save to distribution S3 │
                │  7. Send SNS notification   │
                └─────────────┬───────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
                │ Distribution S3 Bucket       │
                │ www.aws-services.synepho.com │
                │                              │
                │ 📁 data/aws-whats-new.json   │
                │ Cache-Control: max-age=300   │
                └──────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
                │ CloudFront Distribution      │
                │ EBTYLWOK3WVOK                │
                │ TTL: 5 minutes               │
                │                              │
                │ Public URL:                  │
                │ https://aws-services.synepho.com/data/aws-whats-new.json
                │                              │
                │ Cache expires naturally      │
                │ (no manual invalidation)     │
                └──────────────────────────────┘
```

### Why Separate Lambda Function?

**Independent Concerns**:
- Different data source (RSS feed vs SSM Parameter Store)
- Different execution frequency requirements (more frequent updates possible)
- Different performance characteristics (faster, <10s vs 1-2 min)
- Different failure modes (network fetch vs AWS API throttling)

**Isolation Benefits**:
- ✅ Failures don't affect main infrastructure data fetcher
- ✅ Independent scaling and tuning
- ✅ Clearer CloudWatch logs and metrics
- ✅ Simpler debugging and monitoring
- ✅ Can be updated/deployed independently

---

## Output Data Structure

### JSON Schema

```json
{
  "metadata": {
    "timestamp": "2025-10-29T21:09:05.123Z",
    "source": "https://aws.amazon.com/about-aws/whats-new/recent/feed/",
    "feedLastBuildDate": "Wed, 29 Oct 2025 21:09:05 GMT",
    "tool": "aws-whats-new-fetcher",
    "version": "1.0.0",
    "count": 20
  },
  "announcements": [
    {
      "id": "urn:uuid:abc123...",
      "title": "AWS announces Amazon Aurora PostgreSQL 17 support",
      "summary": "AWS announces support for PostgreSQL 17 in Amazon Aurora...",
      "link": "https://aws.amazon.com/about-aws/whats-new/2025/10/...",
      "pubDate": "2025-10-29T21:09:05.000Z",
      "pubDateFormatted": "Oct 29, 2025",
      "categories": ["databases", "amazon-aurora"],
      "htmlContent": "<p>Full HTML description...</p>"
    },
    {
      "id": "urn:uuid:def456...",
      "title": "Amazon EC2 announces new instance types...",
      "summary": "Amazon EC2 announces new instance types...",
      "link": "https://aws.amazon.com/about-aws/whats-new/2025/10/...",
      "pubDate": "2025-10-29T18:30:00.000Z",
      "pubDateFormatted": "Oct 29, 2025",
      "categories": ["compute", "ec2"],
      "htmlContent": "<p>Full HTML description...</p>"
    }
    // ... 18 more items (total: 20)
  ]
}
```

### Field Definitions

| Field | Type | Description | Processing |
|-------|------|-------------|------------|
| `metadata.timestamp` | ISO 8601 | When data was fetched | `new Date().toISOString()` |
| `metadata.source` | String | RSS feed URL | Static value |
| `metadata.feedLastBuildDate` | RFC 2822 | Feed's last build date | From RSS `<lastBuildDate>` |
| `metadata.count` | Number | Number of announcements | Always 20 |
| `id` | String | Unique announcement ID | From RSS `<guid>` |
| `title` | String | Announcement title | From RSS `<title>`, trimmed |
| `summary` | String | Plain text summary | Extract from HTML, truncate to 200 chars |
| `link` | String | Full announcement URL | From RSS `<link>` |
| `pubDate` | ISO 8601 | Publish date (ISO format) | Parse RFC 2822 to ISO |
| `pubDateFormatted` | String | Human-readable date | Format as "Oct 29, 2025" |
| `categories` | Array[String] | Service categories/tags | Split comma-separated, trim |
| `htmlContent` | String | Sanitized HTML content | From RSS `<description>`, sanitize |

### Data Processing Rules

1. **Take Latest 20 Items**: Sort by `pubDate` descending, take first 20
2. **HTML Sanitization**: Strip dangerous HTML (scripts, iframes), keep formatting
3. **Summary Generation**: Extract plain text from HTML, limit to 200 characters
4. **Date Formatting**: Convert RFC 2822 to both ISO 8601 and human-readable
5. **Category Parsing**: Split by comma, trim whitespace, lowercase
6. **Validation**: Ensure all required fields present, skip malformed items

---

## Implementation Plan

### Phase 1: Project Restructuring (Optional but Recommended)

**Rename Existing Handler for Consistency**:

This is optional but recommended before adding the new handler to establish a consistent naming pattern across all Lambda functions.

```bash
# Step 1: Rename existing handler
git mv src/lambda/handler.js src/lambda/infra-data-handler.js

# Step 2: Update SAM template reference
# In template.yaml, change:
#   Handler: src/lambda/handler.handler
# To:
#   Handler: src/lambda/infra-data-handler.handler

# Step 3: Commit the rename
git commit -m "Rename handler.js to infra-data-handler.js for consistency"

# Step 4: Deploy rename (optional - can combine with Phase 2)
sam build && sam deploy
```

**Why Rename?**
- ✅ Establishes consistent naming pattern: `<purpose>-handler.js`
- ✅ Makes purpose immediately clear from filename
- ✅ Professional multi-function project structure
- ✅ Git preserves full file history with `git log --follow`

### Phase 2: Core Lambda Function

**New Files to Create**:

```
nodejs-aws-fetcher/
├── src/
│   ├── lambda/
│   │   ├── infra-data-handler.js      # RENAMED: Infrastructure data fetcher
│   │   └── whats-new-handler.js       # NEW: RSS feed fetcher
│   └── core/
│       ├── aws-data-fetcher.js        # Existing: Infrastructure logic
│       ├── whats-new-fetcher.js       # NEW: RSS parsing logic
│       └── config.js                  # Existing: Configuration
├── template.yaml                      # UPDATE: Add new Lambda function
└── docs/
    ├── AWS_WHATS_NEW_FETCHER_DESIGN.md  # NEW: This document
    └── ... (existing docs)
```

**Note**: If you skip Phase 1 (rename), keep `handler.js` as-is. The new `whats-new-handler.js` will still work perfectly.

### Phase 3: RSS Parsing Module

**Dependencies Needed**:

```json
{
  "xml2js": "^0.6.2",        // XML parsing (lightweight, battle-tested)
  "he": "^1.2.0"            // HTML entity decoding
}
```

**Core Logic** (`src/core/whats-new-fetcher.js`):

```javascript
class WhatsNewFetcher {
  constructor(rssUrl) {
    this.rssUrl = rssUrl;
    this.outputLimit = 20;
  }

  async fetchFeed() {
    // Fetch RSS XML from AWS
    // Add retry logic for network failures
    // Timeout: 5 seconds
  }

  async parseXML(xmlContent) {
    // Parse XML to JavaScript object using xml2js
    // Extract channel metadata
    // Extract all items
  }

  processItems(items) {
    // Sort by pubDate (most recent first)
    // Take first 20 items
    // For each item:
    //   - Parse dates (RFC 2822 → ISO 8601)
    //   - Clean HTML content
    //   - Generate summary
    //   - Parse categories
    //   - Validate required fields
  }

  sanitizeHTML(htmlString) {
    // Remove dangerous tags (script, iframe, object)
    // Keep safe formatting (p, a, br, strong, em)
    // Decode HTML entities
    // Trim whitespace
  }

  generateSummary(htmlContent, maxLength = 200) {
    // Strip HTML tags
    // Decode entities
    // Truncate to maxLength
    // Add ellipsis if truncated
  }

  formatOutput(items, feedMetadata) {
    // Build JSON structure per schema above
    // Include metadata section
    // Include announcements array
  }

  async run() {
    // 1. Fetch RSS feed
    // 2. Parse XML
    // 3. Process items
    // 4. Format output
    // 5. Return JSON object
  }
}
```

### Phase 4: Lambda Handler

**Handler Logic** (`src/lambda/whats-new-handler.js`):

```javascript
exports.handler = async (event, context) => {
  const startTime = Date.now();

  try {
    // 1. Initialize fetcher
    const fetcher = new WhatsNewFetcher(RSS_FEED_URL);

    // 2. Fetch and parse RSS feed
    const data = await fetcher.run();

    // 3. Save to distribution S3 bucket with cache headers
    await saveToS3(data, DISTRIBUTION_BUCKET, 'data/aws-whats-new.json', {
      CacheControl: 'public, max-age=300'  // 5 minutes TTL
    });

    // 4. Send success notification (SNS)
    await sendNotification({
      success: true,
      count: data.announcements.length,
      duration: Date.now() - startTime
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        count: data.announcements.length,
        duration: `${Math.round((Date.now() - startTime) / 1000)}s`
      })
    };

  } catch (error) {
    // Log error
    // Send error notification (SNS)
    // Return error response
  }
};
```

### Phase 5: SAM Template Updates

**Update Existing Function Handler Path** (if renamed in Phase 1):

```yaml
Resources:
  # EXISTING: Update handler path if renamed
  DataFetcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: aws-data-fetcher
      Handler: src/lambda/infra-data-handler.handler  # ← Changed from handler.handler
      Runtime: nodejs20.x
      # ... rest of existing config unchanged
```

**Add New Lambda Function** (in `template.yaml`):

```yaml
Resources:
  # NEW: Lambda Function for AWS What's New
  WhatsNewFetcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: aws-whats-new-fetcher
      CodeUri: ./
      Handler: src/lambda/whats-new-handler.handler
      Runtime: nodejs20.x
      Description: Fetches latest 20 AWS What's New announcements from RSS feed
      Timeout: 30  # 30 seconds (RSS fetch is fast)
      MemorySize: 256  # Lightweight operation
      Environment:
        Variables:
          RSS_FEED_URL: https://aws.amazon.com/about-aws/whats-new/recent/feed/
          OUTPUT_LIMIT: 20
          DISTRIBUTION_BUCKET: !Ref DistributionBucketName
          DISTRIBUTION_KEY_PREFIX: !Ref DistributionKeyPrefix
          CLOUDFRONT_DISTRIBUTION_ID: !Ref CloudFrontDistributionId
          SNS_TOPIC_ARN: !Ref NotificationTopic
          LOG_LEVEL: info
          NODE_ENV: production
      Policies:
        # S3 write access to distribution bucket
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - s3:PutObject
                - s3:PutObjectAcl
              Resource:
                - !Sub 'arn:aws:s3:::${DistributionBucketName}/${DistributionKeyPrefix}/*'
        # SNS publish for notifications
        - SNSPublishMessagePolicy:
            TopicName: !GetAtt NotificationTopic.TopicName
      Events:
        # Daily EventBridge schedule (3 AM UTC - 1 hour after main fetcher)
        DailySchedule:
          Type: Schedule
          Properties:
            Schedule: cron(0 3 * * ? *)
            Description: Daily AWS What's New feed fetch
            Enabled: true
      Tags:
        Project: aws-data-fetcher
        ManagedBy: SAM
        Component: whats-new-fetcher

  # CloudWatch Log Group
  WhatsNewFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub '/aws/lambda/${WhatsNewFetcherFunction}'
      RetentionInDays: 7

  # CloudWatch Alarm - Error detection
  WhatsNewErrorAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: aws-whats-new-fetcher-errors
      AlarmDescription: Alert when What's New fetcher encounters errors
      MetricName: Errors
      Namespace: AWS/Lambda
      Statistic: Sum
      Period: 300
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: FunctionName
          Value: !Ref WhatsNewFetcherFunction
      TreatMissingData: notBreaching
      AlarmActions:
        - !Ref NotificationTopic

Outputs:
  WhatsNewFunctionArn:
    Description: What's New fetcher Lambda function ARN
    Value: !GetAtt WhatsNewFetcherFunction.Arn
    Export:
      Name: !Sub '${AWS::StackName}-WhatsNewFunctionArn'

  WhatsNewDataUrl:
    Description: Public URL for AWS What's New data
    Value: !Sub 'https://${DistributionBucketName}/data/aws-whats-new.json'
```

---

## Data Flow

### Step-by-Step Execution

1. **EventBridge Trigger**: Daily at 3 AM UTC (or manual invocation)

2. **Lambda Invocation**: `aws-whats-new-fetcher` function starts

3. **Fetch RSS Feed**:
   ```javascript
   const response = await fetch(RSS_FEED_URL, { timeout: 5000 });
   const xmlContent = await response.text();
   ```

4. **Parse XML**:
   ```javascript
   const parser = new xml2js.Parser();
   const rssData = await parser.parseStringPromise(xmlContent);
   const items = rssData.rss.channel[0].item;
   ```

5. **Process Items**:
   ```javascript
   const processed = items
     .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
     .slice(0, 20)
     .map(item => ({
       id: item.guid[0]._,
       title: item.title[0],
       summary: generateSummary(item.description[0]),
       link: item.link[0],
       pubDate: new Date(item.pubDate[0]).toISOString(),
       pubDateFormatted: formatDate(item.pubDate[0]),
       categories: item.category[0].split(',').map(c => c.trim()),
       htmlContent: sanitizeHTML(item.description[0])
     }));
   ```

6. **Format Output**:
   ```javascript
   const output = {
     metadata: {
       timestamp: new Date().toISOString(),
       source: RSS_FEED_URL,
       feedLastBuildDate: rssData.rss.channel[0].lastBuildDate[0],
       tool: 'aws-whats-new-fetcher',
       version: '1.0.0',
       count: processed.length
     },
     announcements: processed
   };
   ```

7. **Save to S3**:
   ```javascript
   await s3Client.send(new PutObjectCommand({
     Bucket: DISTRIBUTION_BUCKET,
     Key: 'data/aws-whats-new.json',
     Body: JSON.stringify(output, null, 2),
     ContentType: 'application/json',
     CacheControl: 'public, max-age=300'  // 5 minutes
   }));
   ```

8. **Send Notification**:
   ```javascript
   await snsClient.send(new PublishCommand({
     TopicArn: SNS_TOPIC_ARN,
     Subject: 'AWS What\'s New Fetch Successful',
     Message: `Fetched ${count} announcements in ${duration}s`
   }));
   ```

9. **Return Success**: Lambda completes, CloudWatch logs execution

---

## Error Handling

### Potential Failure Scenarios

| Scenario | Detection | Recovery | Notification |
|----------|-----------|----------|--------------|
| **Network timeout** | Fetch timeout (5s) | Retry 3 times with backoff | SNS error alert |
| **Invalid XML** | XML parse error | Log error, return last known good data | SNS error alert |
| **Malformed items** | Field validation | Skip item, process others | Log warning |
| **Empty feed** | Zero items parsed | Use cached data if available | SNS warning |
| **S3 write failure** | S3 PutObject error | Retry 3 times | SNS error alert |

### Retry Strategy

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { timeout: 5000 });
      if (response.ok) return await response.text();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(1000 * attempt);  // Exponential backoff
    }
  }
}
```

### Fallback Strategy

**Cache Last Known Good Data**:
- Save previous successful fetch to S3
- If new fetch fails, return cached data with metadata flag
- SNS notification indicates fallback mode

---

## Performance Characteristics

### Expected Execution Times

- **RSS Fetch**: ~500-1000ms (network + XML download)
- **XML Parsing**: ~100-200ms (small XML file)
- **Processing**: ~50-100ms (20 items)
- **S3 Upload**: ~200-500ms (small JSON file)
- **SNS Notification**: ~100ms (API call)

**Total**: ~1-2 seconds typical, <3 seconds worst case

### Lambda Configuration

```yaml
Timeout: 30         # 30 seconds (ample buffer, typical: 2s)
MemorySize: 256     # 256MB (minimal memory needed)
```

### Cost Estimate

**Monthly Cost** (daily execution):

```text
Lambda Requests: 30/month × $0.20/million = $0.000006
Lambda Compute: 30 × 2s × (256/1024)GB × $0.0000166667/GB-second = $0.00025
S3 PUT: 30 × $0.005/1000 = $0.00015
SNS: FREE (first 1,000/month)
CloudWatch Logs: ~$0.001

Total: ~$0.002/month (<$0.01/month)
```

**Note**: CloudFront invalidation removed - relies on 5-minute TTL for natural cache expiration. This reduces cost by $0.15/month (99% savings on this function).

---

## Monitoring & Operations

### CloudWatch Metrics to Monitor

1. **Invocations**: Should be 1/day (or as scheduled)
2. **Errors**: Should be 0
3. **Duration**: Should be <5 seconds
4. **Throttles**: Should be 0 (unlikely with this workload)

### CloudWatch Alarms

1. **Error Alarm**: Trigger on any error
2. **Duration Alarm**: Trigger if execution >10 seconds (indicates network issues)

### Manual Invocation

```bash
# Test execution
aws lambda invoke \
  --function-name aws-whats-new-fetcher \
  --cli-binary-format raw-in-base64-out \
  response.json

# View response
cat response.json | jq

# Check output in S3
aws s3 cp s3://www.aws-services.synepho.com/data/aws-whats-new.json - | jq

# View CloudWatch logs
aws logs tail /aws/lambda/aws-whats-new-fetcher --follow
```

---

## Website Integration

### Frontend Consumption

**Public URL**: `https://aws-services.synepho.com/data/aws-whats-new.json`

**Example JavaScript**:

```javascript
async function loadWhatsNew() {
  try {
    const response = await fetch('https://aws-services.synepho.com/data/aws-whats-new.json');
    const data = await response.json();

    // Display announcements
    data.announcements.forEach(announcement => {
      displayAnnouncement({
        title: announcement.title,
        date: announcement.pubDateFormatted,
        summary: announcement.summary,
        link: announcement.link,
        categories: announcement.categories
      });
    });
  } catch (error) {
    console.error('Failed to load AWS What\'s New:', error);
  }
}
```

### React Component Example

```jsx
import React, { useEffect, useState } from 'react';

function WhatsNewFeed() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://aws-services.synepho.com/data/aws-whats-new.json')
      .then(res => res.json())
      .then(data => {
        setAnnouncements(data.announcements);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading announcements:', error);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading AWS announcements...</div>;

  return (
    <div className="whats-new-feed">
      <h2>AWS What's New</h2>
      <p className="feed-meta">
        Last updated: {announcements[0]?.pubDateFormatted}
      </p>
      {announcements.map(item => (
        <article key={item.id} className="announcement-card">
          <h3>{item.title}</h3>
          <p className="date">{item.pubDateFormatted}</p>
          <p className="summary">{item.summary}</p>
          <div className="categories">
            {item.categories.map(cat => (
              <span key={cat} className="badge">{cat}</span>
            ))}
          </div>
          <a href={item.link} target="_blank" rel="noopener noreferrer">
            Read more →
          </a>
        </article>
      ))}
    </div>
  );
}

export default WhatsNewFeed;
```

---

## Security Considerations

### IAM Permissions (Least Privilege)

**Required Permissions**:
- ✅ S3 PutObject (distribution bucket only, specific prefix)
- ✅ SNS Publish (specific topic only)
- ✅ CloudWatch Logs (write logs)

**NOT Required**:
- ❌ CloudFront CreateInvalidation (removed - using natural TTL expiration)
- ❌ SSM Parameter Store access (different from main fetcher)
- ❌ S3 GetObject (no cache reading needed)
- ❌ Other AWS service access

### Content Security

**HTML Sanitization**:
- Strip all `<script>` tags
- Strip `<iframe>`, `<object>`, `<embed>` tags
- Remove inline event handlers (`onclick`, `onerror`, etc.)
- Keep safe formatting: `<p>`, `<a>`, `<strong>`, `<em>`, `<br>`
- Decode HTML entities to prevent XSS

**URL Validation**:
- Verify all links start with `https://aws.amazon.com/`
- Log and skip items with unexpected domains

### Network Security

**Outbound Connections**:
- Only to `https://aws.amazon.com` (RSS feed source)
- No VPC required (public internet access)
- Use HTTPS only (encrypted in transit)

---

## Testing Strategy

### Unit Tests

**Test Cases**:
1. ✅ Parse valid RSS XML
2. ✅ Handle malformed XML gracefully
3. ✅ Extract and sort items by date
4. ✅ Limit output to 20 items
5. ✅ Sanitize HTML content properly
6. ✅ Generate summaries correctly
7. ✅ Parse categories correctly
8. ✅ Format dates correctly (RFC 2822 → ISO 8601)
9. ✅ Handle empty feed
10. ✅ Handle missing fields in items

### Integration Tests

**Test Scenarios**:
1. ✅ Fetch live RSS feed successfully
2. ✅ Parse and save to S3
3. ✅ Verify CloudFront invalidation
4. ✅ Verify SNS notification sent
5. ✅ Handle network timeout gracefully
6. ✅ Handle S3 write failure
7. ✅ Verify output JSON schema

### Manual Testing Checklist

- [ ] Deploy Lambda function
- [ ] Invoke function manually
- [ ] Verify S3 file created
- [ ] Verify JSON structure matches schema
- [ ] Verify all 20 items present
- [ ] Verify dates formatted correctly
- [ ] Verify HTML content sanitized
- [ ] Verify CloudFront URL returns data
- [ ] Verify SNS notification received
- [ ] Check CloudWatch logs for errors
- [ ] Test with website frontend

---

## Deployment Checklist

### Pre-Deployment

- [x] Create design document (this file)
- [x] Review with stakeholders
- [x] Confirm RSS feed URL is stable
- [x] Verify distribution bucket exists
- [x] Remove CloudFront invalidation requirement

### Implementation Phase - Phase 1: Rename (Optional)

- [ ] Rename `handler.js` to `infra-data-handler.js` using `git mv`
- [ ] Update SAM template handler path
- [ ] Commit rename with clear message
- [ ] Test locally (optional)
- [ ] Deploy rename (optional - can combine with Phase 2-5)

### Implementation Phase - Phase 2-5: New RSS Fetcher

- [ ] Install dependencies (`xml2js`, `he`)
- [ ] Create `src/core/whats-new-fetcher.js`
- [ ] Create `src/lambda/whats-new-handler.js`
- [ ] Update `template.yaml` with new function
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test locally with sample RSS data

### Deployment Phase - Combined Deployment

**Option A: Deploy Everything Together (Recommended)**
```bash
# Build both functions
sam build

# Deploy both functions at once
sam deploy

# Verify both functions
aws lambda invoke --function-name aws-data-fetcher response-infra.json
aws lambda invoke --function-name aws-whats-new-fetcher response-whats-new.json
```

**Option B: Deploy in Stages**
```bash
# Stage 1: Deploy renamed handler only
sam build && sam deploy
aws lambda invoke --function-name aws-data-fetcher response.json

# Stage 2: Deploy with new RSS fetcher
sam build && sam deploy
aws lambda invoke --function-name aws-whats-new-fetcher response.json
```

### Verification Checklist

- [ ] Infrastructure data fetcher working (with new handler path)
- [ ] What's New fetcher Lambda function created
- [ ] EventBridge schedule created for What's New fetcher
- [ ] CloudWatch alarms created
- [ ] Test manual invocation of both functions
- [ ] Verify S3 output files for both functions
- [ ] Verify public URLs accessible
- [ ] Verify SNS notifications received for both functions

### Post-Deployment

- [ ] Monitor first scheduled execution
- [ ] Verify daily execution working
- [ ] Integrate with website frontend
- [ ] Document public API endpoint
- [ ] Update main README.md
- [ ] Create user documentation

---

## Future Enhancements

### Phase 2 (Future)

**Advanced Features**:
- ✅ Category filtering (fetch only specific service categories)
- ✅ Historical archive (save all announcements, not just latest 20)
- ✅ Change detection (notify only on new announcements)
- ✅ Multiple output formats (RSS, Atom, JSON Feed)
- ✅ Search API (query announcements by keyword/date/category)

**Performance Optimizations**:
- ✅ Caching with ETag support (avoid re-fetching unchanged data)
- ✅ Incremental updates (fetch only new items since last run)
- ✅ Parallel processing for multiple feeds (AWS, Azure, GCP)

**Website Enhancements**:
- ✅ Real-time updates via WebSocket
- ✅ User preferences (filter by categories)
- ✅ Email digest subscriptions
- ✅ RSS feed generation for users

---

## Summary

### Key Design Decisions

1. **Separate Lambda Function**: Independent of infrastructure data fetcher for isolation
2. **Latest 20 Items**: Balance between freshness and data size
3. **Daily Schedule**: 3 AM UTC (1 hour after main fetcher to stagger load)
4. **CloudFront Distribution**: Same pattern as main infrastructure data
5. **No Manual Cache Invalidation**: Relies on 5-minute TTL for natural cache expiration (simpler, cheaper)
6. **JSON Output**: Clean, structured format for website consumption
7. **HTML Sanitization**: Security-first approach to user-generated content
8. **Minimal Dependencies**: Only essential packages (`xml2js`, `he`)
9. **Fast Execution**: <3 seconds typical, 30s timeout for safety

### Success Criteria

✅ **Functionality**: Successfully fetches and parses AWS What's New RSS feed
✅ **Performance**: Executes in <3 seconds
✅ **Reliability**: Handles errors gracefully with retry logic
✅ **Security**: Sanitizes HTML content, validates URLs
✅ **Cost**: <$0.01/month operational cost (minimal)
✅ **Monitoring**: CloudWatch alarms and SNS notifications
✅ **Integration**: Website can consume JSON data via public URL
✅ **Caching**: 5-minute CloudFront TTL for natural cache expiration

### Next Steps

1. **Review this design document** - ✅ Stakeholder approval complete
2. **Phase 1: Rename handler** (optional) - Establish consistent naming
3. **Phase 2-5: Implementation** - Code the Lambda function and RSS parser
4. **Testing** - Unit tests and integration tests
5. **Deployment** - Deploy to AWS Lambda via SAM (both functions)
6. **Website Integration** - Add React component to display announcements
7. **Documentation** - Update main README and create user guide

### Implementation Order Recommendation

**Recommended Approach** (cleanest):
1. ✅ Complete Phase 1 (rename) in separate commit/deployment
2. ✅ Then implement Phase 2-5 (new RSS fetcher)
3. ✅ Deploy both together or separately

**Alternative Approach** (faster):
1. ⏭️ Skip Phase 1 (keep `handler.js` as-is)
2. ✅ Implement Phase 2-5 (new RSS fetcher)
3. ✅ Deploy both together

Both approaches work perfectly - choose based on your preference for consistency vs. speed.

---

**Document Status**: ✅ Design Complete - Ready for Implementation
**Estimated Implementation Time**: 8-12 hours (includes optional rename in Phase 1)
**Estimated Deployment Time**: 30 minutes (both functions can deploy together)
**Risk Level**: Low (simple RSS parsing, proven patterns)

**Rename Handler Status**: ⏳ Optional - Recommended for consistency but not required
