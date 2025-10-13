# AWS Data Reporting Architecture Decision Document

**Date**: 2025-10-13
**Status**: Proposal for Review
**Decision Owner**: Project Maintainer

## Context

The current **nodejs-aws-fetcher** project is a standalone CLI tool that:
- Fetches AWS infrastructure data from SSM Parameter Store
- Discovers 38 regions, 395+ services, and service-by-region mappings
- Outputs structured JSON files to `./output/` directory
- Serves as a data collection and verification tool

**New Requirement**: Add reporting capabilities to analyze and visualize the collected JSON data.

## Decision: Should Reporting be a Separate Project or Added to Existing?

### Option A: Separate Reporting Project (RECOMMENDED)

#### Architecture
```
┌─────────────────────┐         ┌─────────────────────┐
│  nodejs-aws-fetcher │         │  aws-data-reporter  │
│  (Data Collection)  │────────▶│  (Data Analysis)    │
│                     │  JSON   │                     │
└─────────────────────┘  Files  └─────────────────────┘
        │                                 │
        ▼                                 ▼
   ./output/*.json                  Reports/Dashboards
```

#### Advantages

**1. Separation of Concerns**
- **Data collection** remains pure and focused
- **Reporting logic** isolated from fetching logic
- Each tool has a single, well-defined responsibility

**2. Technology Independence**
- Fetcher: Node.js CLI (optimal for AWS SDK integration)
- Reporter: Could use Python (pandas, matplotlib), React (web dashboard), or any tool
- Choose best technology for each task

**3. Deployment Flexibility**
- Fetcher: Run on-demand or scheduled (cron, Lambda)
- Reporter: Deploy as web app, PDF generator, or dashboard service
- Independent deployment cycles

**4. Scalability**
- Multiple reporting tools can consume same data
- Add new report types without touching fetcher
- Different teams can own different components

**5. Maintenance Simplicity**
- Bug fixes isolated to specific functionality
- Testing is simpler (unit tests per project)
- Dependencies don't conflict (fetcher vs. reporting libraries)

**6. Reusability**
- Other projects can consume your JSON data
- Reporting tool could support multiple data sources
- Clean API boundary (JSON file format)

#### Disadvantages

**1. Project Management Overhead**
- Two repositories to maintain
- Two package.json files / dependency trees
- More documentation required

**2. Data Synchronization**
- Need to manage file paths between projects
- Potential versioning issues with JSON schema
- Must define clear data contract

**3. Development Setup**
- Developers need to clone two repos
- More initial setup complexity
- Cross-project changes require coordination

---

### Option B: Extend Existing Project

#### Architecture
```
nodejs-aws-fetcher/
├── fetch-aws-data.js      # Existing fetcher
├── generate-reports.js    # New reporting module
├── output/                # Shared data directory
├── reports/               # Generated reports
└── templates/             # Report templates
```

#### Advantages

**1. Single Repository**
- All code in one place
- Simplified project management
- Single dependency tree

**2. Integrated Workflow**
- Run fetch + report in single command
- No file path coordination needed
- Shared configuration

**3. Faster Initial Development**
- Quick prototyping of reports
- Direct access to data structures
- Less boilerplate setup

**4. Simplified CI/CD**
- Single GitHub Actions workflow
- One deployment pipeline
- Unified version numbers

#### Disadvantages

**1. Scope Creep**
- Project becomes multi-purpose tool
- Harder to explain: "data fetcher" vs. "data platform"
- Violates single responsibility principle

**2. Dependency Conflicts**
- Reporting libraries may conflict with AWS SDK
- Package size grows significantly
- Testing becomes more complex

**3. Reduced Flexibility**
- Locked into Node.js ecosystem
- Harder to use alternative reporting technologies
- Tightly coupled components

**4. Scaling Challenges**
- Adding new report types clutters codebase
- Performance: fetching + reporting in single process
- Harder to optimize independently

**5. Deployment Constraints**
- CLI tool vs. web dashboard have different needs
- Lambda deployment becomes complex
- Resource requirements differ (fetcher: memory, reporter: CPU)

---

## Recommendation: Option A (Separate Projects)

### Rationale

**Your current project is well-architected for its purpose:**
- Single-file CLI tool
- Focused on data collection and verification
- Clean, portable, easy to understand
- Follows Unix philosophy: do one thing well

**Adding reporting would fundamentally change the project:**
- No longer a simple CLI tool
- Becomes a data platform
- Loses architectural clarity
- Harder to maintain and extend

**The JSON output is a perfect API boundary:**
- Well-structured data format
- Includes metadata and timestamps
- Versioned schema possible
- Multiple consumers supported

### Proposed Project Structure

#### Project 1: nodejs-aws-fetcher (Existing)
**Purpose**: AWS infrastructure data collection
**Output**: JSON files in `./output/`
**Deployment**: CLI, cron jobs, Lambda functions
**Technology**: Node.js + AWS SDK v3

#### Project 2: aws-data-reporter (New)
**Purpose**: Analysis and visualization of AWS data
**Input**: JSON files from fetcher
**Output**: HTML reports, PDFs, dashboards, CSV exports
**Deployment**: Web app, static site generator, or CLI
**Technology**: Your choice (Python, React, Jupyter, etc.)

---

## Implementation Approach

### Phase 1: Define Data Contract
Create `DATA_CONTRACT.md` in nodejs-aws-fetcher:

```markdown
# AWS Data JSON Schema

## complete-data.json
- Version: 1.4.0
- Schema: { regions: [], services: [], servicesByRegion: {}, ... }
- Stability: Stable (backward compatible changes only)
```

### Phase 2: Create Reporter Project
New repository: `aws-data-reporter`

```
aws-data-reporter/
├── README.md
├── package.json
├── src/
│   ├── parsers/           # Parse fetcher JSON
│   ├── analyzers/         # Data analysis logic
│   ├── reporters/         # Report generators
│   └── templates/         # Report templates
├── config/
│   └── data-source.json   # Path to fetcher output
├── output/
│   └── reports/           # Generated reports
└── tests/
```

### Phase 3: Example Reports

**Regional Coverage Report**
- Total regions by partition
- Service availability by region
- AZ distribution analysis
- Launch timeline visualization

**Service Analysis Report**
- Most/least available services
- Regional service gaps
- Service coverage trends
- Missing service detection

**Comparison Reports**
- Compare two time periods
- Track new region launches
- Monitor service rollouts
- Historical trend analysis

### Phase 4: Integration Options

**Option 1: File System (Simplest)**
```bash
# Fetch data
cd nodejs-aws-fetcher && npm start

# Generate reports
cd aws-data-reporter && npm start --input ../nodejs-aws-fetcher/output/
```

**Option 2: Shared Volume (Docker)**
```yaml
services:
  fetcher:
    volumes:
      - aws-data:/data
  reporter:
    volumes:
      - aws-data:/data
```

**Option 3: S3 Integration (Production)**
```
Fetcher → S3 Bucket → Reporter
(Lambda)   (Storage)   (Web App)
```

---

## Technology Recommendations for Reporter

### Option 1: Python + Pandas (Data Analysis Focus)
**Best for**: Complex data analysis, scientific computing
**Libraries**: pandas, matplotlib, seaborn, jinja2
**Output**: Static HTML reports, PDFs, Jupyter notebooks

```python
import pandas as pd
import json

# Load AWS data
with open('complete-data.json') as f:
    data = json.load(f)

# Analyze
df_regions = pd.DataFrame(data['regions'])
coverage = df_regions.groupby('partition').size()

# Report
print(f"Coverage: {coverage}")
```

### Option 2: React + D3.js (Interactive Dashboard)
**Best for**: Interactive visualizations, web dashboards
**Libraries**: React, D3.js, Recharts, Material-UI
**Output**: Interactive web application

```javascript
import { BarChart } from 'recharts';

function RegionDashboard() {
  const data = require('./complete-data.json');
  return <BarChart data={data.regions} ... />;
}
```

### Option 3: Node.js + Handlebars (Lightweight HTML)
**Best for**: Simple static reports, template-based
**Libraries**: Handlebars, Chart.js, pdf-lib
**Output**: Static HTML, PDF reports

```javascript
const Handlebars = require('handlebars');
const data = require('./complete-data.json');
const html = template(data);
```

### Option 4: Jupyter Notebook (Exploratory Analysis)
**Best for**: Ad-hoc analysis, data exploration
**Libraries**: Jupyter, pandas, plotly
**Output**: Interactive notebooks, HTML exports

```python
# analysis.ipynb
import pandas as pd
data = pd.read_json('complete-data.json')
data['regions'].describe()
```

---

## Decision Checklist

Before deciding, consider these questions:

**Scale Questions:**
- [ ] Will you have multiple report types? (→ Separate project)
- [ ] Will reports need different tech stack? (→ Separate project)
- [ ] Will reports be deployed differently? (→ Separate project)

**Team Questions:**
- [ ] Will different people maintain fetcher vs. reporter? (→ Separate)
- [ ] Is this a personal project or team project? (Personal → could go either way)
- [ ] Will others want to use your data? (→ Separate project)

**Technical Questions:**
- [ ] Do you need web dashboard? (→ Separate project, likely React)
- [ ] Just simple HTML reports? (→ Could extend existing)
- [ ] Complex data analysis? (→ Separate project, Python)

**Future Questions:**
- [ ] Will you add more data sources? (→ Separate project)
- [ ] Real-time reporting? (→ Separate project)
- [ ] Historical trend analysis? (→ Separate project)

---

## Sample Report Ideas

### 1. Regional Coverage Dashboard
- Map visualization of all 38 regions
- Service count heatmap by region
- AZ distribution chart
- Launch timeline

### 2. Service Availability Matrix
- Table: Services (rows) × Regions (columns)
- Color coding: Available (green), Missing (red)
- Filter by service type
- Export to CSV

### 3. Comparison Report
- Compare two snapshots over time
- New regions launched
- New services added
- Service rollout to existing regions

### 4. Executive Summary
- Total regions, services, mappings
- Coverage percentages
- Notable findings
- PDF export for stakeholders

### 5. Data Quality Report
- Missing data detection
- Timestamp validation
- Schema compliance check
- Data freshness indicators

---

## Migration Path (If You Choose Separate Project)

### Step 1: Stabilize Current Project
- Document JSON schema in DATA_CONTRACT.md
- Add schema version to output files
- Ensure backward compatibility

### Step 2: Create New Repository
```bash
mkdir aws-data-reporter
cd aws-data-reporter
npm init -y
# or: python -m venv .venv
```

### Step 3: Build MVP Report
- Start with simplest report type
- Validate JSON parsing
- Generate basic HTML output

### Step 4: Iterate and Expand
- Add more report types
- Improve visualizations
- Add filtering/customization

### Step 5: Production Deployment
- Deploy fetcher as Lambda/cron
- Deploy reporter as web app/static site
- Connect via S3 or shared volume

---

## Cost-Benefit Analysis

### Separate Projects (Option A)

**Costs:**
- 2-3 hours: Initial project setup
- 1 hour: Define data contract
- Ongoing: Maintain two repos

**Benefits:**
- Clean architecture (worth 10+ hours in future maintenance)
- Technology flexibility (unlimited future value)
- Independent scaling (potential cost savings in production)
- Better testing (faster CI/CD, fewer bugs)

**Net Benefit**: Strongly positive for any project lasting >6 months

### Single Project (Option B)

**Costs:**
- Technical debt accumulation
- Harder to refactor later
- Limited technology choices
- Testing complexity

**Benefits:**
- 2-3 hours faster initial setup
- Single repository management

**Net Benefit**: Only positive for quick prototypes or throw-away code

---

## Final Recommendation

**Create a separate `aws-data-reporter` project.**

### Why This is the Right Choice:

1. **Your fetcher is well-designed** - don't compromise it
2. **Clear separation of concerns** - easier to maintain
3. **Future flexibility** - choose best reporting technology
4. **Scalability** - independent deployment and optimization
5. **Professional architecture** - follows industry best practices

### Suggested Technology Stack for Reporter:

**For quick MVP**: Node.js + Handlebars (similar to fetcher)
**For best analysis**: Python + Pandas + Matplotlib
**For interactive dashboard**: React + Recharts + Material-UI
**For exploration**: Jupyter Notebook

### Next Steps:

1. Create `DATA_CONTRACT.md` in nodejs-aws-fetcher
2. Create new repository: `aws-data-reporter`
3. Choose reporting technology based on your needs
4. Build MVP with single report type
5. Iterate and expand

---

## Questions to Consider

Before starting development, answer these:

1. **Who is the audience?** (Yourself, team, stakeholders, public)
2. **What format?** (HTML, PDF, Dashboard, CSV, Notebook)
3. **How often?** (On-demand, scheduled, real-time)
4. **What insights?** (Coverage, trends, comparisons, anomalies)
5. **How technical?** (Raw data, visualizations, executive summary)

Your answers will guide the implementation approach.

---

## Conclusion

The **nodejs-aws-fetcher** project is excellent at what it does: collecting AWS infrastructure data. Keep it that way. Build reporting as a separate, focused project that leverages the clean JSON output. This architectural decision will pay dividends in maintainability, flexibility, and scalability.

**Recommendation**: Proceed with separate project approach (Option A).

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
**Review Status**: Pending maintainer decision
