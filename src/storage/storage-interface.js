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

  // Change tracking methods
  async loadChangeHistory() {
    throw new Error('loadChangeHistory() not implemented');
  }

  async saveChangeHistory(data) {
    throw new Error('saveChangeHistory() not implemented');
  }

  async loadPreviousSnapshot() {
    throw new Error('loadPreviousSnapshot() not implemented');
  }

  async savePreviousSnapshot(data) {
    throw new Error('savePreviousSnapshot() not implemented');
  }

  async loadServicesForChangeTracking() {
    throw new Error('loadServicesForChangeTracking() not implemented');
  }
}

module.exports = StorageInterface;
