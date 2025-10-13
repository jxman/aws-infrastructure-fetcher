/**
 * S3 Storage Implementation
 * For AWS Lambda deployment
 */

const StorageInterface = require('./storage-interface');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

class S3Storage extends StorageInterface {
  constructor(bucketName, prefix = 'aws-data') {
    super();
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
}

module.exports = S3Storage;
