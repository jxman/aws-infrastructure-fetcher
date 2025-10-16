/**
 * Storage Factory
 * Creates appropriate storage instance based on environment
 */

const LocalStorage = require('./local-storage');
const S3Storage = require('./s3-storage');

class StorageFactory {
  static create(type = 'local', options = {}) {
    switch (type) {
      case 'local':
        return new LocalStorage(options.outputDir || './output');

      case 's3':
        if (!options.bucketName) {
          throw new Error('S3 storage requires bucketName option');
        }
        return new S3Storage(options.bucketName, options.prefix || 'aws-data');

      default:
        throw new Error(`Unknown storage type: ${type}`);
    }
  }
}

module.exports = StorageFactory;
