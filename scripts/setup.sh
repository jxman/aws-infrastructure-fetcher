#!/bin/bash

# AWS SSM Data Fetcher - Setup Script
echo "🚀 Setting up AWS SSM Data Fetcher..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (>=18.0.0) first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Requires >= $REQUIRED_VERSION"
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check AWS credentials
echo "🔐 Checking AWS credentials..."
if command -v aws &> /dev/null; then
    aws sts get-caller-identity &> /dev/null
    if [ $? -eq 0 ]; then
        echo "✅ AWS credentials configured"
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        echo "   Account ID: $ACCOUNT_ID"
    else
        echo "⚠️  AWS credentials not configured or invalid"
        echo "   Run: aws configure"
    fi
else
    echo "⚠️  AWS CLI not installed - will use environment variables or IAM roles"
fi

# Create output directory
mkdir -p output
echo "📁 Created output directory"

echo ""
echo "🎉 Setup complete! You can now run:"
echo "   npm start                    # Fetch all data"
echo "   npm run regions              # Fetch only regions"
echo "   npm run services             # Fetch only services"
echo "   node fetch-aws-data.js --help # Show all options"
echo ""
echo "📋 Output files will be saved to: ./output/"