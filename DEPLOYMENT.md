# Deployment Guide - AWS Infrastructure Data Fetcher

This guide covers deploying the AWS Infrastructure Data Fetcher using GitHub Actions with OIDC authentication.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Initial Setup (One-Time)](#initial-setup-one-time)
- [GitHub Repository Configuration](#github-repository-configuration)
- [Automated Deployment via GitHub Actions](#automated-deployment-via-github-actions)
- [Manual Deployment (Optional)](#manual-deployment-optional)
- [Monitoring & Verification](#monitoring--verification)
- [Troubleshooting](#troubleshooting)
- [Updating IAM Permissions](#updating-iam-permissions)

---

## Architecture Overview

### Deployment Pipeline

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  GitHub Push    │───▶│  GitHub Actions │───▶│  AWS SAM Deploy │
│  (main branch)  │    │  (OIDC Auth)    │    │  (CloudFormation)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │  IAM Role with   │    │  Lambda Funcs   │
                    │  OIDC Provider   │    │  S3 Bucket      │
                    │  (bootstrap)     │    │  SNS Topic      │
                    └──────────────────┘    │  CloudWatch     │
                                           └─────────────────┘
```

### Components

**Bootstrap Resources (One-Time Setup):**
- OIDC Provider: `token.actions.githubusercontent.com`
- IAM Role: `GithubActionsOIDC-AWSServicesDataFetcher-Role`
- IAM Policy: `GithubActions-AWSServicesDataFetcher-Policy`

**Application Resources (Deployed by SAM):**
- 2 Lambda Functions (data-fetcher, whats-new-fetcher)
- S3 Bucket (aws-data-fetcher-output)
- SNS Topic (notifications)
- 4 CloudWatch Alarms
- 2 CloudWatch Log Groups
- EventBridge Rules (scheduled triggers)

---

## Prerequisites

### Required Tools

1. **AWS CLI** (v2.x recommended)
   ```bash
   aws --version  # Should be 2.x or higher
   ```

2. **jq** (JSON processor for bootstrap script)
   ```bash
   # macOS
   brew install jq

   # Linux
   sudo apt-get install jq
   ```

3. **AWS Credentials**
   - Admin or sufficient IAM permissions to create:
     - IAM Roles, Policies, OIDC Providers
     - Lambda Functions, S3 Buckets, SNS Topics, CloudWatch resources
   - Configured via `aws configure` or environment variables

4. **GitHub Repository Access**
   - Admin access to configure secrets
   - Repository: `jxman/aws-infrastructure-fetcher` (or your fork)

---

## Initial Setup (One-Time)

### Step 1: Run the Bootstrap Script

The bootstrap script creates the IAM resources needed for GitHub Actions to deploy via OIDC.

```bash
# Navigate to project root
cd /path/to/aws-services-fetcher

# Run bootstrap script
bash scripts/setup-oidc.sh
```

**Interactive Prompts:**

```
AWS Region [us-east-1]: us-east-1 ⏎
GitHub Repository (format: owner/repo): jxman/aws-infrastructure-fetcher ⏎
Continue? (yes/no): yes ⏎
```

**Expected Output:**

```
========================================
Setup Complete!
========================================

✓ OIDC Provider created/verified
✓ IAM Role created/verified
✓ IAM Policy created/verified
✓ Policy attached to role

========================================
Next Steps
========================================

1. Add the following secret to your GitHub repository:

   Secret Name:  AWS_ROLE_ARN
   Secret Value: arn:aws:iam::ACCOUNT_ID:role/GithubActionsOIDC-AWSServicesDataFetcher-Role

2. Navigate to your repository settings:
   https://github.com/jxman/aws-infrastructure-fetcher/settings/secrets/actions

3. Click 'New repository secret' and add the above values

4. Push your code to trigger the GitHub Actions workflow

ℹ Role ARN saved to: scripts/oidc-role-arn.txt
```

### Step 2: Verify Resources Created

```bash
# Check OIDC Provider
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com

# Check IAM Role
aws iam get-role --role-name GithubActionsOIDC-AWSServicesDataFetcher-Role

# Check IAM Policy
aws iam list-policies --scope Local | grep GithubActions-AWSServicesDataFetcher-Policy
```

---

## GitHub Repository Configuration

### Add GitHub Secret

1. **Navigate to Repository Settings:**
   ```
   https://github.com/jxman/aws-infrastructure-fetcher/settings/secrets/actions
   ```

2. **Click "New repository secret"**

3. **Add the following secret:**
   - **Name:** `AWS_ROLE_ARN`
   - **Value:** The ARN from bootstrap script output (or from `scripts/oidc-role-arn.txt`)
     ```
     arn:aws:iam::600424110307:role/GithubActionsOIDC-AWSServicesDataFetcher-Role
     ```

4. **Save the secret**

### Verify GitHub Actions Workflow

The workflow file is located at `.github/workflows/deploy.yml` and includes:

- **Test & Validate Job:** Runs on all PRs and pushes
  - Node.js setup and dependency installation
  - SAM template validation
  - SAM build verification

- **Deploy Job:** Runs only on `main` branch pushes
  - OIDC authentication with AWS
  - SAM build and deployment
  - Stack outputs and deployment summary

---

## Automated Deployment via GitHub Actions

### Trigger Deployment

Push to the `main` branch to trigger automated deployment:

```bash
git checkout main
git add .
git commit -m "feat: update Lambda functions with new features"
git push origin main
```

### Monitor Deployment

1. **GitHub Actions UI:**
   ```
   https://github.com/jxman/aws-infrastructure-fetcher/actions
   ```

2. **Watch the workflow run** - typical duration: 3-5 minutes

3. **Deployment Summary** - Available at the end of the workflow run:
   - Stack name
   - Lambda function names
   - Output bucket
   - Public data URLs

### Workflow Steps Breakdown

**Test & Validate (runs on all branches):**
1. Checkout code
2. Setup Node.js 20.x
3. Install npm dependencies
4. Run linting (optional)
5. Run tests (optional)
6. Setup Python 3.11 for SAM
7. Setup AWS SAM CLI
8. Validate SAM template with linting
9. Build SAM application

**Deploy (runs only on main branch):**
1. All validation steps from above
2. Configure AWS credentials via OIDC
3. Build SAM application
4. Deploy to AWS with parameters:
   - Environment: `prod`
   - ProjectName: `aws-services`
   - ServiceName: `aws-infrastructure-data-fetcher`
   - GithubRepository: `github.com/jxman/aws-infrastructure-fetcher`
5. Get stack outputs
6. Display deployment summary

---

## Manual Deployment (Optional)

For local testing or emergency deployments, you can deploy manually:

### Prerequisites for Manual Deployment

1. **AWS SAM CLI**
   ```bash
   brew install aws-sam-cli  # macOS
   ```

2. **AWS Credentials** configured with sufficient permissions

### Manual Deployment Steps

```bash
# 1. Build the application
sam build

# 2. Deploy the application
sam deploy \
  --no-confirm-changeset \
  --stack-name sam-aws-services-fetch \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --region us-east-1 \
  --parameter-overrides \
    Environment=prod \
    ProjectName=aws-services \
    ServiceName=aws-infrastructure-data-fetcher \
    GithubRepository=github.com/jxman/aws-infrastructure-fetcher

# 3. View stack outputs
aws cloudformation describe-stacks \
  --stack-name sam-aws-services-fetch \
  --query 'Stacks[0].Outputs' \
  --output table
```

---

## Monitoring & Verification

### Verify Deployment Success

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name sam-aws-services-fetch \
  --query 'Stacks[0].StackStatus' \
  --output text

# Expected output: UPDATE_COMPLETE or CREATE_COMPLETE
```

### Verify Lambda Functions

```bash
# List Lambda functions
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `aws-data-fetcher`) || starts_with(FunctionName, `aws-whats-new-fetcher`)].{Name:FunctionName,Runtime:Runtime,Modified:LastModified}' \
  --output table
```

### Verify Tags Applied

```bash
# Check S3 bucket tags
aws s3api get-bucket-tagging \
  --bucket aws-data-fetcher-output \
  --output table

# Check Lambda function tags
aws lambda list-tags \
  --resource arn:aws:lambda:us-east-1:ACCOUNT_ID:function:aws-data-fetcher \
  --output table
```

### Monitor CloudWatch Logs

```bash
# Tail data fetcher logs
aws logs tail /aws/lambda/aws-data-fetcher --follow

# Tail What's New fetcher logs
aws logs tail /aws/lambda/aws-whats-new-fetcher --follow
```

### Check EventBridge Schedules

```bash
# List EventBridge rules for the stack
aws events list-rules \
  --name-prefix sam-aws-services-fetch \
  --query 'Rules[*].{Name:Name,Schedule:ScheduleExpression,State:State}' \
  --output table
```

---

## Troubleshooting

### Issue: OIDC Authentication Fails

**Symptoms:**
- GitHub Actions shows: "Error: Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Solution:**
1. Verify the `AWS_ROLE_ARN` secret in GitHub is correct
2. Check the trust policy on the IAM role:
   ```bash
   aws iam get-role \
     --role-name GithubActionsOIDC-AWSServicesDataFetcher-Role \
     --query 'Role.AssumeRolePolicyDocument'
   ```
3. Ensure the repository name matches exactly (case-sensitive)

### Issue: SAM Deploy Fails with Permission Error

**Symptoms:**
- "User is not authorized to perform: cloudformation:CreateStack"

**Solution:**
1. Check IAM policy permissions:
   ```bash
   aws iam get-policy-version \
     --policy-arn arn:aws:iam::ACCOUNT_ID:policy/GithubActions-AWSServicesDataFetcher-Policy \
     --version-id v1
   ```
2. Update the policy if needed (see "Updating IAM Permissions" below)

### Issue: Lambda Function Not Updating

**Symptoms:**
- Deployment succeeds but code doesn't change

**Solution:**
1. Check if there's a build cache issue:
   ```bash
   # Locally
   rm -rf .aws-sam/
   sam build --use-container
   ```

2. Force a fresh build in GitHub Actions by pushing an empty commit:
   ```bash
   git commit --allow-empty -m "chore: force rebuild"
   git push origin main
   ```

### Issue: Missing Environment Variables

**Symptoms:**
- Lambda function fails at runtime with missing config

**Solution:**
1. Check the `template.yaml` Environment Variables section
2. Verify parameters are passed correctly in deployment command
3. Check CloudFormation stack parameters:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name sam-aws-services-fetch \
     --query 'Stacks[0].Parameters'
   ```

---

## Updating IAM Permissions

When adding new AWS services or permissions to the Lambda functions, you need to update the GitHub Actions IAM policy.

### Update Process

**CRITICAL: You must update both the live policy AND the bootstrap script** (see CLAUDE.md for full explanation)

1. **Create updated policy document:**
   ```bash
   cat > updated-policy.json <<EOF
   {
     "Version": "2012-10-17",
     "Statement": [
       ... (existing permissions) ...
       {
         "Sid": "NewServiceAccess",
         "Effect": "Allow",
         "Action": [
           "newservice:Action1",
           "newservice:Action2"
         ],
         "Resource": "arn:aws:newservice:us-east-1:ACCOUNT_ID:resource/*"
       }
     ]
   }
   EOF
   ```

2. **Create new policy version:**
   ```bash
   aws iam create-policy-version \
     --policy-arn arn:aws:iam::ACCOUNT_ID:policy/GithubActions-AWSServicesDataFetcher-Policy \
     --policy-document file://updated-policy.json \
     --set-as-default
   ```

3. **Update the bootstrap script:**
   ```bash
   # Edit scripts/setup-oidc.sh
   vim scripts/setup-oidc.sh
   # Update the POLICY_DOC section with the same permissions
   ```

4. **Commit both changes together:**
   ```bash
   git add scripts/setup-oidc.sh
   git commit -m "chore: add [service] permissions to IAM policy and bootstrap script

   Synchronize live IAM policy (vX) with setup-oidc.sh bootstrap script.

   Permissions added:
   - newservice:Action1, newservice:Action2

   Rationale: Required for [feature description]
   "
   git push origin main
   ```

### Why Synchronize Both?

- **Live Policy:** Needed immediately for current deployments
- **Bootstrap Script:** Ensures future setups have correct permissions
- **Prevents Drift:** Keeps infrastructure-as-code in sync with actual resources

---

## Additional Resources

### AWS Resources

- **CloudFormation Stack:** `sam-aws-services-fetch`
- **Region:** `us-east-1`
- **S3 Bucket:** `aws-data-fetcher-output`
- **Public Data:** `https://aws-services.synepho.com/data/`

### GitHub Resources

- **Repository:** `jxman/aws-infrastructure-fetcher`
- **Workflow File:** `.github/workflows/deploy.yml`
- **Bootstrap Script:** `scripts/setup-oidc.sh`

### Documentation

- **Project README:** `README.md`
- **Developer Guide:** `CLAUDE.md`
- **Data Contract:** `DATA_CONTRACT.md`
- **Changelog:** `CHANGELOG.md`

---

## Security Best Practices

### OIDC Benefits

✅ **No long-lived credentials** - Temporary tokens only
✅ **Repository isolation** - Each repo has its own role
✅ **Audit trail** - All deployments logged via CloudTrail
✅ **Least privilege** - Minimal permissions for deployment
✅ **Automatic rotation** - Tokens expire automatically

### Monitoring

- Enable CloudTrail for all IAM and deployment activities
- Review CloudWatch alarms regularly
- Monitor SNS notifications for errors
- Audit IAM role usage monthly

### Emergency Procedures

**If OIDC role is compromised:**
1. Delete the IAM role immediately
2. Revoke the OIDC provider (if not shared)
3. Run bootstrap script to recreate with new trust policy
4. Update GitHub secret with new role ARN
5. Review CloudTrail logs for unauthorized activity

---

## Support

For issues or questions:
1. Check this deployment guide
2. Review `TROUBLESHOOTING.md` (if available)
3. Check GitHub Issues: `https://github.com/jxman/aws-infrastructure-fetcher/issues`
4. Review CloudWatch Logs for runtime errors
