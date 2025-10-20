# AWS Infrastructure Data Fetcher - Roadmap

This document outlines planned features and improvements for the AWS Infrastructure Data Fetcher project.

---

## Current Version: 1.6.0 (2025-10-20)

### Recently Completed ✅
- CloudFront distribution integration for global data access
- Automatic cache invalidation after updates
- Enhanced SNS notifications with distribution status
- Dual storage strategy (source + distribution buckets)

---

## Planned Enhancements

### High Priority

#### 1. GitHub Actions CI/CD Pipeline
**Status**: Planned
**Priority**: High
**Estimated Effort**: 2-3 hours

**Objective**: Implement automated deployment pipeline using GitHub Actions to replace manual SAM deployments.

**Features**:
- Automated SAM build and deployment on push to main branch
- Automated testing before deployment
- Integration with GitHub OIDC for secure AWS authentication (no long-lived credentials)
- Environment-specific deployments (dev, staging, production)
- Deployment status notifications (Slack/email)
- Rollback capabilities on deployment failure

**Benefits**:
- Eliminate manual `sam build` and `sam deploy` commands
- Faster, more reliable deployments
- Consistent deployment process across team members
- Automated validation and testing
- Complete audit trail of all deployments
- Follows project's deployment policy standards (as per CLAUDE.md)

**Implementation Tasks**:
1. Create `.github/workflows/deploy.yml` workflow file
2. Configure GitHub OIDC provider in AWS (if not already configured)
3. Create project-specific IAM role for GitHub Actions
4. Add environment-specific configuration files
5. Implement automated testing step (linting, unit tests)
6. Add deployment approval gates for production
7. Configure Slack/SNS notifications for deployment status
8. Update documentation with CI/CD workflow guide

**References**:
- AWS Hosting LawnSmartApp project (successful OIDC implementation)
- GitHub Actions AWS OIDC documentation
- Project CLAUDE.md security standards

**Acceptance Criteria**:
- ✅ Push to main triggers automated deployment
- ✅ All tests pass before deployment
- ✅ OIDC authentication working (no access keys)
- ✅ Deployment notifications sent
- ✅ Manual approval gate for production
- ✅ Documentation updated

---

### Medium Priority

#### 2. Multi-Region Data Aggregation
**Status**: Idea
**Priority**: Medium
**Estimated Effort**: 3-4 hours

**Objective**: Aggregate service availability data across multiple AWS partitions (commercial, China, GovCloud).

**Features**:
- Separate datasets for each partition
- Partition-specific service availability analysis
- Cross-partition comparison reports

#### 3. Historical Trend Analysis
**Status**: Idea
**Priority**: Medium
**Estimated Effort**: 4-5 hours

**Objective**: Track and analyze AWS service availability changes over time.

**Features**:
- Weekly/monthly trend reports
- Service launch detection
- Region expansion tracking
- Availability zone growth metrics

#### 4. API Gateway Public Endpoint
**Status**: Idea
**Priority**: Medium
**Estimated Effort**: 3-4 hours

**Objective**: Provide REST API access to AWS infrastructure data.

**Features**:
- RESTful endpoints for regions, services, mappings
- Query parameters for filtering and pagination
- Rate limiting and caching
- API documentation (Swagger/OpenAPI)

---

### Low Priority

#### 5. Data Visualization Dashboard
**Status**: Idea
**Priority**: Low
**Estimated Effort**: 8-10 hours

**Objective**: Create interactive dashboard for exploring AWS infrastructure data.

**Features**:
- Region/service heatmaps
- Service availability matrix
- Historical growth charts
- Regional comparison tools

#### 6. Webhook Notifications for Data Updates
**Status**: Idea
**Priority**: Low
**Estimated Effort**: 2-3 hours

**Objective**: Send webhook notifications when data updates are available.

**Features**:
- Configurable webhook endpoints
- Payload includes changed data summary
- Retry logic for failed deliveries
- Webhook subscription management

---

## Completed Features

### v1.6.0 (2025-10-20)
- ✅ CloudFront distribution integration
- ✅ Automatic cache invalidation
- ✅ Enhanced monitoring and notifications
- ✅ Public data access via CDN

### v1.5.1 (2025-10-13)
- ✅ Node.js 20.x runtime upgrade
- ✅ AWS deprecation warning resolution
- ✅ Extended LTS support until 2026

### v1.5.0 (2025-10-12)
- ✅ Project restructuring (modular architecture)
- ✅ Organized tests directory structure
- ✅ Professional Node.js project layout

### v1.4.0 (2025-10-11)
- ✅ Region launch dates and blog URLs
- ✅ Availability zone counts
- ✅ Dynamic service name fetching from SSM
- ✅ Zero maintenance service catalog

### v1.3.0 (2025-10-11)
- ✅ SSM-only architecture
- ✅ Removed EC2 API dependency
- ✅ Runtime tracking

### v1.2.0 (2025-10-11)
- ✅ 24-hour intelligent caching system
- ✅ Single source of truth (complete-data.json)
- ✅ 10-50x speedup for repeated runs

### v1.1.0 (2025-10-11)
- ✅ Parallel batch processing
- ✅ Adaptive throttling with retry logic
- ✅ Real-time progress tracking

### v1.0.0 (2025-10-10)
- ✅ Initial release with SSM data fetching
- ✅ Lambda deployment
- ✅ S3 storage and SNS notifications

---

## Contributing

Have ideas for improvements? Please:
1. Review this roadmap to avoid duplicate efforts
2. Open an issue to discuss new features
3. Submit pull requests with detailed descriptions
4. Follow the project's coding standards (see CLAUDE.md)

---

## Version History

For detailed version history and release notes, see [CHANGELOG.md](./CHANGELOG.md).

---

**Last Updated**: 2025-10-20
**Next Review**: After v1.7.0 release
