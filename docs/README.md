# Documentation Index

This directory contains comprehensive documentation for the AWS SSM Data Fetcher project.

## Quick Links

### Deployment Guides

- **[Deployment Quick Start](DEPLOYMENT_QUICKSTART.md)** - Step-by-step Lambda deployment guide (5 minutes)
- **[Notifications Setup](NOTIFICATIONS_SETUP.md)** - Configure SNS email notifications for execution status

### Main Documentation

- **[Project README](../README.md)** - Main project documentation, features, and usage
- **[Changelog](CHANGELOG.md)** - Complete version history from v1.0.0 to v1.5.0

## Documentation Structure

```
docs/
├── README.md                      # This file - documentation index
├── DEPLOYMENT_QUICKSTART.md       # Lambda deployment guide
├── NOTIFICATIONS_SETUP.md         # SNS notification setup
└── archived/                      # Archived documentation
    ├── CODE_REVIEW_SUGGESTIONS.md
    └── PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md
```

## Getting Started

### For New Users

1. Start with the [Project README](../README.md) to understand the project
2. Follow the [Deployment Quick Start](DEPLOYMENT_QUICKSTART.md) to deploy to AWS Lambda
3. Configure [Email Notifications](NOTIFICATIONS_SETUP.md) for execution alerts

### For Existing CLI Users

1. Review the [Changelog](CHANGELOG.md) to see what's new in v1.5.0
2. Check the [Migration Guide](CHANGELOG.md#migration-from-cli-to-lambda) in the changelog
3. Deploy to Lambda while keeping CLI functionality intact

## Key Features Documented

### Lambda Deployment (v1.5.0)

- Serverless AWS Lambda function with automated scheduling
- S3 storage integration with versioning and lifecycle policies
- SNS email notifications for success and error scenarios
- CloudWatch monitoring and alarms
- Infrastructure as Code with SAM/CloudFormation
- Cost-effective operation (~$0.04/month)

### Data Collection

- **38 AWS Regions** - All commercial, GovCloud, and China regions
- **394 AWS Services** - Complete service catalog with official names
- **Service Mapping** - Which services are available in each region
- **Availability Zones** - AZ counts per region
- **Launch Data** - Region launch dates and announcement blog URLs

### Performance Features

- **24-hour cache** - 10-50x speedup for repeated runs
- **Parallel batch processing** - Configurable batch size for optimal performance
- **Smart throttling** - Adaptive delays with exponential backoff retry
- **Execution time** - 13 seconds with cache, ~1m 49s without cache

## Archived Documentation

The `archived/` directory contains documentation that was relevant to earlier versions but is now outdated:

- **CODE_REVIEW_SUGGESTIONS.md** - CLI-focused code review suggestions (pre-Lambda)
- **PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md** - Performance suggestions (now implemented in v1.1.0)

These files are preserved for historical reference but should not be used for current development.

## Support and Troubleshooting

### Common Issues

**Lambda deployment fails:**

- Check AWS credentials are configured: `aws sts get-caller-identity`
- Ensure SAM CLI is installed: `sam --version`
- Review [Deployment Quick Start](DEPLOYMENT_QUICKSTART.md) for prerequisites

**S3 bucket already exists:**

- S3 bucket names must be globally unique
- Change `S3BucketName` parameter during `sam deploy --guided`
- Use a unique prefix like `aws-data-fetcher-yourname`

**No email notifications:**

- Check SNS subscription confirmation email (check spam folder)
- Verify `NotificationEmail` parameter was set during deployment
- Review [Notifications Setup](NOTIFICATIONS_SETUP.md) guide

**Lambda execution timeout:**

- Default timeout is 180 seconds (3 minutes)
- Cache should reduce execution to ~13 seconds
- If timeout persists, check CloudWatch logs for errors

### Getting Help

1. **Check CloudWatch Logs:**

   ```bash
   sam logs --stack-name aws-data-fetcher --tail
   ```

2. **View Lambda execution:**

   ```bash
   aws lambda invoke \
     --function-name aws-data-fetcher \
     --log-type Tail \
     --payload '{"includeServiceMapping":true}' \
     response.json
   ```

3. **Check S3 bucket contents:**

   ```bash
   aws s3 ls s3://aws-data-fetcher-output/aws-data/ --recursive
   ```

4. **Review SNS topic subscriptions:**
   ```bash
   aws sns list-subscriptions
   ```

## Contributing

When adding new documentation:

1. **Place in appropriate directory:**

   - Deployment guides → `docs/`
   - Feature documentation → Update `../README.md`
   - Version history → Update `CHANGELOG.md`

2. **Update this index:**

   - Add new files to the relevant section
   - Update the documentation structure diagram
   - Add common issues to troubleshooting if applicable

3. **Archive outdated docs:**
   - Move superseded documentation to `archived/`
   - Add note explaining why it was archived
   - Keep for historical reference

## Version Information

- **Current Version:** 1.5.0
- **Release Date:** 2025-10-12
- **Deployment Type:** AWS Lambda (serverless)
- **Storage:** S3 with local fallback
- **Scheduling:** EventBridge (daily at 2 AM UTC)
- **Notifications:** SNS email (optional)

## Additional Resources

- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [AWS SSM Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
