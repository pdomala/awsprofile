const configstore = require('configstore');
const log = require('./_helpers/logger').logger;
const fs = require('fs');
const pkg = require('./package.json');

try {
    // Create config store if it does not exist
    const config = new configstore(pkg.name);
    const defaultConfig = {
        defaults: {
            region: '',
            output: '',
            mfaSerial: '',
            sessionDuration: 3600
        },
        profiles: []
    };
    if (!fs.existsSync(config.path)) {
        config.all = defaultConfig;
    }

    // Create .awsprofilealiases
    const aliasesFile = `${require('os').homedir()}/.awsprofilealiases`;
    if (!fs.existsSync(aliasesFile)) {
        fs.promises.writeFile(aliasesFile, '');
    }
} catch (error) {
    log.error(error.message ? error.message : error);
}
