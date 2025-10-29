/**
 * AWS Lambda Handler
 * Entry point for Lambda function invocations
 */

const AWSDataFetcher = require('../core/aws-data-fetcher');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const snsClient = new SNSClient({});

/**
 * Send SNS notification
 */
async function sendNotification(subject, message) {
  const topicArn = process.env.SNS_TOPIC_ARN;

  if (!topicArn) {
    console.log('SNS_TOPIC_ARN not configured, skipping notification');
    return;
  }

  try {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: message
    });

    await snsClient.send(command);
    console.log('SNS notification sent successfully');
  } catch (error) {
    console.error('Failed to send SNS notification:', error.message);
    // Don't throw - notification failure shouldn't break the function
  }
}

exports.handler = async (event, context) => {
  const startTime = Date.now();

  console.log('Lambda invoked', {
    event,
    requestId: context.requestId,
    batchSize: process.env.BATCH_SIZE,
    paginationDelay: process.env.PAGINATION_DELAY,
    s3Bucket: process.env.S3_BUCKET_NAME,
    storageType: process.env.STORAGE_TYPE
  });

  try {
    // Parse options from event
    const options = {
      regionsOnly: event.regionsOnly || false,
      servicesOnly: event.servicesOnly || false,
      includeServiceMapping: event.includeServiceMapping !== false, // Default to true
      forceRefresh: event.forceRefresh || false,
      region: event.region || process.env.AWS_REGION || 'us-east-1'
    };

    console.log('Fetch options:', options);

    // Create fetcher (storage configured via environment variables)
    const fetcher = new AWSDataFetcher(options.region);

    console.log('Starting fetch with config:', {
      batchSize: fetcher.batchSize,
      paginationDelay: fetcher.paginationDelay,
      cacheTTL: fetcher.cacheTTL,
      storageType: process.env.STORAGE_TYPE
    });

    // Run the fetch
    const result = await fetcher.run(options);

    const duration = Date.now() - startTime;
    const durationSec = Math.round(duration / 1000);

    console.log('Fetch completed successfully', {
      regions: result.regions?.count,
      services: result.services?.count,
      duration: `${durationSec}s`,
      requestId: context.requestId
    });

    // Distribute to CloudFront-backed website bucket (non-critical)
    let distributionResult = null;

    try {
      console.log('📤 Starting distribution to website bucket...');

      distributionResult = await fetcher.storage.distributeToWebsite(
        process.env.DISTRIBUTION_BUCKET,
        process.env.DISTRIBUTION_PREFIX || 'data'
      );

      if (distributionResult.distributed) {
        console.log(`✅ Distribution complete: ${distributionResult.successCount}/${distributionResult.totalFiles} files`);
        console.log(`🕐 CloudFront cache will refresh automatically within 5 minutes (TTL: 300s)`);
      } else {
        console.log(`⏭️  Distribution skipped: ${distributionResult.reason || 'Unknown reason'}`);
      }
    } catch (distributionError) {
      // Non-critical error - don't fail the Lambda
      console.error('⚠️  Distribution failed (non-critical):', distributionError.message);
      console.error('   Source data saved successfully. Distribution can be retried manually.');

      distributionResult = {
        distributed: false,
        error: distributionError.message,
        errorType: distributionError.name
      };
    }

    // Calculate cumulative services across all regions
    let cumulativeServices = 0;
    if (result.servicesByRegion?.byRegion) {
      cumulativeServices = Object.values(result.servicesByRegion.byRegion)
        .reduce((sum, region) => sum + (region.serviceCount || 0), 0);
    }

    // Send success notification
    const successMessage = `
✅ AWS Data Fetcher completed successfully!

📊 Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Regions Discovered: ${result.regions?.count || 'N/A'}
Unique Services: ${result.services?.count || 'N/A'}
Cumulative Services: ${cumulativeServices.toLocaleString()} (across all regions)
Execution Time: ${durationSec}s
Request ID: ${context.requestId}

📁 S3 Storage Paths:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Regions Data: ${result.regionPath || 'N/A'}
Services Data: ${result.servicePath || 'N/A'}
Complete Dataset: ${result.completePath || 'N/A'}

🗺️  Service Mapping Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Regions Processed: ${result.servicesByRegion?.summary?.totalRegions || 'N/A'}
Average Services/Region: ${result.servicesByRegion?.summary?.averageServicesPerRegion || 'N/A'}
Cached Regions: ${result.servicesByRegion?.summary?.cachedRegions || 0}
Freshly Fetched: ${result.servicesByRegion?.summary?.fetchedRegions || 0}

📤 Distribution Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${distributionResult?.distributed
  ? `✅ Distributed: ${distributionResult.successCount}/${distributionResult.totalFiles} files
Distribution Bucket: ${distributionResult.distributionBucket}
Public URL: https://aws-services.synepho.com/${distributionResult.distributionPrefix}/
CloudFront Cache: Automatic refresh (TTL: 5 minutes)`
  : `⏭️  Distribution skipped: ${distributionResult?.reason || 'Not configured'}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All data successfully stored in S3!
`.trim();

    await sendNotification(
      `✅ AWS Data Fetcher Success - ${durationSec}s`,
      successMessage
    );

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Data fetch completed successfully',
        result: {
          metadata: result.metadata,
          regions: result.regions ? result.regions.count : undefined,
          services: result.services ? result.services.count : undefined,
          duration: `${durationSec}s`,
          s3Paths: {
            regions: result.regionPath,
            services: result.servicePath,
            complete: result.completePath
          },
          distribution: distributionResult ? {
            distributed: distributionResult.distributed,
            successCount: distributionResult.successCount,
            totalFiles: distributionResult.totalFiles,
            distributionBucket: distributionResult.distributionBucket,
            distributionPrefix: distributionResult.distributionPrefix,
            cacheTTL: '300s (5 minutes)'
          } : undefined
        },
        requestId: context.requestId
      })
    };

  } catch (error) {
    console.error('Lambda execution failed', {
      error: error.message,
      stack: error.stack,
      requestId: context.requestId
    });

    // Send error notification
    const duration = Date.now() - startTime;
    const durationSec = Math.round(duration / 1000);

    const errorMessage = `
❌ AWS Data Fetcher execution failed!

🚨 Error Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error Message: ${error.message}
Error Type: ${error.name || 'Unknown'}
Request ID: ${context.requestId}
Duration Before Failure: ${durationSec}s

📋 Stack Trace:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${error.stack || 'N/A'}

🔍 Troubleshooting:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CloudWatch Logs:
https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || 'us-east-1'}#logsV2:log-groups/log-group/$252Faws$252Flambda$252Faws-data-fetcher

Common Issues:
• Check IAM permissions (SSM, S3, SNS)
• Verify S3 bucket exists and is accessible
• Review Lambda timeout settings
• Check AWS service quotas and rate limits
`.trim();

    await sendNotification(
      `❌ AWS Data Fetcher Error - ${error.message}`,
      errorMessage
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        requestId: context.requestId
      })
    };
  }
};
