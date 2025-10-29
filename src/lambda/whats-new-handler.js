/**
 * AWS What's New RSS Feed Fetcher - Lambda Handler
 *
 * Fetches latest 20 AWS announcements from official RSS feed
 * Runs daily at 3 AM UTC
 *
 * @see src/core/whats-new-fetcher.js for business logic
 */

const WhatsNewFetcher = require('../core/whats-new-fetcher');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const s3Client = new S3Client({});
const snsClient = new SNSClient({});

/**
 * Save data to S3 distribution bucket
 */
async function saveToS3(data, bucketName, key) {
  if (!bucketName) {
    console.log('⏭️  Distribution bucket not configured, skipping S3 save');
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300', // 5 minutes
      Metadata: {
        'generated-at': new Date().toISOString(),
        'source': 'aws-whats-new-fetcher',
        'version': '1.0.0'
      }
    });

    await s3Client.send(command);

    const s3Path = `s3://${bucketName}/${key}`;
    console.log(`💾 Saved to S3: ${s3Path}`);
    console.log(`🕐 CloudFront cache will refresh automatically within 5 minutes (TTL: 300s)`);

    return s3Path;

  } catch (error) {
    console.error('⚠️  Failed to save to S3:', error.message);
    throw error;
  }
}

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
    console.log('📧 SNS notification sent successfully');
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
    rssUrl: process.env.RSS_FEED_URL,
    outputLimit: process.env.OUTPUT_LIMIT,
    sourceBucket: process.env.S3_BUCKET_NAME,
    distributionBucket: process.env.DISTRIBUTION_BUCKET
  });

  try {
    // Create fetcher with configuration from environment
    const rssUrl = process.env.RSS_FEED_URL || 'https://aws.amazon.com/about-aws/whats-new/recent/feed/';
    const outputLimit = parseInt(process.env.OUTPUT_LIMIT || '20', 10);

    const fetcher = new WhatsNewFetcher(rssUrl, outputLimit);

    // Fetch and parse RSS feed
    const data = await fetcher.run();

    // Save to BOTH buckets for consistency
    const sourceBucket = process.env.S3_BUCKET_NAME;
    const sourcePrefix = process.env.S3_PREFIX || 'aws-data';
    const distributionBucket = process.env.DISTRIBUTION_BUCKET;
    const distributionPrefix = process.env.DISTRIBUTION_PREFIX || 'data';

    // Save to source bucket (for consistency with infrastructure fetcher)
    let sourcePath = null;
    if (sourceBucket) {
      const sourceKey = `${sourcePrefix}/aws-whats-new.json`;
      sourcePath = await saveToS3(data, sourceBucket, sourceKey);
    }

    // Save to distribution bucket (for public access)
    const distributionKey = `${distributionPrefix}/aws-whats-new.json`;
    const distributionPath = await saveToS3(data, distributionBucket, distributionKey);

    const duration = Date.now() - startTime;
    const durationSec = Math.round(duration / 1000);

    console.log('Fetch completed successfully', {
      announcements: data.announcements.length,
      feedBuildDate: data.metadata.feedLastBuildDate,
      duration: `${durationSec}s`,
      sourcePath,
      distributionPath,
      requestId: context.requestId
    });

    // Send success notification
    const publicUrl = distributionBucket
      ? `https://aws-services.synepho.com/${distributionPrefix}/aws-whats-new.json`
      : 'Not configured';

    const successMessage = `
✅ AWS What's New Fetcher completed successfully!

📊 Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Announcements Fetched: ${data.announcements.length}
Feed Build Date: ${data.metadata.feedLastBuildDate}
Execution Time: ${durationSec}s
Request ID: ${context.requestId}

📁 S3 Storage:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Source Bucket: ${sourcePath || 'Not configured'}
Distribution Bucket: ${distributionPath || 'Not saved'}
Public URL: ${publicUrl}
Cache TTL: 5 minutes (automatic refresh)

📰 Latest Announcements:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.announcements.slice(0, 5).map((item, i) =>
  `${i + 1}. ${item.title}\n   ${item.pubDateFormatted} | ${item.categories.join(', ')}`
).join('\n\n')}

... and ${data.announcements.length - 5} more announcements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Data successfully published!
`.trim();

    await sendNotification(
      `✅ AWS What's New Fetcher Success - ${durationSec}s`,
      successMessage
    );

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'AWS What\'s New data fetch completed successfully',
        result: {
          metadata: data.metadata,
          count: data.announcements.length,
          feedBuildDate: data.metadata.feedLastBuildDate,
          duration: `${durationSec}s`,
          s3Paths: {
            source: sourcePath,
            distribution: distributionPath
          },
          publicUrl,
          cacheTTL: '300s (5 minutes)'
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
❌ AWS What's New Fetcher execution failed!

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
https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || 'us-east-1'}#logsV2:log-groups/log-group/$252Faws$252Flambda$252Faws-whats-new-fetcher

Common Issues:
• Check RSS feed URL is accessible
• Verify S3 bucket permissions
• Review Lambda timeout settings
• Check network connectivity
`.trim();

    await sendNotification(
      `❌ AWS What's New Fetcher Error - ${error.message}`,
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
