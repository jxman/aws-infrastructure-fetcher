/**
 * Change Tracker - AWS Infrastructure Change Detection
 *
 * Tracks new regions, services, and regional service availability over time.
 * Designed to handle multiple runs per day without duplicating changelog entries.
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

class ChangeTracker {
    constructor(outputDir = './output') {
        this.outputDir = outputDir;
        this.changeHistoryFile = path.join(outputDir, 'change-history.json');
        this.previousSnapshotFile = path.join(outputDir, '.previous-snapshot.json');
    }

    /**
     * Get current date in YYYY-MM-DD format (no time component)
     */
    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Format AWS launch date to YYYY-MM-DD
     */
    formatLaunchDate(launchDateString) {
        if (!launchDateString) return null;
        try {
            const date = new Date(launchDateString);
            return date.toISOString().split('T')[0];
        } catch (error) {
            return null;
        }
    }

    /**
     * Load change history from file, or create initial structure
     */
    async loadChangeHistory() {
        try {
            const data = await fs.readFile(this.changeHistoryFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, return empty structure
                return this.createEmptyChangeHistory();
            }
            throw error;
        }
    }

    /**
     * Create empty change history structure
     */
    createEmptyChangeHistory() {
        return {
            metadata: {
                created: this.getTodayDate(),
                lastUpdated: this.getTodayDate(),
                totalRegions: 0,
                totalServices: 0,
                totalRegionalServices: 0,
                changesSinceInception: {
                    newRegions: 0,
                    newServices: 0,
                    newRegionalServices: 0
                }
            },
            regions: {},
            services: {},
            regionalServices: {},
            changeLog: []
        };
    }

    /**
     * Load previous snapshot from file
     */
    async loadPreviousSnapshot() {
        try {
            const data = await fs.readFile(this.previousSnapshotFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null; // No previous snapshot exists
            }
            throw error;
        }
    }

    /**
     * Save current data as previous snapshot for next run
     */
    async savePreviousSnapshot(currentData) {
        await fs.writeFile(
            this.previousSnapshotFile,
            JSON.stringify(currentData, null, 2)
        );
    }

    /**
     * Save change history to file
     */
    async saveChangeHistory(changeHistory) {
        await fs.writeFile(
            this.changeHistoryFile,
            JSON.stringify(changeHistory, null, 2)
        );
    }

    /**
     * Detect new regions by comparing current vs previous
     */
    detectNewRegions(currentRegions, previousRegions) {
        if (!previousRegions || !previousRegions.regions) {
            return []; // First run, no comparison
        }

        const previousCodes = new Set(previousRegions.regions.map(r => r.code));
        const newRegions = currentRegions.regions.filter(r => !previousCodes.has(r.code));

        return newRegions;
    }

    /**
     * Detect new services by comparing current vs previous
     * Services in complete-data.json are stored as codes (strings), not objects
     */
    detectNewServices(currentServices, previousServices) {
        if (!previousServices || !previousServices.services) {
            return []; // First run, no comparison
        }

        // Handle services as array of codes (strings)
        const previousCodes = new Set(previousServices.services);
        const newServiceCodes = currentServices.services.filter(code => !previousCodes.has(code));

        return newServiceCodes; // Returns array of service codes (strings)
    }

    /**
     * Detect new regional services by comparing current vs previous
     */
    detectNewRegionalServices(currentData, previousData) {
        const newRegionalServices = [];

        if (!previousData || !previousData.servicesByRegion || !previousData.servicesByRegion.byRegion) {
            return []; // First run, no comparison
        }

        const currentByRegion = currentData.servicesByRegion?.byRegion || {};
        const previousByRegion = previousData.servicesByRegion?.byRegion || {};

        // Compare each region's services
        Object.entries(currentByRegion).forEach(([region, currentRegionData]) => {
            const previousRegionData = previousByRegion[region];

            if (!previousRegionData) {
                // Entire region is new, all services are new
                currentRegionData.services.forEach(service => {
                    newRegionalServices.push({ region, service });
                });
            } else {
                // Compare services within existing region
                const previousServices = new Set(previousRegionData.services);
                currentRegionData.services.forEach(service => {
                    if (!previousServices.has(service)) {
                        newRegionalServices.push({ region, service });
                    }
                });
            }
        });

        return newRegionalServices;
    }

    /**
     * Check if 30 days or less since date
     */
    isRecent(dateString, days = 30) {
        if (!dateString) return false;
        const targetDate = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - targetDate) / (1000 * 60 * 60 * 24));
        return diffDays <= days;
    }

    /**
     * Update isNew flags based on firstSeen dates
     */
    updateIsNewFlags(changeHistory) {
        // Update regions
        Object.values(changeHistory.regions).forEach(region => {
            region.isNew = this.isRecent(region.firstSeen, 30);
        });

        // Update services
        Object.values(changeHistory.services).forEach(service => {
            service.isNew = this.isRecent(service.firstSeen, 30);
        });
    }

    /**
     * Generate human-readable summary of changes
     */
    generateSummary(newRegions, newServices, newRegionalServices) {
        const parts = [];

        if (newRegions.length > 0) {
            if (newRegions.length === 1) {
                parts.push(`Added 1 new region (${newRegions[0].code})`);
            } else {
                parts.push(`Added ${newRegions.length} new regions`);
            }
        }

        if (newServices.length > 0) {
            if (newServices.length === 1) {
                parts.push(`1 new service`);
            } else {
                parts.push(`${newServices.length} new services`);
            }
        }

        if (newRegionalServices.length > 0) {
            parts.push(`${newRegionalServices.length} new regional service mappings`);
        }

        return parts.join(', ');
    }

    /**
     * Load service names from services.json file
     */
    async loadServiceNames() {
        try {
            const servicesFile = path.join(this.outputDir, 'services.json');
            const data = await fs.readFile(servicesFile, 'utf8');
            const servicesData = JSON.parse(data);

            const serviceMap = {};
            if (servicesData.services && Array.isArray(servicesData.services)) {
                servicesData.services.forEach(service => {
                    if (service.code && service.name) {
                        serviceMap[service.code] = service.name;
                    }
                });
            }
            return serviceMap;
        } catch (error) {
            console.warn(chalk.yellow('   ⚠️  Could not load service names, using codes'));
            return {};
        }
    }

    /**
     * Main method: Detect and track all changes
     * Handles multiple runs per day by checking if changelog entry already exists for today
     */
    async detectAndTrackChanges(currentData) {
        const todayDate = this.getTodayDate();

        console.log(chalk.bold.blue('\n=== CHANGE TRACKING ==='));

        // Load service names mapping
        const serviceNames = await this.loadServiceNames();

        // Load previous snapshot and change history
        const previousData = await this.loadPreviousSnapshot();
        const changeHistory = await this.loadChangeHistory();

        // Check if this is the first run
        if (!previousData) {
            console.log(chalk.yellow('📋 First run - creating baseline change history'));
            await this.initializeChangeHistory(currentData, serviceNames);
            await this.savePreviousSnapshot(currentData);
            console.log(chalk.green('✅ Change tracking initialized'));
            return {
                hasChanges: false,
                isFirstRun: true,
                newRegions: [],
                newServices: [],
                newRegionalServices: []
            };
        }

        // Detect changes
        const newRegions = this.detectNewRegions(currentData.regions, previousData.regions);
        const newServices = this.detectNewServices(currentData.services, previousData.services);
        const newRegionalServices = this.detectNewRegionalServices(currentData, previousData);

        const hasChanges = newRegions.length > 0 || newServices.length > 0 || newRegionalServices.length > 0;

        if (!hasChanges) {
            console.log(chalk.gray('✅ No changes detected since last run'));

            // Update metadata even if no changes
            changeHistory.metadata.lastUpdated = todayDate;
            changeHistory.metadata.totalRegions = currentData.regions?.count || 0;
            changeHistory.metadata.totalServices = currentData.services?.count || 0;

            // Update isNew flags
            this.updateIsNewFlags(changeHistory);

            await this.saveChangeHistory(changeHistory);
            await this.savePreviousSnapshot(currentData);

            return {
                hasChanges: false,
                isFirstRun: false,
                newRegions: [],
                newServices: [],
                newRegionalServices: []
            };
        }

        // Changes detected - update change history
        console.log(chalk.yellow(`📍 New Regions: ${newRegions.length}`));
        console.log(chalk.yellow(`🛠️  New Services: ${newServices.length}`));
        console.log(chalk.yellow(`🗺️  New Regional Services: ${newRegionalServices.length}`));

        // Add new regions to change history
        newRegions.forEach(region => {
            changeHistory.regions[region.code] = {
                name: region.name,
                firstSeen: todayDate,
                availabilityZones: region.availabilityZones,
                launchDate: this.formatLaunchDate(region.launchDate),
                isNew: true
            };
            console.log(chalk.green(`   ✅ ${region.code} (${region.name})`));
        });

        // Add new services to change history
        newServices.forEach(serviceCode => {
            const serviceName = serviceNames[serviceCode] || serviceCode;
            changeHistory.services[serviceCode] = {
                name: serviceName,
                firstSeen: todayDate,
                isNew: true
            };
            console.log(chalk.green(`   ✅ ${serviceCode} (${serviceName})`));
        });

        // Add new regional services to change history
        newRegionalServices.forEach(({ region, service }) => {
            if (!changeHistory.regionalServices[region]) {
                changeHistory.regionalServices[region] = {};
            }
            changeHistory.regionalServices[region][service] = todayDate;
        });

        // Check if we already have a changelog entry for today
        const existingEntryIndex = changeHistory.changeLog.findIndex(entry => entry.date === todayDate);

        if (existingEntryIndex >= 0) {
            // Update existing entry (multiple runs same day)
            console.log(chalk.blue('   ℹ️  Updating existing changelog entry for today'));

            const existingEntry = changeHistory.changeLog[existingEntryIndex];

            // Merge new changes with existing entry
            existingEntry.changes.newRegions = [
                ...existingEntry.changes.newRegions,
                ...newRegions.map(r => ({ code: r.code, name: r.name }))
            ];

            existingEntry.changes.newServices = [
                ...existingEntry.changes.newServices,
                ...newServices.map(code => ({ code, name: serviceNames[code] || code }))
            ];

            existingEntry.changes.newRegionalServices = [
                ...existingEntry.changes.newRegionalServices,
                ...newRegionalServices
            ];

            // Update summary
            existingEntry.summary = this.generateSummary(
                existingEntry.changes.newRegions,
                existingEntry.changes.newServices,
                existingEntry.changes.newRegionalServices
            );
        } else {
            // Create new changelog entry
            changeHistory.changeLog.unshift({
                date: todayDate,
                changes: {
                    newRegions: newRegions.map(r => ({ code: r.code, name: r.name })),
                    newServices: newServices.map(code => ({ code, name: serviceNames[code] || code })),
                    newRegionalServices: newRegionalServices
                },
                summary: this.generateSummary(newRegions, newServices, newRegionalServices)
            });
        }

        // Update metadata
        changeHistory.metadata.lastUpdated = todayDate;
        changeHistory.metadata.totalRegions = currentData.regions?.count || 0;
        changeHistory.metadata.totalServices = currentData.services?.count || 0;

        // Calculate total regional services
        let totalRegionalServices = 0;
        Object.values(changeHistory.regionalServices).forEach(services => {
            totalRegionalServices += Object.keys(services).length;
        });
        changeHistory.metadata.totalRegionalServices = totalRegionalServices;

        // Update cumulative changes
        changeHistory.metadata.changesSinceInception.newRegions = Object.keys(changeHistory.regions).length;
        changeHistory.metadata.changesSinceInception.newServices = Object.keys(changeHistory.services).length;
        changeHistory.metadata.changesSinceInception.newRegionalServices = totalRegionalServices;

        // Update isNew flags
        this.updateIsNewFlags(changeHistory);

        // Save files
        await this.saveChangeHistory(changeHistory);
        await this.savePreviousSnapshot(currentData);

        console.log(chalk.green(`💾 Change history updated: ${this.changeHistoryFile}`));

        return {
            hasChanges: true,
            isFirstRun: false,
            newRegions,
            newServices,
            newRegionalServices,
            summary: this.generateSummary(newRegions, newServices, newRegionalServices)
        };
    }

    /**
     * Initialize change history from current data (first run)
     */
    async initializeChangeHistory(currentData, serviceNames) {
        const todayDate = this.getTodayDate();
        const changeHistory = this.createEmptyChangeHistory();

        // Add all current regions as baseline
        if (currentData.regions && currentData.regions.regions) {
            currentData.regions.regions.forEach(region => {
                changeHistory.regions[region.code] = {
                    name: region.name,
                    firstSeen: todayDate,
                    availabilityZones: region.availabilityZones,
                    launchDate: this.formatLaunchDate(region.launchDate),
                    isNew: false // Baseline items are not marked as new
                };
            });
        }

        // Add all current services as baseline
        // Services in complete-data.json are stored as array of codes (strings)
        if (currentData.services && currentData.services.services) {
            currentData.services.services.forEach(serviceCode => {
                const serviceName = serviceNames[serviceCode] || serviceCode;
                changeHistory.services[serviceCode] = {
                    name: serviceName,
                    firstSeen: todayDate,
                    isNew: false
                };
            });
        }

        // Add all current regional services as baseline
        if (currentData.servicesByRegion && currentData.servicesByRegion.byRegion) {
            Object.entries(currentData.servicesByRegion.byRegion).forEach(([region, regionData]) => {
                changeHistory.regionalServices[region] = {};
                regionData.services.forEach(service => {
                    changeHistory.regionalServices[region][service] = todayDate;
                });
            });
        }

        // Update metadata
        changeHistory.metadata.totalRegions = currentData.regions?.count || 0;
        changeHistory.metadata.totalServices = currentData.services?.count || 0;

        let totalRegionalServices = 0;
        Object.values(changeHistory.regionalServices).forEach(services => {
            totalRegionalServices += Object.keys(services).length;
        });
        changeHistory.metadata.totalRegionalServices = totalRegionalServices;

        changeHistory.metadata.changesSinceInception = {
            newRegions: Object.keys(changeHistory.regions).length,
            newServices: Object.keys(changeHistory.services).length,
            newRegionalServices: totalRegionalServices
        };

        // Add initial changelog entry
        changeHistory.changeLog.push({
            date: todayDate,
            changes: {
                newRegions: [],
                newServices: [],
                newRegionalServices: []
            },
            summary: `Baseline initialized with ${changeHistory.metadata.totalRegions} regions, ${changeHistory.metadata.totalServices} services`
        });

        await this.saveChangeHistory(changeHistory);
        console.log(chalk.green(`   📊 Baseline: ${changeHistory.metadata.totalRegions} regions, ${changeHistory.metadata.totalServices} services`));
    }
}

module.exports = ChangeTracker;
