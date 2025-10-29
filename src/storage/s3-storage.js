/**
 * S3 Storage Implementation
 * For AWS Lambda deployment
 */

const StorageInterface = require('./storage-interface');

// Lazy-load AWS SDK clients only when S3Storage is instantiated
// This prevents requiring these packages when using LocalStorage
let S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand;

class S3Storage extends StorageInterface {
  constructor(bucketName, prefix = 'aws-data') {
    super();

    // Lazy-load S3 SDK only when S3Storage is actually used
    if (!S3Client) {
      const s3Module = require('@aws-sdk/client-s3');
      S3Client = s3Module.S3Client;
      PutObjectCommand = s3Module.PutObjectCommand;
      GetObjectCommand = s3Module.GetObjectCommand;
      CopyObjectCommand = s3Module.CopyObjectCommand;
    }

    this.s3Client = new S3Client({});
    this.bucketName = bucketName;
    this.prefix = prefix;
  }

  async saveRegions(data) {
    const key = `${this.prefix}/regions.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'generated-at': new Date().toISOString(),
        'version': '1.4.0',
        'type': 'regions'
      }
    }));

    console.log(`💾 Saved regions to: s3://${this.bucketName}/${key}`);
    return `s3://${this.bucketName}/${key}`;
  }

  async saveServices(data) {
    const key = `${this.prefix}/services.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'generated-at': new Date().toISOString(),
        'version': '1.4.0',
        'type': 'services'
      }
    }));

    console.log(`💾 Saved services to: s3://${this.bucketName}/${key}`);
    return `s3://${this.bucketName}/${key}`;
  }

  async saveComplete(data) {
    const key = `${this.prefix}/complete-data.json`;

    // Save current version
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'generated-at': new Date().toISOString(),
        'version': '1.4.0',
        'type': 'complete'
      }
    }));

    console.log(`💾 Saved complete data to: s3://${this.bucketName}/${key}`);

    // Save historical snapshot
    const timestamp = Date.now();
    const historyKey = `${this.prefix}/history/complete-data-${timestamp}.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: historyKey,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'generated-at': new Date().toISOString(),
        'version': '1.4.0',
        'type': 'historical-snapshot'
      }
    }));

    console.log(`📚 Historical snapshot saved to: s3://${this.bucketName}/${historyKey}`);

    return `s3://${this.bucketName}/${key}`;
  }

  /**
   * Distribute data files to CloudFront-backed website bucket
   * Follows the same pattern as aws-service-report-generator
   *
   * @param {string} distributionBucket - Website bucket name (e.g., www.aws-services.synepho.com)
   * @param {string} distributionPrefix - Key prefix in distribution bucket (e.g., 'data')
   * @returns {Promise<Object>} Distribution result
   */
  async distributeToWebsite(distributionBucket, distributionPrefix = 'data') {
    // Skip if not configured
    if (!distributionBucket) {
      console.log('⏭️  Distribution skipped (not configured)');
      return {
        distributed: false,
        reason: 'Distribution bucket not configured'
      };
    }

    const files = [
      'complete-data.json',
      'regions.json',
      'services.json'
    ];

    console.log('📤 Distributing data files to CloudFront-backed website bucket...');
    console.log(`   Source: s3://${this.bucketName}/${this.prefix}/`);
    console.log(`   Destination: s3://${distributionBucket}/${distributionPrefix}/`);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const file of files) {
      try {
        const sourceKey = `${this.prefix}/${file}`;
        const destinationKey = `${distributionPrefix}/${file}`;

        const command = new CopyObjectCommand({
          Bucket: distributionBucket,
          CopySource: `${this.bucketName}/${sourceKey}`,
          Key: destinationKey,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=300',  // 5 minutes (same as Excel reports)
          MetadataDirective: 'REPLACE',
          Metadata: {
            'distributed-at': new Date().toISOString(),
            'source-bucket': this.bucketName,
            'source-key': sourceKey
          }
        });

        await this.s3Client.send(command);

        console.log(`✅ Distributed: ${file}`);
        console.log(`   From: s3://${this.bucketName}/${sourceKey}`);
        console.log(`   To:   s3://${distributionBucket}/${destinationKey}`);

        results.push({
          file,
          success: true,
          destinationPath: `s3://${distributionBucket}/${destinationKey}`
        });
        successCount++;

      } catch (error) {
        console.error(`⚠️  Failed to distribute ${file}:`, error.message);
        console.error(`   This is a non-critical operation. Source data saved successfully.`);

        results.push({
          file,
          success: false,
          error: error.message,
          errorType: error.name
        });
        failureCount++;
      }
    }

    const distributionResult = {
      distributed: successCount > 0,
      distributionBucket,
      distributionPrefix,
      totalFiles: files.length,
      successCount,
      failureCount,
      results
    };

    if (successCount === files.length) {
      console.log(`✅ All ${files.length} files distributed successfully`);
    } else if (successCount > 0) {
      console.log(`⚠️  Partial distribution: ${successCount}/${files.length} files succeeded`);
    } else {
      console.error(`❌ Distribution failed for all files`);
    }

    return distributionResult;
  }


  async loadCache() {
    try {
      const key = `${this.prefix}/cache/services-by-region.json`;

      console.log(`🔍 Checking for cache in S3: ${key}`);

      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));

      const body = await response.Body.transformToString();
      const cacheData = JSON.parse(body);

      // Check if cache is still valid (24 hours)
      if (cacheData.timestamp) {
        const cacheAge = Date.now() - new Date(cacheData.timestamp).getTime();
        const cacheTTL = parseInt(process.env.CACHE_TTL) || 24 * 60 * 60 * 1000; // 24 hours

        if (cacheAge > cacheTTL) {
          console.log(`⏰ Cache expired (age: ${Math.round(cacheAge / 1000 / 60)} minutes), will refresh`);
          return null;
        }

        console.log(`✅ Valid cache found (age: ${Math.round(cacheAge / 1000 / 60)} minutes)`);
      }

      return cacheData;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.log('💭 No cache found in S3, will fetch fresh data');
        return null;
      }
      console.error('Error loading cache from S3:', error.message);
      throw error;
    }
  }

  async saveCache(data) {
    const key = `${this.prefix}/cache/services-by-region.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'cached-at': new Date().toISOString(),
        'ttl-hours': '24',
        'version': '1.4.0'
      }
    }));

    console.log(`💾 Cache saved to S3: s3://${this.bucketName}/${key}`);
  }

  // Change tracking methods
  async loadChangeHistory() {
    try {
      const key = `${this.prefix}/change-history.json`;
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));
      const body = await response.Body.transformToString();
      return JSON.parse(body);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  async saveChangeHistory(data) {
    const key = `${this.prefix}/change-history.json`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'updated-at': new Date().toISOString(),
        'type': 'change-history',
        'version': '1.6.0'
      }
    }));
    console.log(`💾 Change history saved to: s3://${this.bucketName}/${key}`);
  }

  async loadPreviousSnapshot() {
    try {
      const key = `${this.prefix}/.previous-snapshot.json`;
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));
      const body = await response.Body.transformToString();
      return JSON.parse(body);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  async savePreviousSnapshot(data) {
    const key = `${this.prefix}/.previous-snapshot.json`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'saved-at': new Date().toISOString(),
        'type': 'snapshot',
        'version': '1.6.0'
      }
    }));
  }

  async loadServicesForChangeTracking() {
    try {
      const key = `${this.prefix}/services.json`;
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));
      const body = await response.Body.transformToString();
      return JSON.parse(body);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }
}

module.exports = S3Storage;
