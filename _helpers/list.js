const fs = require('fs');
const ini = require('ini');
const _ = require('lodash');
const chalk = require('chalk');
const moment = require('moment');
const pkg = require('../package.json');
const spinner = require('./spin').spinner;
const configstore = require('configstore');
const configStore = new configstore(pkg.name);
const boxen = require('boxen');
const successBox = { borderColor: 'green', borderStyle: 'round', padding: 1, margin: 1 };
const dangerBox = { borderColor: 'red', borderStyle: 'round', padding: 1, margin: 1 };
const warningBox = { borderColor: 'yellow', borderStyle: 'round', padding: 1, margin: 1 };

const homedir = require('os').homedir();
const defaultCredsFilePath = `${homedir}/.aws/credentials`;
const defaultConfigFilePath = `${homedir}/.aws/config`;
const aliasesFilePath = `${homedir}/.awsprofilealiases`;

credsFile = process.env.AWS_SHARED_CREDENTIALS_FILE ? fs.readFileSync(process.env.AWS_SHARED_CREDENTIALS_FILE, 'utf-8') : fs.readFileSync(defaultCredsFilePath, 'utf-8');
profiles = ini.parse(credsFile);
configFile = process.env.AWS_CONFIG_FILE ? fs.readFileSync(process.env.AWS_CONFIG_FILE, 'utf-8') : fs.readFileSync(defaultConfigFilePath, 'utf-8');
configs = ini.parse(configFile);
const yes = chalk.green('\u{2714}');
const no = chalk.red('\u{2a09}');

exports.handler = async => {
    try {
        const profilesTable = require('./table').paramsTable(['Name', 'Type', 'MFA', 'MFA Serial', 'Role', 'Region', 'Output', 'Session', 'Expiry']);
        const profileNames = Object.keys(profiles);

        for (let p of _.sortBy(profileNames)) {
            const profileConfig = _.find(configStore.all.profiles, o => o.name === p);
            const profileAWSConfig = configs[`profile ${p}`];
            const profileAWS = profiles[p];
            profilesTable.push([
                profileConfig.name,
                profileConfig.type,
                profileConfig.type === 'assumed' ? 'NA' : profileConfig.isMfa ? yes : no,
                profileConfig.isMfa ? profileConfig.mfaSerial : 'NA',
                profileConfig.type === 'assumed' ? profileConfig.roleArn : 'NA',
                profileAWSConfig.region,
                profileAWSConfig.output,
                profileConfig.sessionDuration,
                profileAWS.expiration ? moment(profileAWS.expiration).diff(moment(), 'seconds') < 0 ? chalk.red('Expired') : chalk.green(moment(profileAWS.expiration).from(moment())) : 'NA'
            ]);
        }


        if (profilesTable.length > 0) {
            console.log('');
            console.log(profilesTable.toString());
        } else {
            console.log(boxen('No profiles found', warningBox));
        }
    } catch (error) {
        console.log(error);
        spinner.fail(error.message ? error.message : error);
    }
};
