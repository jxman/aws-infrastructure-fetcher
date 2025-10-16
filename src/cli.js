#!/usr/bin/env node

/**
 * AWS SSM Data Fetcher - CLI Entry Point
 *
 * Command-line interface for fetching AWS global infrastructure data
 * from SSM Parameter Store and saving to local JSON files.
 */

const { Command } = require('commander');
const AWSDataFetcher = require('./core/aws-data-fetcher');

// CLI Setup
const program = new Command();

program
    .name('aws-ssm-fetcher')
    .description('Fetch AWS global infrastructure data from SSM Parameter Store')
    .version('1.5.1')
    .option('-r, --regions-only', 'Fetch only regions data')
    .option('-s, --services-only', 'Fetch only services data')
    .option('-m, --include-service-mapping', 'Include service-by-region mapping (optimized, ~3-5 min)')
    .option('-f, --force-refresh', 'Force refresh cache, bypass cached data (24-hour TTL)')
    .option('--region <region>', 'AWS region to use for API calls', 'us-east-1')
    .action(async (options) => {
        const fetcher = new AWSDataFetcher(options.region);
        await fetcher.run(options);
    });

// Run if called directly
if (require.main === module) {
    program.parse(process.argv);
}

module.exports = program;
