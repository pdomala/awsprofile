const inquirer = require('inquirer');
const _ = require('lodash');
const moment = require('moment');
const AWS = require('aws-sdk');
const log = require('./logger').logger;
const spinner = require('./spin').spinner;
const configstore = require('configstore');
const pkg = require('../package.json');
const fs = require('fs');
const ini = require('ini');
const boxen = require('boxen');
const successBox = { borderColor: 'green', borderStyle: 'round', padding: 1, margin: 1 };
const dangerBox = { borderColor: 'red', borderStyle: 'round', padding: 1, margin: 1 };
const warningBox = { borderColor: 'yellow', borderStyle: 'round', padding: 1, margin: 1 };

const homedir = require('os').homedir();
const defaultCredsFilePath = `${homedir}/.aws/credentials`;
const defaultConfigFilePath = `${homedir}/.aws/config`;
const aliasesFilePath = `${homedir}/.awsprofilealiases`;

var credsFile;
var profiles;
var configFile;
var configs;

const configStore = new configstore(pkg.name);

exports.handler = async => {
    try {
        if (!fs.existsSync(`${homedir}/.aws`)) {
            fs.promises.mkdir(`${homedir}/.aws`, { recursive: true });
        }

        if (!fs.existsSync(defaultCredsFilePath)) {
            fs.promises.writeFile(defaultCredsFilePath, '');
        }
        if (!fs.existsSync(defaultConfigFilePath)) {
            fs.promises.writeFile(defaultConfigFilePath, '');
        }
        inquirer
            .prompt([
                {
                    name: 'profileType',
                    type: 'list',
                    choices: [{ name: 'NORMAL (Uses Access Keys)', value: 'normal' }, { name: 'ASSUMED (Uses source profile and a role to assume)', value: 'assumed' }],
                    message: 'What type of profile you want to create ?'
                },
                {
                    name: 'accessKey',
                    message: 'What is your AWS Access Key ?',
                    when: answers => {
                        return answers.profileType === 'normal';
                    },
                    validate: accessKey => {
                        if (accessKey === '') {
                            return "Looks like you haven't provided your Access Key. Please try again";
                        } else if (accessKey.length < 16) {
                            return "Your Access Key doesn't seem to be right. It must be minimum 16 chars long.";
                        } else return true;
                    }
                },
                {
                    name: 'secretAccessKey',
                    type: 'password',
                    mask: '*',
                    message: 'What is your AWS Secret Access Key ? (Hidden)',
                    when: answers => {
                        return answers.profileType === 'normal';
                    },
                    validate: secretAccessKey => {
                        if (secretAccessKey === '') {
                            return "Looks like you haven't provided your Secret Access Key. Please try again";
                        } else return true;
                    }
                },
                {
                    name: 'sourceProfile',
                    type: 'list',
                    choices: () => {
                        const sourceProfileNames = _.filter(configStore.all.profiles, p => {
                            return p.type === 'normal';
                        }).map(np => np.name);
                        if (sourceProfileNames.length === 0) {
                            spinner.fail("No source profiles found. Please create one by selecting 'NORMAL' as profile type");
                            process.exit();
                        } else {
                            return sourceProfileNames;
                        }
                    },
                    message: 'Choose your source profile',
                    when: answers => {
                        return answers.profileType === 'assumed';
                    }
                },
                {
                    name: 'roleArn',
                    message: 'What is the IAM role ARN you are assuming ? (Ex: arn:aws:iam::123456789012:role/rolename)',
                    when: answers => {
                        return answers.profileType === 'assumed';
                    },
                    validate: roleArn => {
                        if (roleArn === '') {
                            return "Looks like you haven't provided IAM role to assume. Please try again";
                        } else return true;
                    }
                },
                {
                    name: 'region',
                    message: 'What is your AWS region ?',
                    default: configStore.all.defaults.region === '' ? 'ap-southeast-2' : configStore.all.defaults.region
                },
                {
                    name: 'output',
                    type: 'list',
                    choices: ['json', 'text', 'table'],
                    message: 'What output format would you like ?',
                    default: configStore.all.defaults.output === '' ? 'json' : configStore.all.defaults.output
                },
                {
                    name: 'isMfa',
                    type: 'confirm',
                    message: 'Do you want to use MFA for this profile ?',
                    default: false,
                    when: answers => {
                        return answers.profileType === 'normal';
                    }
                },
                {
                    name: 'mfaSerial',
                    message: 'What is MFA serial ARN ?',
                    default: configStore.all.defaults.mfaSerial === '' ? 'Ex: arn:aws:iam::123456789012:mfa/username' : configStore.all.defaults.mfaSerial,
                    when: answers => {
                        return answers.isMfa;
                    },
                    validate: mfaSerial => {
                        if (mfaSerial === '') {
                            return "Looks like you haven't provided your MFA serial. Please try again";
                        } else return true;
                    }
                },
                {
                    name: 'sessionDuration',
                    type: 'number',
                    message: 'How long would you like your session to be active in seconds (900 - 12900) ?',
                    when: answers => {
                        return answers.isMfa || answers.profileType === 'assumed';
                    },
                    default: configStore.all.defaults.sessionDuration !== '' ? configStore.all.defaults.sessionDuration : '',
                    validate: s => {
                        if (s === '') {
                            return "Looks like you haven't provided your session duration. Please try again";
                        } else if (s < 900 || s > 129600) {
                            return 'Session duration must be between 900 (15 Min) and 129000 (36 Hours)';
                        } else return true;
                    }
                },
                {
                    name: 'profileName',
                    message: 'What do you want to call your new AWS profile ?',
                    default: 'my-profile'
                },
                {
                    name: 'mfaToken',
                    message: 'Enter the token code from your authenticator app ?',
                    when: answers => {
                        return answers.isMfa;
                    },
                    validate: mfaToken => {
                        if (mfaToken === '') {
                            return "Looks like you haven't provided your MFA token code. Please try again";
                        } else if (mfaToken.length < 6) {
                            return "Your MFA token code doesn't seem to be right. It must be minimum 6 digits long.";
                        } else return true;
                    }
                }
            ])
            .then(answers => {
                _createProfile(answers);
            });
    } catch (error) {
        log.error(error.message ? error.message : error);
    }
};

_createProfile = async answers => {
    try {
        credsFile = process.env.AWS_SHARED_CREDENTIALS_FILE ? fs.readFileSync(process.env.AWS_SHARED_CREDENTIALS_FILE, 'utf-8') : fs.readFileSync(defaultCredsFilePath, 'utf-8');
        profiles = ini.parse(credsFile);
        configFile = process.env.AWS_CONFIG_FILE ? fs.readFileSync(process.env.AWS_CONFIG_FILE, 'utf-8') : fs.readFileSync(defaultConfigFilePath, 'utf-8');
        configs = ini.parse(configFile);

        if (answers.profileType === 'normal') {
            if (!profiles[answers.profileName]) {
                if (answers.isMfa) {
                    await _writeMfaProfile(answers);
                } else {
                    await _writeProfile(answers);
                }
                await _updateAliases(answers.profileName);
                await _updateConfigStore(answers);
                console.log(
                    boxen(
                        `Profile '${answers.profileName}' created succesfully
Execute below alias command to set your AWS profile\n
AWS_${answers.profileName.toUpperCase()}\n
Execute 'source ~/.awsprofilealiases' if the command is not found
Add the source command to your bash_profile / .zshrc`,
                        successBox
                    )
                );
            } else {
                inquirer
                    .prompt([
                        {
                            name: 'overwriteProfile',
                            type: 'confirm',
                            message: `A profile named '${answers.profileName}' already exists. Do you want to overwrite it ?`,
                            default: false
                        }
                    ])
                    .then(async overwriteAns => {
                        if (overwriteAns.overwriteProfile) {
                            try {
                                if (answers.isMfa) {
                                    await _writeMfaProfile(answers);
                                } else {
                                    await _writeProfile(answers);
                                }
                                await _updateAliases(answers.profileName);
                                await _updateConfigStore(answers);

                                console.log(
                                    boxen(
                                        `Profile '${answers.profileName}' created succesfully
Execute below alias command to set your AWS profile\n
AWS_${answers.profileName.toUpperCase()}\n
Execute 'source ~/.awsprofilealiases' if the command is not found
Add the source command to your bash_profile / .zshrc`,
                                        successBox
                                    )
                                );
                            } catch (error) {
                                spinner.fail(error.message ? error.message : error);
                            }
                        } else {
                            console.log(boxen(`No changes made to profile '${answers.profileName}'`, warningBox));
                        }
                    });
            }
        } else {
            if (!profiles[answers.profileName]) {
                try {
                    await _writeAssumedProfile(answers);
                } catch (error) {
                    spinner.fail(error.message ? error.message : error);
                }
            } else {
                inquirer
                    .prompt([
                        {
                            name: 'overwriteProfile',
                            type: 'confirm',
                            message: `A profile named '${answers.profileName}' already exists. Do you want to overwrite it ?`,
                            default: false
                        }
                    ])
                    .then(async overwriteAns => {
                        if (overwriteAns.overwriteProfile) {
                            try {
                                await _writeAssumedProfile(answers);
                            } catch (error) {
                                spinner.fail(error.message ? error.message : error);
                            }
                        } else {
                            console.log(boxen(`No changes made to profile '${answers.profileName}'`, warningBox));
                        }
                    });
            }
        }
    } catch (error) {
        spinner.fail(error.message ? error.message : error);
    }
};

_writeProfile = async answers => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(profiles);
            profiles[answers.profileName] = {
                aws_access_key_id: answers.accessKey,
                aws_secret_access_key: answers.secretAccessKey
            };
            fs.writeFileSync(defaultCredsFilePath, ini.stringify(profiles));

            configs[answers.profileName === 'default' ? 'default' : `profile ${answers.profileName}`] = {
                region: answers.region,
                output: answers.output
            };
            fs.writeFileSync(defaultConfigFilePath, ini.stringify(configs));

            return resolve('success');
        } catch (error) {
            return reject(error.message ? error.message : error);
        }
    });
};

_writeMfaProfile = async answers => {
    return new Promise(async (resolve, reject) => {
        const keys = {
            accessKeyId: answers.accessKey,
            secretAccessKey: answers.secretAccessKey
        };

        const sts = new AWS.STS(keys);

        spinner.start('Requesting temporary STS credentials');

        await sts
            .getSessionToken({
                SerialNumber: answers.mfaSerial,
                TokenCode: answers.mfaToken,
                DurationSeconds: answers.sessionDuration ? answers.sessionDuration : configStore.all.defaults.sessionDuration
            })
            .promise()
            .then(stsRes => {
                profiles[answers.profileName] = {
                    aws_access_key_id: stsRes.Credentials.AccessKeyId,
                    aws_secret_access_key: stsRes.Credentials.SecretAccessKey,
                    aws_session_token: stsRes.Credentials.SessionToken,
                    expiration: moment(stsRes.Credentials.Expiration).format()
                };
                fs.writeFileSync(defaultCredsFilePath, ini.stringify(profiles));

                configs[answers.profileName === 'default' ? 'default' : `profile ${answers.profileName}`] = {
                    region: answers.region,
                    output: answers.output
                };
                fs.writeFileSync(defaultConfigFilePath, ini.stringify(configs));

                spinner.succeed();
                return resolve('success');
            })
            .catch(error => {
                return reject(error.message ? error.message : error);
            });
    });
};

_writeAssumedProfile = async answers => {
    return new Promise(async (resolve, reject) => {
        const sourceProfile = _.find(configStore.all.profiles, p => {
            return p.name === answers.sourceProfile;
        });

        const keys = {
            accessKeyId: sourceProfile.accessKey,
            secretAccessKey: sourceProfile.secretAccessKey
        };
        const sts = new AWS.STS(keys);

        if (sourceProfile.isMfa) {
            inquirer
                .prompt([
                    {
                        name: 'mfaToken',
                        message: `Enter the token code for profile ${sourceProfile.name} & user ${_.last(_.split(sourceProfile.mfaSerial, '/'))}`,
                        validate: mfaToken => {
                            if (mfaToken === '') {
                                return "Looks like you haven't provided your MFA token code. Please try again";
                            } else if (mfaToken.length < 6) {
                                return "Your MFA token code doesn't seem to be right. It must be minimum 6 digits long.";
                            } else return true;
                        }
                    }
                ])
                .then(async assumedMfaAns => {
                    try {
                        const assumeRoleParams = {
                            RoleArn: answers.roleArn,
                            RoleSessionName: `${_.last(_.split(answers.roleArn, '/'))}-AssumedSession`,
                            DurationSeconds: answers.sessionDuration ? answers.sessionDuration : configStore.all.defaults.sessionDuration,
                            SerialNumber: sourceProfile.mfaSerial,
                            TokenCode: assumedMfaAns.mfaToken
                        };
                        await _getAssumedSTSCreds(sts, assumeRoleParams, answers);
                    } catch (error) {
                        spinner.fail(error.message ? error.message : error);
                    }
                });
        } else {
            try {
                const assumeRoleParams = {
                    RoleArn: answers.roleArn,
                    RoleSessionName: `${_.last(_.split(answers.roleArn, '/'))}-AssumedSession`,
                    DurationSeconds: answers.sessionDuration ? answers.sessionDuration : configStore.all.defaults.sessionDuration
                };
                await _getAssumedSTSCreds(sts, assumeRoleParams, answers);
            } catch (error) {
                spinner.fail(error.message ? error.message : error);
            }
        }
    });
};

_getAssumedSTSCreds = async (sts, assumeRoleParams, answers) => {
    return new Promise(async (resolve, reject) => {
        spinner.start('Requesting temporary STS credentials');

        await sts
            .assumeRole(assumeRoleParams)
            .promise()
            .then(async stsRes => {
                profiles[answers.profileName] = {
                    aws_access_key_id: stsRes.Credentials.AccessKeyId,
                    aws_secret_access_key: stsRes.Credentials.SecretAccessKey,
                    aws_session_token: stsRes.Credentials.SessionToken,
                    expiration: moment(stsRes.Credentials.Expiration).format()
                };
                fs.writeFileSync(defaultCredsFilePath, ini.stringify(profiles));

                configs[answers.profileName === 'default' ? 'default' : `profile ${answers.profileName}`] = {
                    region: answers.region,
                    output: answers.output
                };
                fs.writeFileSync(defaultConfigFilePath, ini.stringify(configs));

                spinner.succeed();

                await _updateAliases(answers.profileName);
                await _updateConfigStore(answers);

                console.log(
                    boxen(
                        `Profile '${answers.profileName}' created succesfully
Execute below alias command to set your AWS profile\n
AWS_${answers.profileName.toUpperCase()}\n
Execute 'source ~/.awsprofilealiases' if the command is not found
Add the source command to your bash_profile / .zshrc`,
                        successBox
                    )
                );

                return resolve('success');
            })
            .catch(error => {
                return reject(error.message ? error.message : error);
            });
    });
};

_updateAliases = async profileName => {
    return new Promise(async (resolve, reject) => {
        try {
            const aliases = ini.parse(fs.readFileSync(aliasesFilePath, 'utf-8'));
            if (!aliases[`alias AWS_${profileName.toUpperCase()}`]) {
                aliases[`alias AWS_${profileName.toUpperCase()}`] = `export AWS_PROFILE=${profileName}`;
            }
            fs.writeFileSync(aliasesFilePath, ini.stringify(aliases));

            return resolve('success');
        } catch (error) {
            return reject(error.message ? error.message : error);
        }
    });
};

_updateConfigStore = async answers => {
    return new Promise(async (resolve, reject) => {
        try {
            const configObject = configStore.all;
            if (configObject.defaults.region === '') {
                configObject.defaults.region = answers.region;
            }
            if (configObject.defaults.output === '') {
                configObject.defaults.output = answers.output;
            }
            if (configObject.defaults.mfaSerial === '') {
                configObject.defaults.mfaSerial = answers.mfaSerial;
            }

            _.remove(configObject.profiles, p => {
                return p.name === answers.profileName;
            });

            if (answers.profileType === 'normal') {
                configObject.profiles.push({
                    name: answers.profileName,
                    type: answers.profileType,
                    isMfa: answers.isMfa,
                    mfaSerial: answers.isMfa ? answers.mfaSerial : '',
                    accessKey: answers.isMfa ? answers.accessKey : '',
                    secretAccessKey: answers.isMfa ? answers.secretAccessKey : '',
                    sessionDuration: answers.isMfa ? answers.sessionDuration : 0
                });
            } else {
                configObject.profiles.push({
                    name: answers.profileName,
                    type: answers.profileType,
                    sourceProfile: answers.sourceProfile,
                    roleArn: answers.roleArn,
                    sessionDuration: answers.sessionDuration
                });
            }

            configStore.all = configObject;

            return resolve('success');
        } catch (error) {
            return reject(error.message ? error.message : error);
        }
    });
};
