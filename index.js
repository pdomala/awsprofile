#!/usr/bin/env node
const yargs = require('yargs');
const log = require('./_helpers/logger').logger;
const fs = require('fs');
const pkg = require('./package.json');

// Command line arguments
const args = yargs
    .version(pkg.version)
    .usage('Usage: $0 <command> [options]')
    .demandCommand(1, 'You need at least one command before moving on')
    .command('defaults', 'Set your AWS profile default region and output used when creating new profiles', {
        region: {
            alias: 'r',
            describe: 'AWS Region'
        },
        output: {
            alias: 'o',
            describe: 'CLI output format',
            choices: ['json', 'table', 'text']
        },
        mfaserial: {
            alias: 'm',
            describe: 'MFA serial (ARN)'
        },
        sessionduration: {
            alias: 's',
            describe: 'STS temporary credential session duration'
        }
    })
    .example('$0 defaults')
    .example('$0 defaults -r ap-southeast-2 -o json -m arn:aws:iam::123456789012:mfa/username -s 3600')

    .command('create', 'Creates AWS profile interactively', {})
    .example('$0 create')

    .command('listaliases', 'List all existing AWS profile aliases', {})
    .example('$0 listaliases')

    .command('renew', 'Renew existing STS temporary credentials', {})
    .example('$0 renew')

    .help('h')
    .alias('h', 'help').argv;

try {
    const command = args._[0];
    switch (command) {
        case 'defaults':
            const defaults = require('./_helpers/defaults');
            defaults.handler(args);
            break;
        case 'create':
            const create = require('./_helpers/create');
            create.handler();
            break;
        case 'listaliases':
            const listaliases = require('./_helpers/listaliases');
            listaliases.handler();
            break;
        case 'list':
            const list = require('./_helpers/list');
            list.handler();
            break;
        case 'renew':
            const renew = require('./_helpers/renew');
            renew.handler();
            break;
        default:
            break;
    }
} catch (error) {
    log.error(error.message ? error.message : error);
}
