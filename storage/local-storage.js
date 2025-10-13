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
}

module.exports = LocalStorage;
