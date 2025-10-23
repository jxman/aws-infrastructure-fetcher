/**
 * Local File System Storage
 * Current implementation using local filesystem
 */

const StorageInterface = require('./storage-interface');
const fs = require('fs').promises;
const path = require('path');

class LocalStorage extends StorageInterface {
  constructor(outputDir = './output') {
    super();
    this.outputDir = outputDir;
  }

  async saveRegions(data) {
    const filepath = path.join(this.outputDir, 'regions.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    return filepath;
  }

  async saveServices(data) {
    const filepath = path.join(this.outputDir, 'services.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    return filepath;
  }

  async saveComplete(data) {
    const filepath = path.join(this.outputDir, 'complete-data.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    return filepath;
  }

  async loadCache() {
    const cachePath = path.join(this.outputDir, '.cache-services-by-region.json');
    try {
      const data = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // Cache file doesn't exist
      }
      throw error;
    }
  }

  async saveCache(data) {
    const cachePath = path.join(this.outputDir, '.cache-services-by-region.json');
    await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
    console.log(`💾 Cache saved to: ${cachePath}`);
  }

  // Change tracking methods
  async loadChangeHistory() {
    const filepath = path.join(this.outputDir, 'change-history.json');
    try {
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  async saveChangeHistory(data) {
    const filepath = path.join(this.outputDir, 'change-history.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 Change history saved to: ${filepath}`);
  }

  async loadPreviousSnapshot() {
    const filepath = path.join(this.outputDir, '.previous-snapshot.json');
    try {
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  async savePreviousSnapshot(data) {
    const filepath = path.join(this.outputDir, '.previous-snapshot.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  }

  async loadServicesForChangeTracking() {
    const filepath = path.join(this.outputDir, 'services.json');
    try {
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }
}

module.exports = LocalStorage;
