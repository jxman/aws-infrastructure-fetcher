# AWS Infrastructure Change Tracking Design

## Overview

A simple, maintainable JSON-based solution to track **when new AWS regions, services, and regional service availability first appear** in your daily data fetches.

## Design Goals

✅ **Simple JSON format** - Easy to read, version control, and query
✅ **Date-based tracking** - Track first appearance by date (YYYY-MM-DD), not time
✅ **Three change types** - New regions, new services, new regional service availability
✅ **Low maintenance** - Automatic updates on each daily run
✅ **Historical record** - Never delete entries, only add new ones
✅ **Git-friendly** - Diff-able format for easy change review

## Proposed File Structure

```
output/
├── complete-data.json           # Current snapshot (existing)
├── change-history.json          # NEW: Master change tracking file
└── .previous-snapshot.json      # NEW: Previous run snapshot (for comparison)
```

### File Purposes

| File | Purpose | Retention |
|------|---------|-----------|
| `complete-data.json` | Latest data from current run | Overwritten each run |
| `change-history.json` | Cumulative history of all changes | Permanent, append-only |
| `.previous-snapshot.json` | Snapshot from last successful run | Overwritten each run |

## change-history.json Schema

### Complete Structure

```json
{
  "metadata": {
    "created": "2025-10-23",
    "lastUpdated": "2025-10-23",
    "totalRegions": 38,
    "totalServices": 394,
    "totalRegionalServices": 8646,
    "changesSinceInception": {
      "newRegions": 5,
      "newServices": 12,
      "newRegionalServices": 234
    }
  },
  "regions": {
    "us-east-1": {
      "name": "US East (N. Virginia)",
      "firstSeen": "2025-10-10",
      "availabilityZones": 6,
      "launchDate": "2006-08-25"
    },
    "ap-east-2": {
      "name": "Asia Pacific (Taipei)",
      "firstSeen": "2025-10-20",
      "availabilityZones": 3,
      "launchDate": "2025-06-06",
      "isNew": true
    }
  },
  "services": {
    "ec2": {
      "name": "Amazon Elastic Compute Cloud (EC2)",
      "firstSeen": "2025-10-10"
    },
    "bedrock-data-automation": {
      "name": "Amazon Bedrock Data Automation",
      "firstSeen": "2025-10-23",
      "isNew": true
    }
  },
  "regionalServices": {
    "us-east-1": {
      "ec2": "2025-10-10",
      "s3": "2025-10-10",
      "bedrock": "2025-10-15"
    },
    "ap-east-2": {
      "ec2": "2025-10-20",
      "s3": "2025-10-20",
      "lambda": "2025-10-20"
    }
  },
  "changeLog": [
    {
      "date": "2025-10-23",
      "changes": {
        "newRegions": [],
        "newServices": [
          {
            "code": "bedrock-data-automation",
            "name": "Amazon Bedrock Data Automation"
          }
        ],
        "newRegionalServices": [
          {
            "region": "us-east-1",
            "service": "bedrock-data-automation"
          },
          {
            "region": "eu-west-1",
            "service": "bedrock-data-automation"
          }
        ]
      },
      "summary": "Added 1 new service, 2 new regional service mappings"
    },
    {
      "date": "2025-10-20",
      "changes": {
        "newRegions": [
          {
            "code": "ap-east-2",
            "name": "Asia Pacific (Taipei)"
          }
        ],
        "newServices": [],
        "newRegionalServices": [
          {
            "region": "ap-east-2",
            "service": "ec2"
          },
          {
            "region": "ap-east-2",
            "service": "s3"
          }
        ]
      },
      "summary": "Added 1 new region with 2 services"
    }
  ]
}
```

### Schema Field Descriptions

#### metadata

- **created**: Date when change tracking was first initialized (YYYY-MM-DD)
- **lastUpdated**: Date of most recent update (YYYY-MM-DD)
- **totalRegions**: Current count of all AWS regions
- **totalServices**: Current count of all AWS services
- **totalRegionalServices**: Total count of all service-region mappings
- **changesSinceInception**: Cumulative statistics since tracking began

#### regions

Object keyed by region code, each containing:

- **name**: Official AWS region name
- **firstSeen**: Date when region was first detected (YYYY-MM-DD)
- **availabilityZones**: Number of AZs in the region
- **launchDate**: Official AWS launch date (YYYY-MM-DD)
- **isNew**: Boolean flag (true if firstSeen < 30 days ago)

#### services

Object keyed by service code, each containing:

- **name**: Official AWS service name
- **firstSeen**: Date when service was first detected (YYYY-MM-DD)
- **isNew**: Boolean flag (true if firstSeen < 30 days ago)

#### regionalServices

Nested object structure: `{ regionCode: { serviceCode: firstSeenDate } }`

Tracks when each service became available in each region.

#### changeLog

Array of daily change entries, ordered by date (newest first):

- **date**: Date of the change detection (YYYY-MM-DD)
- **changes.newRegions**: Array of new regions detected
- **changes.newServices**: Array of new services detected
- **changes.newRegionalServices**: Array of new service-region mappings
- **summary**: Human-readable summary of changes

## Change Detection Algorithm

### Comparison Logic

```
For each daily run:

1. Load previous snapshot (.previous-snapshot.json)
2. Load current data (complete-data.json)
3. Load change history (change-history.json)

4. Detect New Regions:
   - Compare current regions vs previous regions
   - New = exists in current, not in previous

5. Detect New Services:
   - Compare current services vs previous services
   - New = exists in current, not in previous

6. Detect New Regional Services:
   - For each region:
     - Compare current services vs previous services
     - New = service exists in current region, not in previous

7. Update change-history.json:
   - Add firstSeen date for new items
   - Append to changeLog array
   - Update metadata counters

8. Save current snapshot as .previous-snapshot.json
```

### Pseudocode

```javascript
async function detectAndTrackChanges() {
  const currentData = loadCurrentData();
  const previousData = loadPreviousSnapshot();
  const changeHistory = loadChangeHistory();

  const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Detect changes
  const newRegions = findNewItems(
    currentData.regions.regions,
    previousData?.regions?.regions || [],
    'code'
  );

  const newServices = findNewItems(
    currentData.services.services,
    previousData?.services?.services || [],
    'code'
  );

  const newRegionalServices = detectNewRegionalServices(
    currentData.servicesByRegion?.byRegion || {},
    previousData?.servicesByRegion?.byRegion || {}
  );

  // Update change history
  if (newRegions.length > 0) {
    newRegions.forEach(region => {
      changeHistory.regions[region.code] = {
        name: region.name,
        firstSeen: todayDate,
        availabilityZones: region.availabilityZones,
        launchDate: formatDate(region.launchDate),
        isNew: true
      };
    });
  }

  if (newServices.length > 0) {
    newServices.forEach(service => {
      changeHistory.services[service.code] = {
        name: service.name,
        firstSeen: todayDate,
        isNew: true
      };
    });
  }

  if (newRegionalServices.length > 0) {
    newRegionalServices.forEach(({ region, service }) => {
      if (!changeHistory.regionalServices[region]) {
        changeHistory.regionalServices[region] = {};
      }
      changeHistory.regionalServices[region][service] = todayDate;
    });
  }

  // Add to changelog if there are changes
  if (newRegions.length > 0 || newServices.length > 0 || newRegionalServices.length > 0) {
    changeHistory.changeLog.unshift({
      date: todayDate,
      changes: {
        newRegions: newRegions.map(r => ({ code: r.code, name: r.name })),
        newServices: newServices.map(s => ({ code: s.code, name: s.name })),
        newRegionalServices: newRegionalServices
      },
      summary: generateSummary(newRegions, newServices, newRegionalServices)
    });
  }

  // Update metadata
  changeHistory.metadata.lastUpdated = todayDate;
  changeHistory.metadata.totalRegions = currentData.regions.count;
  changeHistory.metadata.totalServices = currentData.services.count;

  // Save files
  saveChangeHistory(changeHistory);
  savePreviousSnapshot(currentData);

  return {
    newRegions,
    newServices,
    newRegionalServices
  };
}
```

## Example Change Detection Scenarios

### Scenario 1: New Region Added

**Date:** 2025-11-15
**Change:** AWS launches `me-west-1` (Middle East - Tel Aviv)

**Updates to change-history.json:**

```json
{
  "regions": {
    "me-west-1": {
      "name": "Middle East (Tel Aviv)",
      "firstSeen": "2025-11-15",
      "availabilityZones": 3,
      "launchDate": "2025-11-15",
      "isNew": true
    }
  },
  "regionalServices": {
    "me-west-1": {
      "ec2": "2025-11-15",
      "s3": "2025-11-15",
      "lambda": "2025-11-15"
    }
  },
  "changeLog": [
    {
      "date": "2025-11-15",
      "changes": {
        "newRegions": [
          {
            "code": "me-west-1",
            "name": "Middle East (Tel Aviv)",
            "initialServiceCount": 245
          }
        ],
        "newServices": [],
        "newRegionalServices": [
          { "region": "me-west-1", "service": "ec2" },
          { "region": "me-west-1", "service": "s3" }
        ]
      },
      "summary": "Added 1 new region (me-west-1) with 245 services"
    }
  ]
}
```

### Scenario 2: New Service Launched Globally

**Date:** 2025-12-01
**Change:** AWS launches new service `quantum-computing`

**Updates to change-history.json:**

```json
{
  "services": {
    "quantum-computing": {
      "name": "AWS Quantum Computing Service",
      "firstSeen": "2025-12-01",
      "isNew": true
    }
  },
  "regionalServices": {
    "us-east-1": {
      "quantum-computing": "2025-12-01"
    },
    "us-west-2": {
      "quantum-computing": "2025-12-01"
    }
  },
  "changeLog": [
    {
      "date": "2025-12-01",
      "changes": {
        "newRegions": [],
        "newServices": [
          {
            "code": "quantum-computing",
            "name": "AWS Quantum Computing Service",
            "availableInRegions": 12
          }
        ],
        "newRegionalServices": [
          { "region": "us-east-1", "service": "quantum-computing" },
          { "region": "us-west-2", "service": "quantum-computing" }
        ]
      },
      "summary": "Added 1 new service available in 12 regions"
    }
  ]
}
```

### Scenario 3: Service Expansion to Existing Region

**Date:** 2025-12-10
**Change:** `bedrock` becomes available in `ap-southeast-3` (Jakarta)

**Updates to change-history.json:**

```json
{
  "regionalServices": {
    "ap-southeast-3": {
      "bedrock": "2025-12-10"
    }
  },
  "changeLog": [
    {
      "date": "2025-12-10",
      "changes": {
        "newRegions": [],
        "newServices": [],
        "newRegionalServices": [
          {
            "region": "ap-southeast-3",
            "regionName": "Asia Pacific (Jakarta)",
            "service": "bedrock",
            "serviceName": "Amazon Bedrock"
          }
        ]
      },
      "summary": "Added 1 service to existing regions"
    }
  ]
}
```

## Query Use Cases

### Use Case 1: What's new in the last 30 days?

```javascript
// Filter changeLog entries from last 30 days
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const recentChanges = changeHistory.changeLog.filter(entry => {
  return new Date(entry.date) >= thirtyDaysAgo;
});

// Alternative: Use isNew flag (auto-set for items < 30 days old)
const newRegions = Object.entries(changeHistory.regions)
  .filter(([code, data]) => data.isNew)
  .map(([code, data]) => ({ code, ...data }));
```

**Output:**

```json
{
  "last30Days": {
    "newRegions": 1,
    "newServices": 3,
    "newRegionalServices": 45,
    "details": [
      {
        "date": "2025-11-15",
        "summary": "Added 1 new region (me-west-1) with 245 services"
      }
    ]
  }
}
```

### Use Case 2: When did bedrock launch in each region?

```javascript
const bedrockHistory = {};

Object.entries(changeHistory.regionalServices).forEach(([region, services]) => {
  if (services.bedrock) {
    bedrockHistory[region] = {
      regionName: changeHistory.regions[region].name,
      firstSeen: services.bedrock
    };
  }
});
```

**Output:**

```json
{
  "us-east-1": {
    "regionName": "US East (N. Virginia)",
    "firstSeen": "2025-10-15"
  },
  "us-west-2": {
    "regionName": "US West (Oregon)",
    "firstSeen": "2025-10-15"
  },
  "ap-southeast-3": {
    "regionName": "Asia Pacific (Jakarta)",
    "firstSeen": "2025-12-10"
  }
}
```

### Use Case 3: Which regions were added this year?

```javascript
const currentYear = new Date().getFullYear();

const newRegionsThisYear = Object.entries(changeHistory.regions)
  .filter(([code, data]) => {
    return data.firstSeen.startsWith(currentYear.toString());
  })
  .map(([code, data]) => ({
    code,
    name: data.name,
    firstSeen: data.firstSeen,
    availabilityZones: data.availabilityZones
  }));
```

**Output:**

```json
[
  {
    "code": "ap-east-2",
    "name": "Asia Pacific (Taipei)",
    "firstSeen": "2025-10-20",
    "availabilityZones": 3
  },
  {
    "code": "me-west-1",
    "name": "Middle East (Tel Aviv)",
    "firstSeen": "2025-11-15",
    "availabilityZones": 3
  }
]
```

### Use Case 4: Generate Service Expansion Report

```javascript
// Find which services expanded to the most regions in the last 90 days
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
const cutoffDate = ninetyDaysAgo.toISOString().split('T')[0];

const serviceExpansions = {};

Object.entries(changeHistory.regionalServices).forEach(([region, services]) => {
  Object.entries(services).forEach(([service, firstSeen]) => {
    if (firstSeen >= cutoffDate) {
      if (!serviceExpansions[service]) {
        serviceExpansions[service] = {
          serviceName: changeHistory.services[service]?.name || service,
          regions: []
        };
      }
      serviceExpansions[service].regions.push({
        region,
        regionName: changeHistory.regions[region]?.name || region,
        firstSeen
      });
    }
  });
});

// Sort by number of new regions
const sortedExpansions = Object.entries(serviceExpansions)
  .map(([code, data]) => ({
    service: code,
    ...data,
    expansionCount: data.regions.length
  }))
  .sort((a, b) => b.expansionCount - a.expansionCount);
```

**Output:**

```json
[
  {
    "service": "bedrock",
    "serviceName": "Amazon Bedrock",
    "expansionCount": 8,
    "regions": [
      {
        "region": "ap-southeast-3",
        "regionName": "Asia Pacific (Jakarta)",
        "firstSeen": "2025-12-10"
      },
      {
        "region": "eu-central-2",
        "regionName": "Europe (Zurich)",
        "firstSeen": "2025-12-08"
      }
    ]
  }
]
```

## Dashboard/Reporting Ideas

### Monthly Change Summary Report

```json
{
  "month": "2025-11",
  "summary": {
    "newRegions": 2,
    "newServices": 5,
    "newRegionalServices": 127,
    "totalRegions": 40,
    "totalServices": 399,
    "growthRate": {
      "regions": "5.3%",
      "services": "1.3%"
    }
  },
  "highlights": [
    "New region: me-west-1 (Middle East - Tel Aviv)",
    "New region: ap-southeast-7 (Asia Pacific - Thailand)",
    "New service: quantum-computing (available in 12 regions)",
    "bedrock expanded to 8 additional regions"
  ],
  "topExpansions": [
    {
      "service": "bedrock",
      "newRegions": 8
    },
    {
      "service": "sagemaker",
      "newRegions": 5
    }
  ]
}
```

### Year-End Summary Report

```json
{
  "year": 2025,
  "summary": {
    "regionsAdded": 4,
    "servicesAdded": 28,
    "regionalServicesAdded": 1247,
    "startOfYear": {
      "regions": 36,
      "services": 366
    },
    "endOfYear": {
      "regions": 40,
      "services": 394
    }
  },
  "majorMilestones": [
    {
      "date": "2025-06-06",
      "event": "Asia Pacific (Taipei) region launch"
    },
    {
      "date": "2025-11-15",
      "event": "Middle East (Tel Aviv) region launch"
    },
    {
      "date": "2025-10-15",
      "event": "Amazon Bedrock major expansion (15 regions)"
    }
  ],
  "fastestGrowingServices": [
    {
      "service": "bedrock",
      "regionExpansion": 15
    },
    {
      "service": "sagemaker",
      "regionExpansion": 12
    }
  ]
}
```

## Implementation Workflow

### Daily Execution Flow

```
┌─────────────────────┐
│  Daily Lambda/CLI   │
│   Execution Start   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Fetch Current Data │
│   from SSM/AWS      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Load Previous       │
│ Snapshot (if exists)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Compare & Detect    │
│     Changes         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Update              │
│ change-history.json │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Save Current Data   │
│ as Previous Snapshot│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Generate Summary    │
│    (optional)       │
└─────────────────────┘
```

### Integration Points

#### CLI Mode

```javascript
// In src/core/aws-data-fetcher.js - run() method
async run(options = {}) {
  // ... existing code ...

  // NEW: After saving complete-data.json
  if (!options.regionsOnly && !options.servicesOnly) {
    const changeTracker = new ChangeTracker(this.outputDir);
    const changes = await changeTracker.detectAndTrackChanges(results);

    if (changes.hasChanges) {
      console.log(chalk.bold.yellow('\n=== CHANGES DETECTED ==='));
      console.log(chalk.white(`📍 New Regions: ${changes.newRegions.length}`));
      console.log(chalk.white(`🛠️  New Services: ${changes.newServices.length}`));
      console.log(chalk.white(`🗺️  New Regional Services: ${changes.newRegionalServices.length}`));
    } else {
      console.log(chalk.gray('\n✅ No changes detected since last run'));
    }
  }

  // ... existing code ...
}
```

#### Lambda Mode

```javascript
// In src/lambda/handler.js
exports.handler = async (event) => {
  // ... existing code ...

  // NEW: After data fetch completes
  const changeTracker = new ChangeTracker();
  const changes = await changeTracker.detectAndTrackChanges(result);

  // Include in SNS notification
  if (changes.hasChanges) {
    notificationMessage += '\n\n=== Changes Detected ===\n';
    notificationMessage += `New Regions: ${changes.newRegions.length}\n`;
    notificationMessage += `New Services: ${changes.newServices.length}\n`;
    notificationMessage += `New Regional Services: ${changes.newRegionalServices.length}\n`;
  }

  // ... existing code ...
};
```

## Storage Considerations

### File Sizes (Estimates)

| File | Estimated Size | Growth Rate |
|------|---------------|-------------|
| `change-history.json` | ~500 KB initial | ~10-50 KB/year |
| `.previous-snapshot.json` | ~400 KB | No growth (overwritten) |
| `complete-data.json` | ~400 KB | Stable |

### Git Storage

- **Initial commit:** ~1.3 MB
- **Annual growth:** ~50-100 KB (only changeLog grows)
- **5-year projection:** ~1.5 MB total

**Git-friendly format:**

- Structured JSON with consistent key ordering
- Easy to review diffs in pull requests
- Meaningful commit messages: "Daily update: 2 new services detected"

### S3 Storage (Lambda Mode)

```
s3://your-bucket/
├── aws-data/
│   ├── complete-data.json           (current)
│   ├── change-history.json          (cumulative)
│   └── .previous-snapshot.json      (previous run)
└── history/                          (optional archives)
    ├── complete-data-2025-10-23.json
    └── complete-data-2025-10-24.json
```

## Advanced Features (Optional)

### 1. Change Categories

```json
{
  "changeCategories": {
    "majorRegionLaunch": {
      "threshold": "newRegion",
      "notification": "high",
      "examples": ["me-west-1", "ap-east-2"]
    },
    "serviceExpansion": {
      "threshold": "> 10 new regional services",
      "notification": "medium",
      "examples": ["bedrock expansion"]
    },
    "minorUpdate": {
      "threshold": "< 5 new regional services",
      "notification": "low"
    }
  }
}
```

### 2. Service Deprecation Tracking

```json
{
  "deprecatedServices": {
    "codecommit": {
      "lastSeen": "2025-11-01",
      "deprecatedDate": "2025-11-01",
      "reason": "Service discontinued by AWS",
      "replacementService": "github"
    }
  },
  "deprecatedRegionalServices": {
    "us-west-1": {
      "ml": {
        "lastSeen": "2025-09-15",
        "reason": "Service consolidated into sagemaker"
      }
    }
  }
}
```

### 3. Historical Trends

```json
{
  "trends": {
    "regionGrowth": [
      { "year": 2023, "count": 32 },
      { "year": 2024, "count": 36 },
      { "year": 2025, "count": 40 }
    ],
    "serviceGrowth": [
      { "year": 2023, "count": 350 },
      { "year": 2024, "count": 380 },
      { "year": 2025, "count": 394 }
    ],
    "averageServicesPerRegion": [
      { "year": 2023, "average": 215 },
      { "year": 2024, "average": 225 },
      { "year": 2025, "average": 228 }
    ]
  }
}
```

### 4. Notification Thresholds

```json
{
  "notificationRules": {
    "newRegion": {
      "enabled": true,
      "priority": "high",
      "emailSubject": "🚨 New AWS Region Detected: {regionName}"
    },
    "newService": {
      "enabled": true,
      "priority": "medium",
      "emailSubject": "🆕 New AWS Service: {serviceName}"
    },
    "serviceExpansion": {
      "enabled": true,
      "threshold": 5,
      "priority": "medium",
      "emailSubject": "📈 Service Expansion: {serviceName} in {count} regions"
    }
  }
}
```

## Recommended Implementation Approach

### Phase 1: Basic Change Tracking (MVP)

**Goal:** Implement core change detection and history tracking

**Tasks:**

1. Create initial `change-history.json` from current `complete-data.json`
2. Implement comparison logic for regions, services, regional services
3. Save previous snapshot after each run
4. Append daily changes to `changeLog` array
5. Basic console output showing detected changes

**Estimated effort:** 4-6 hours

### Phase 2: Enhanced Features

**Goal:** Add metadata, flags, and better reporting

**Tasks:**

1. Add `isNew` flag for recent additions (< 30 days)
2. Implement metadata statistics (totals, growth rates)
3. Generate daily summary output
4. Add to Lambda SNS notifications

**Estimated effort:** 2-3 hours

### Phase 3: Reporting & Analytics

**Goal:** Create valuable insights from historical data

**Tasks:**

1. Monthly summary report generation
2. Year-end summary report
3. Trend analysis (growth over time)
4. Service expansion tracking
5. Export to CSV/Excel for visualization

**Estimated effort:** 3-4 hours

### Phase 4: Advanced Features (Optional)

**Goal:** Deprecation tracking, notifications, advanced queries

**Tasks:**

1. Service deprecation detection
2. Notification threshold rules
3. Change categories and priorities
4. Advanced query helpers
5. Dashboard/UI integration

**Estimated effort:** 4-6 hours

## Code Implementation Checklist

### Core Functions Required

- [ ] `loadPreviousSnapshot()` - Load `.previous-snapshot.json`
- [ ] `detectNewRegions()` - Compare region lists
- [ ] `detectNewServices()` - Compare service lists
- [ ] `detectNewRegionalServices()` - Compare regional service mappings
- [ ] `updateChangeHistory()` - Append new changes
- [ ] `savePreviousSnapshot()` - Save current data for next run
- [ ] `generateDailySummary()` - Create human-readable summary

### Optional Functions

- [ ] `generateMonthlyReport()` - Monthly statistics
- [ ] `generateYearlyReport()` - Annual summary
- [ ] `exportToCSV()` - Export for Excel/Sheets
- [ ] `sendChangeNotification()` - Email/SNS alerts for significant changes
- [ ] `cleanupOldSnapshots()` - Remove old snapshot files
- [ ] `detectDeprecations()` - Track removed services
- [ ] `calculateTrends()` - Compute growth trends
- [ ] `updateIsNewFlags()` - Refresh 30-day new flags

### Integration Points

- [ ] Integrate into `AWSDataFetcher.run()` (CLI mode)
- [ ] Integrate into Lambda handler (serverless mode)
- [ ] Add to SNS notifications
- [ ] Update S3 storage abstraction for new files
- [ ] Add command-line flags (`--skip-change-tracking`)

### Testing

- [ ] Test initial creation of `change-history.json`
- [ ] Test detection of new regions
- [ ] Test detection of new services
- [ ] Test detection of new regional services
- [ ] Test no changes scenario
- [ ] Test multiple changes in single run
- [ ] Test snapshot persistence across runs

## Sample Daily Summary Output

```
=== AWS Infrastructure Daily Changes ===
Date: 2025-10-23

📍 New Regions: 0
🛠️  New Services: 1
   - bedrock-data-automation (Amazon Bedrock Data Automation)

🗺️  New Regional Service Availability: 2
   - us-east-1 → bedrock-data-automation
   - eu-west-1 → bedrock-data-automation

📈 Current Totals:
   - Regions: 38 (unchanged)
   - Services: 394 (+1)
   - Regional Services: 8,646 (+2)

🔗 Full details: output/change-history.json
```

## Key Benefits of This Design

✅ **Simple JSON format** - No database required
✅ **Git-friendly** - Easy to track changes in version control
✅ **Query-able** - Standard JavaScript/jq for data extraction
✅ **Low overhead** - Minimal storage and processing
✅ **Historical accuracy** - Tracks exact date of first appearance
✅ **Extensible** - Easy to add new tracking dimensions
✅ **Human-readable** - Clear format for manual review
✅ **Flexible deployment** - Works in both CLI and Lambda modes
✅ **Zero maintenance** - Automatic updates on each run

## Potential Challenges and Solutions

### Challenge 1: Initial Baseline

**Problem:** First run has no previous snapshot to compare against

**Solution:** On first run, treat all current data as "firstSeen: today" and create initial baseline

```javascript
if (!previousSnapshotExists) {
  console.log('📋 First run - creating baseline change history');
  initializeChangeHistory(currentData);
  savePreviousSnapshot(currentData);
  return { hasChanges: false, isFirstRun: true };
}
```

### Challenge 2: Large changeLog Array

**Problem:** After years of daily runs, changeLog could become very large

**Solution:** Implement optional archiving and pagination

```javascript
// Option 1: Archive old entries annually
if (changeHistory.changeLog.length > 365) {
  const oldEntries = changeHistory.changeLog.splice(365);
  saveArchive(`change-log-${currentYear - 1}.json`, oldEntries);
}

// Option 2: Keep only last N days in main file
const keepDays = 90;
changeHistory.changeLog = changeHistory.changeLog.slice(0, keepDays);
```

### Challenge 3: False Positives

**Problem:** Temporary API failures might make services appear "gone" then "new" again

**Solution:** Only mark as new if absent for 2+ consecutive runs

```javascript
// Track "missing" items before removing from history
if (serviceWasPresentBefore && !serviceIsPresentNow) {
  markAsMissing(service, todayDate);
}

if (serviceMissingFor >= 2 days) {
  markAsDeprecated(service);
}
```

## Future Enhancements

### API/Webhook Integration

```javascript
// POST to external API when changes detected
if (changes.hasChanges) {
  await fetch('https://your-api.com/aws-changes', {
    method: 'POST',
    body: JSON.stringify({
      date: todayDate,
      changes: changes
    })
  });
}
```

### Slack/Discord Notifications

```javascript
// Send formatted message to Slack
if (changes.newRegions.length > 0) {
  await sendSlackNotification({
    channel: '#aws-infrastructure',
    message: `🚨 New AWS Region: ${changes.newRegions[0].name}`,
    color: 'good'
  });
}
```

### Real-time Dashboard

```javascript
// Serve change history via simple HTTP endpoint
app.get('/api/changes/recent', (req, res) => {
  const days = req.query.days || 30;
  const recentChanges = filterChangesByDays(changeHistory, days);
  res.json(recentChanges);
});
```

## Conclusion

This design provides a simple, maintainable, and extensible solution for tracking AWS infrastructure changes over time. The JSON-based approach requires no database, integrates seamlessly with existing code, and provides valuable historical insights through simple queries.

**Next Steps:**

1. Review this design document
2. Approve schema and approach
3. Implement Phase 1 (MVP) - basic change tracking
4. Test with sample data
5. Deploy and monitor for one week
6. Implement Phase 2/3 based on usage patterns
