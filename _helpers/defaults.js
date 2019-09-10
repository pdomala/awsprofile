const inquirer = require('inquirer');
const configstore = require('configstore');
const pkg = require('../package.json');
const spinner = require('./spin').spinner;

const configStore = new configstore(pkg.name);

exports.handler = async args => {
    try {
        if (args.r && args.o && args.m && args.s) {
            await this.setDefaults(args.r, args.o, args.m, args.s);
        } else {
            await _askForDefaults(args);
        }
    } catch (error) {
        spinner.fail(error.message ? error.message : error);
    }
};

exports.setDefaults = async (r, o, m, s) => {
    
    configStore.set({
        defaults: {
            region: r,
            output: o,
            mfaSerial: m,
            sessionDuration: s
        }
    });

    const defaultsTable = require('./table').paramsTable(['Region', 'Output', 'MFA Serial', 'Session Duration']);

    defaultsTable.push([r, o, m, s]);
    console.log('');
    console.log(defaultsTable.toString());
    spinner.succeed('awsprofile defaults set successfully');
};

_askForDefaults = async args => {
    inquirer
        .prompt([
            {
                name: 'r',
                message: 'What is your default AWS region ?',
                when: !args.r,
                default: configStore.all.defaults.region !== '' ? configStore.all.defaults.region : '',
                validate: r => {
                    if (r === '') {
                        return "Looks like you haven't provided your default AWS region. Please try again";
                    } else return true;
                }
            },
            {
                name: 'o',
                type: 'list',
                choices: ['json', 'table', 'text'],
                message: 'What should be your default output format ?',
                when: !args.o,
                default: configStore.all.defaults.output !== '' ? configStore.all.defaults.output : '',
                validate: o => {
                    if (o === '') {
                        return "Looks like you haven't provided your default output format. Please try again";
                    } else return true;
                }
            },
            {
                name: 'm',
                message: 'What is your default MFA serial (ARN) ?',
                when: !args.m,
                default: configStore.all.defaults.mfaSerial !== '' ? configStore.all.defaults.mfaSerial : '',
                validate: m => {
                    if (m === '') {
                        return "Looks like you haven't provided your default MFA serial. Please try again";
                    } else return true;
                }
            },
            {
                name: 's',
                type: 'number',
                message: 'What is your default STS session duration in seconds (900 - 12900) ?',
                when: !args.s,
                default: configStore.all.defaults.sessionDuration !== '' ? configStore.all.defaults.sessionDuration : '',
                validate: s => {
                    if (s === '') {
                        return "Looks like you haven't provided your default session duration. Please try again";
                    } else if (s < 900 || s > 129600) {
                        return 'Session duration must be between 900 (15 Min) and 129000 (36 Hours)';
                    } else return true;
                }
            }
        ])
        .then(async answers => {
            await this.setDefaults(args.r ? args.r : answers.r, args.o ? args.o : answers.o, args.m ? args.m : answers.m, args.s ? args.s : answers.s);
        });
};
