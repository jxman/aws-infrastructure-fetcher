/**
 * Storage Interface
 * Base class for storage implementations (local, S3, etc.)
 */

class StorageInterface {
  async saveRegions(data) {
    throw new Error('saveRegions() not implemented');
  }

  async saveServices(data) {
    throw new Error('saveServices() not implemented');
  }

  async saveComplete(data) {
    throw new Error('saveComplete() not implemented');
  }

  async loadCache() {
    throw new Error('loadCache() not implemented');
  }

  async saveCache(data) {
    throw new Error('saveCache() not implemented');
  }
}

module.exports = StorageInterface;
