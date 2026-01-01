#!/bin/bash

#############################################################################
# GitHub Actions OIDC Setup Script for AWS Infrastructure Data Fetcher
#
# This script creates the necessary AWS IAM resources for GitHub Actions
# to deploy the SAM application using OIDC authentication.
#
# Resources created:
# - OIDC Provider for GitHub Actions (shared if already exists)
# - IAM Role for GitHub Actions
# - IAM Policy with required permissions
#
# Usage:
#   ./scripts/setup-oidc.sh              # Initial setup (create all resources)
#   ./scripts/setup-oidc.sh --update-policy  # Update existing IAM policy only
#   ./scripts/setup-oidc.sh --help       # Show help
#############################################################################

set -e  # Exit on error

# Parse command line arguments
UPDATE_POLICY_ONLY=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --update-policy)
            UPDATE_POLICY_ONLY=true
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Show help if requested
if [ "$SHOW_HELP" = true ]; then
    cat <<EOF
GitHub Actions OIDC Setup Script

Usage:
  ./scripts/setup-oidc.sh [OPTIONS]

Options:
  (none)           Run initial setup - creates OIDC provider, IAM role, and policy
  --update-policy  Update the existing IAM policy with new permissions
  --help, -h       Show this help message

Examples:
  # Initial setup (first time)
  ./scripts/setup-oidc.sh

  # Update IAM policy after permissions change
  ./scripts/setup-oidc.sh --update-policy

Notes:
  - Initial setup is interactive and prompts for GitHub repository
  - Update mode finds and updates the existing policy automatically
  - AWS credentials must be configured before running
  - Requires: aws-cli, jq
EOF
    exit 0
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project-specific names
PROJECT_NAME="AWSServicesDataFetcher"
ROLE_NAME="GithubActionsOIDC-${PROJECT_NAME}-Role"
POLICY_NAME="GithubActions-${PROJECT_NAME}-Policy"
OIDC_PROVIDER_URL="token.actions.githubusercontent.com"

# GitHub OIDC thumbprints (official from GitHub)
# Source: https://github.blog/changelog/2023-06-27-github-actions-update-on-oidc-integration-with-aws/
THUMBPRINT_1="6938fd4d98bab03faadb97b34396831e3780aea1"
THUMBPRINT_2="1c58a3a8518e8759bf075b76b750d4f2df264fcd"

#############################################################################
# Helper Functions
#############################################################################

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

#############################################################################
# Prerequisites Check
#############################################################################

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    print_success "AWS CLI found: $(aws --version)"

    # Check jq (for JSON parsing)
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed. Please install it first."
        echo "  macOS: brew install jq"
        echo "  Linux: sudo apt-get install jq"
        exit 1
    fi
    print_success "jq found: $(jq --version)"

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured or invalid."
        exit 1
    fi
    print_success "AWS credentials configured"
}

#############################################################################
# Get User Inputs
#############################################################################

get_inputs() {
    print_header "Configuration"

    # Get AWS Account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_info "AWS Account ID: $AWS_ACCOUNT_ID"

    # Get AWS Region
    AWS_REGION=$(aws configure get region || echo "us-east-1")
    read -p "AWS Region [$AWS_REGION]: " INPUT_REGION
    AWS_REGION=${INPUT_REGION:-$AWS_REGION}
    print_info "AWS Region: $AWS_REGION"

    # Get GitHub Repository
    echo ""
    read -p "GitHub Repository (format: owner/repo): " GITHUB_REPO
    # Trim whitespace
    GITHUB_REPO=$(echo "$GITHUB_REPO" | xargs)
    if [[ ! "$GITHUB_REPO" =~ ^[a-zA-Z0-9_-]+/[a-zA-Z0-9._-]+$ ]]; then
        print_error "Invalid repository format. Must be 'owner/repo'"
        exit 1
    fi
    print_info "GitHub Repository: $GITHUB_REPO"

    # Confirm
    echo ""
    print_warning "About to create the following resources:"
    echo "  - OIDC Provider: $OIDC_PROVIDER_URL (shared, if not exists)"
    echo "  - IAM Role: $ROLE_NAME"
    echo "  - IAM Policy: $POLICY_NAME"
    echo "  - For Repository: $GITHUB_REPO"
    echo ""
    read -p "Continue? (yes/no): " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        print_info "Setup cancelled."
        exit 0
    fi
}

#############################################################################
# Create OIDC Provider
#############################################################################

create_oidc_provider() {
    print_header "Creating OIDC Provider"

    # Check if provider already exists
    PROVIDER_ARN=$(aws iam list-open-id-connect-providers --output json | \
        jq -r ".OpenIDConnectProviderList[] | select(.Arn | contains(\"$OIDC_PROVIDER_URL\")) | .Arn" || echo "")

    if [[ -n "$PROVIDER_ARN" ]]; then
        print_warning "OIDC Provider already exists: $PROVIDER_ARN"
        print_info "This provider can be shared across multiple repositories"
    else
        PROVIDER_ARN=$(aws iam create-open-id-connect-provider \
            --url "https://$OIDC_PROVIDER_URL" \
            --client-id-list "sts.amazonaws.com" \
            --thumbprint-list "$THUMBPRINT_1" "$THUMBPRINT_2" \
            --tags "Key=Environment,Value=prod" \
                   "Key=ManagedBy,Value=bootstrap-script" \
                   "Key=Owner,Value=John Xanthopoulos" \
                   "Key=Project,Value=aws-services" \
                   "Key=Service,Value=aws-infrastructure-data-fetcher" \
                   "Key=GithubRepo,Value=github.com/jxman/aws-infrastructure-fetcher" \
                   "Key=Name,Value=GitHubActionsOIDC-Shared" \
                   "Key=SubService,Value=github-oidc-provider" \
            --query 'OpenIDConnectProviderArn' \
            --output text)
        print_success "OIDC Provider created: $PROVIDER_ARN"
    fi
}

#############################################################################
# Create IAM Policy
#############################################################################

create_iam_policy() {
    print_header "Creating IAM Policy"

    # Load policy document from template file
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    POLICY_TEMPLATE="$SCRIPT_DIR/iam-policy-template.json"

    if [[ ! -f "$POLICY_TEMPLATE" ]]; then
        print_error "Policy template not found: $POLICY_TEMPLATE"
        exit 1
    fi

    # Read template and substitute variables
    POLICY_DOC=$(cat "$POLICY_TEMPLATE" | \
        sed "s/\${AWS_REGION}/$AWS_REGION/g" | \
        sed "s/\${AWS_ACCOUNT_ID}/$AWS_ACCOUNT_ID/g")

    # Check if policy already exists
    POLICY_ARN=$(aws iam list-policies --scope Local --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" --output text || echo "")

    if [[ -n "$POLICY_ARN" ]]; then
        print_warning "IAM Policy already exists: $POLICY_ARN"
        print_info "To update the policy, run: ./scripts/setup-oidc.sh --update-policy"
    else
        POLICY_ARN=$(aws iam create-policy \
            --policy-name "$POLICY_NAME" \
            --policy-document "$POLICY_DOC" \
            --description "Policy for GitHub Actions to deploy AWS Infrastructure Data Fetcher SAM application" \
            --tags "Key=Environment,Value=prod" \
                   "Key=ManagedBy,Value=bootstrap-script" \
                   "Key=Owner,Value=John Xanthopoulos" \
                   "Key=Project,Value=aws-services" \
                   "Key=Service,Value=aws-infrastructure-data-fetcher" \
                   "Key=GithubRepo,Value=github.com/jxman/aws-infrastructure-fetcher" \
                   "Key=Name,Value=$POLICY_NAME" \
                   "Key=SubService,Value=github-actions-policy" \
            --query 'Policy.Arn' \
            --output text)
        print_success "IAM Policy created: $POLICY_ARN"
    fi
}

#############################################################################
# Update IAM Policy (creates new version)
#############################################################################

update_iam_policy() {
    print_header "Updating IAM Policy"

    # Load policy document from template file (same as create_iam_policy)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    POLICY_TEMPLATE="$SCRIPT_DIR/iam-policy-template.json"

    if [[ ! -f "$POLICY_TEMPLATE" ]]; then
        print_error "Policy template not found: $POLICY_TEMPLATE"
        exit 1
    fi

    # Read template and substitute variables
    POLICY_DOC=$(cat "$POLICY_TEMPLATE" | \
        sed "s/\${AWS_REGION}/$AWS_REGION/g" | \
        sed "s/\${AWS_ACCOUNT_ID}/$AWS_ACCOUNT_ID/g")

    # Find existing policy
    POLICY_ARN=$(aws iam list-policies --scope Local --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" --output text || echo "")

    if [[ -z "$POLICY_ARN" ]]; then
        print_error "Policy $POLICY_NAME not found!"
        print_info "Run './scripts/setup-oidc.sh' first to create the policy"
        exit 1
    fi

    print_info "Found policy: $POLICY_ARN"

    # Get current version
    CURRENT_VERSION=$(aws iam get-policy --policy-arn "$POLICY_ARN" --query 'Policy.DefaultVersionId' --output text)
    print_info "Current version: $CURRENT_VERSION"

    # Create new policy version
    print_info "Creating new policy version..."
    NEW_VERSION=$(aws iam create-policy-version \
        --policy-arn "$POLICY_ARN" \
        --policy-document "$POLICY_DOC" \
        --set-as-default \
        --query 'PolicyVersion.VersionId' \
        --output text)

    print_success "Created new policy version: $NEW_VERSION (set as default)"

    # Clean up old versions (AWS allows max 5 versions)
    print_info "Cleaning up old policy versions..."
    VERSIONS=$(aws iam list-policy-versions \
        --policy-arn "$POLICY_ARN" \
        --query 'Versions[?!IsDefaultVersion].VersionId' \
        --output text)

    VERSION_COUNT=$(echo "$VERSIONS" | wc -w)
    if [ "$VERSION_COUNT" -gt 4 ]; then
        OLDEST_VERSION=$(echo "$VERSIONS" | awk '{print $NF}')
        print_info "Deleting oldest version: $OLDEST_VERSION"
        aws iam delete-policy-version \
            --policy-arn "$POLICY_ARN" \
            --version-id "$OLDEST_VERSION"
        print_success "Deleted old version: $OLDEST_VERSION"
    else
        print_info "No cleanup needed (${VERSION_COUNT} old versions)"
    fi

    print_success "Policy updated successfully!"
    echo ""
    print_info "Summary of changes:"
    echo "  - Added s3:HeadObject for S3 file verification"
    echo "  - Added logs:DescribeLogStreams, logs:GetLogEvents for CloudWatch Logs"
    echo "  - Added cloudwatch:GetMetricStatistics for SNS metrics verification"
    echo "  - Added cloudformation:GetTemplateSummary for SAM deployments"
}

#############################################################################
# Create IAM Role
#############################################################################

create_iam_role() {
    print_header "Creating IAM Role"

    # Create trust policy
    TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$PROVIDER_ARN"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF
)

    # Check if role already exists
    ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || echo "")

    if [[ -n "$ROLE_ARN" ]]; then
        print_warning "IAM Role already exists: $ROLE_ARN"
        # Update trust policy in case repository changed
        aws iam update-assume-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-document "$TRUST_POLICY"
        print_success "Updated trust policy for existing role"
    else
        ROLE_ARN=$(aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document "$TRUST_POLICY" \
            --description "Role for GitHub Actions to deploy AWS Infrastructure Data Fetcher SAM application" \
            --tags "Key=Environment,Value=prod" \
                   "Key=ManagedBy,Value=bootstrap-script" \
                   "Key=Owner,Value=John Xanthopoulos" \
                   "Key=Project,Value=aws-services" \
                   "Key=Service,Value=aws-infrastructure-data-fetcher" \
                   "Key=GithubRepo,Value=github.com/jxman/aws-infrastructure-fetcher" \
                   "Key=Name,Value=$ROLE_NAME" \
                   "Key=SubService,Value=github-actions-role" \
            --query 'Role.Arn' \
            --output text)
        print_success "IAM Role created: $ROLE_ARN"
    fi
}

#############################################################################
# Attach Policy to Role
#############################################################################

attach_policy() {
    print_header "Attaching Policy to Role"

    # Check if already attached
    ATTACHED=$(aws iam list-attached-role-policies --role-name "$ROLE_NAME" --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN'].PolicyArn" --output text || echo "")

    if [[ -n "$ATTACHED" ]]; then
        print_warning "Policy already attached to role"
    else
        aws iam attach-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-arn "$POLICY_ARN"
        print_success "Policy attached to role"
    fi
}

#############################################################################
# Display Summary
#############################################################################

display_summary() {
    print_header "Setup Complete!"

    echo -e "${GREEN}✓ OIDC Provider created/verified${NC}"
    echo -e "${GREEN}✓ IAM Role created/verified${NC}"
    echo -e "${GREEN}✓ IAM Policy created/verified${NC}"
    echo -e "${GREEN}✓ Policy attached to role${NC}"
    echo ""

    print_header "Next Steps"

    echo "1. Add the following secret to your GitHub repository:"
    echo ""
    echo -e "   ${BLUE}Secret Name:${NC}  AWS_ROLE_ARN"
    echo -e "   ${BLUE}Secret Value:${NC} $ROLE_ARN"
    echo ""
    echo "2. Navigate to your repository settings:"
    echo -e "   ${BLUE}https://github.com/${GITHUB_REPO}/settings/secrets/actions${NC}"
    echo ""
    echo "3. Click 'New repository secret' and add the above values"
    echo ""
    echo "4. Push your code to trigger the GitHub Actions workflow"
    echo ""

    print_info "Role ARN saved to: scripts/oidc-role-arn.txt"
    echo "$ROLE_ARN" > scripts/oidc-role-arn.txt
}

#############################################################################
# Main Execution
#############################################################################

main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  GitHub Actions OIDC Setup for AWS Services Data Fetcher  ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    check_prerequisites

    if [ "$UPDATE_POLICY_ONLY" = true ]; then
        # Update mode: only update the IAM policy
        print_info "Running in UPDATE POLICY mode"
        echo ""

        # Get AWS region and account (needed for policy document)
        AWS_REGION=${AWS_REGION:-"us-east-1"}
        AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

        update_iam_policy

        print_header "Update Complete!"
        print_success "IAM policy has been updated with the latest permissions"
        echo ""
        print_info "The GitHub Actions workflow can now:"
        echo "  - Invoke Lambda functions for testing"
        echo "  - Verify S3 output files"
        echo "  - Read CloudWatch Logs"
        echo "  - Check SNS metrics"
        echo ""
    else
        # Full setup mode: create all resources
        get_inputs
        create_oidc_provider
        create_iam_policy
        create_iam_role
        attach_policy
        display_summary
    fi
}

# Run main function
main
