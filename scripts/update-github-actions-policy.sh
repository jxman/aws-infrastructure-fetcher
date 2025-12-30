#!/bin/bash
set -e

# Update GitHub Actions IAM Policy for Post-Deployment Testing
# This script adds permissions required for the GitHub Actions workflow to test
# Lambda functions, verify S3 files, check CloudWatch Logs, and verify SNS notifications.

POLICY_NAME="GithubActions-AWSServicesDataFetcher-Policy"
AWS_REGION="us-east-1"

echo "🔍 Fetching current policy ARN..."
POLICY_ARN=$(aws iam list-policies \
  --scope Local \
  --query "Policies[?PolicyName=='${POLICY_NAME}'].Arn" \
  --output text)

if [ -z "$POLICY_ARN" ]; then
  echo "❌ Policy ${POLICY_NAME} not found!"
  exit 1
fi

echo "✅ Found policy: ${POLICY_ARN}"

echo "📋 Fetching current policy version..."
CURRENT_VERSION=$(aws iam get-policy \
  --policy-arn "${POLICY_ARN}" \
  --query 'Policy.DefaultVersionId' \
  --output text)

echo "Current version: ${CURRENT_VERSION}"

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🔧 Creating new policy version with post-deployment testing permissions..."

# Create the new policy document with added permissions
cat > /tmp/github-actions-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationAccess",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:ValidateTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ListStacks",
        "cloudformation:TagResource",
        "cloudformation:UntagResource",
        "cloudformation:ListTagsForResource"
      ],
      "Resource": [
        "arn:aws:cloudformation:${AWS_REGION}:${AWS_ACCOUNT_ID}:stack/sam-aws-services-fetch/*",
        "arn:aws:cloudformation:${AWS_REGION}:${AWS_ACCOUNT_ID}:stack/aws-sam-cli-managed-default/*"
      ]
    },
    {
      "Sid": "LambdaAccess",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:ListFunctions",
        "lambda:ListVersionsByFunction",
        "lambda:PublishVersion",
        "lambda:CreateAlias",
        "lambda:UpdateAlias",
        "lambda:DeleteAlias",
        "lambda:GetAlias",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:InvokeFunction",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:ListTags"
      ],
      "Resource": [
        "arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:aws-data-fetcher*",
        "arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:aws-whats-new-fetcher*"
      ]
    },
    {
      "Sid": "IAMRoleAccess",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListRoleTags"
      ],
      "Resource": [
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/sam-aws-services-fetch-*"
      ]
    },
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:GetBucketVersioning",
        "s3:PutBucketVersioning",
        "s3:GetBucketNotification",
        "s3:PutBucketNotification",
        "s3:GetBucketTagging",
        "s3:PutBucketTagging",
        "s3:GetBucketLifecycleConfiguration",
        "s3:PutBucketLifecycleConfiguration",
        "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetObject",
        "s3:HeadObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectVersion",
        "s3:DeleteObjectVersion",
        "s3:ListBucketVersions"
      ],
      "Resource": [
        "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*",
        "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*/*",
        "arn:aws:s3:::aws-data-fetcher-output",
        "arn:aws:s3:::aws-data-fetcher-output/*",
        "arn:aws:s3:::www.aws-services.synepho.com",
        "arn:aws:s3:::www.aws-services.synepho.com/*"
      ]
    },
    {
      "Sid": "SNSAccess",
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:DeleteTopic",
        "sns:GetTopicAttributes",
        "sns:SetTopicAttributes",
        "sns:Subscribe",
        "sns:Unsubscribe",
        "sns:TagResource",
        "sns:UntagResource",
        "sns:ListTagsForResource"
      ],
      "Resource": "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:aws-data-fetcher-*"
    },
    {
      "Sid": "CloudWatchLogsAccess",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:PutRetentionPolicy",
        "logs:DeleteRetentionPolicy",
        "logs:TagLogGroup",
        "logs:UntagLogGroup",
        "logs:TagResource",
        "logs:UntagResource",
        "logs:ListTagsForResource",
        "logs:ListTagsLogGroup"
      ],
      "Resource": [
        "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:/aws/lambda/aws-data-fetcher*",
        "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:/aws/lambda/aws-whats-new-fetcher*"
      ]
    },
    {
      "Sid": "CloudWatchAlarmsAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:TagResource",
        "cloudwatch:UntagResource",
        "cloudwatch:ListTagsForResource"
      ],
      "Resource": [
        "arn:aws:cloudwatch:${AWS_REGION}:${AWS_ACCOUNT_ID}:alarm:aws-data-fetcher-*",
        "arn:aws:cloudwatch:${AWS_REGION}:${AWS_ACCOUNT_ID}:alarm:aws-whats-new-fetcher-*"
      ]
    },
    {
      "Sid": "CloudWatchMetricsAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "${AWS_REGION}"
        }
      }
    },
    {
      "Sid": "EventBridgeAccess",
      "Effect": "Allow",
      "Action": [
        "events:PutRule",
        "events:DeleteRule",
        "events:DescribeRule",
        "events:PutTargets",
        "events:RemoveTargets",
        "events:TagResource",
        "events:UntagResource",
        "events:ListTagsForResource"
      ],
      "Resource": [
        "arn:aws:events:${AWS_REGION}:${AWS_ACCOUNT_ID}:rule/aws-data-fetcher-*"
      ]
    },
    {
      "Sid": "IAMPolicyAccess",
      "Effect": "Allow",
      "Action": [
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:ListPolicyVersions",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion"
      ],
      "Resource": "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/sam-aws-services-fetch-*"
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations"
      ],
      "Resource": "arn:aws:cloudfront::${AWS_ACCOUNT_ID}:distribution/EBTYLWOK3WVOK"
    },
    {
      "Sid": "KMSAccess",
      "Effect": "Allow",
      "Action": [
        "kms:CreateKey",
        "kms:DescribeKey",
        "kms:GetKeyPolicy",
        "kms:PutKeyPolicy",
        "kms:EnableKeyRotation",
        "kms:DisableKeyRotation",
        "kms:GetKeyRotationStatus",
        "kms:ScheduleKeyDeletion",
        "kms:CancelKeyDeletion",
        "kms:TagResource",
        "kms:UntagResource",
        "kms:ListResourceTags",
        "kms:CreateAlias",
        "kms:DeleteAlias",
        "kms:UpdateAlias",
        "kms:ListAliases"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "${AWS_REGION}"
        }
      }
    }
  ]
}
EOF

echo "📤 Creating new policy version..."
aws iam create-policy-version \
  --policy-arn "${POLICY_ARN}" \
  --policy-document file:///tmp/github-actions-policy.json \
  --set-as-default

echo "✅ Policy updated successfully!"

echo "🧹 Cleaning up old policy versions (keeping last 5)..."
# AWS allows max 5 policy versions, so clean up old ones
VERSIONS=$(aws iam list-policy-versions \
  --policy-arn "${POLICY_ARN}" \
  --query 'Versions[?!IsDefaultVersion].VersionId' \
  --output text)

VERSION_COUNT=$(echo "$VERSIONS" | wc -w)
if [ "$VERSION_COUNT" -gt 4 ]; then
  OLDEST_VERSION=$(echo "$VERSIONS" | awk '{print $NF}')
  echo "Deleting oldest version: ${OLDEST_VERSION}"
  aws iam delete-policy-version \
    --policy-arn "${POLICY_ARN}" \
    --version-id "${OLDEST_VERSION}"
fi

echo ""
echo "✅ GitHub Actions IAM policy updated with post-deployment testing permissions!"
echo ""
echo "Added permissions:"
echo "  - s3:HeadObject (for S3 file verification)"
echo "  - logs:DescribeLogStreams, logs:GetLogEvents (for CloudWatch Logs verification)"
echo "  - cloudwatch:GetMetricStatistics, cloudwatch:ListMetrics (for SNS metrics verification)"
echo ""
echo "The workflow will now be able to:"
echo "  1. Invoke Lambda functions for testing"
echo "  2. Verify S3 output files are created"
echo "  3. Check CloudWatch Logs for successful execution"
echo "  4. Verify SNS notifications are sent"

rm /tmp/github-actions-policy.json
