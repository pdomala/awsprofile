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
const defaultCredsFile = `${homedir}/.aws/credentials`;
const defaultConfigFile = `${homedir}/.aws/config`;
const aliasesFile = `${homedir}/.awsprofilealiases`;

credsFile = process.env.AWS_SHARED_CREDENTIALS_FILE ? fs.readFileSync(process.env.AWS_SHARED_CREDENTIALS_FILE, 'utf-8') : fs.readFileSync(defaultCredsFile, 'utf-8');
profiles = ini.parse(credsFile);
configFile = process.env.AWS_CONFIG_FILE ? fs.readFileSync(process.env.AWS_CONFIG_FILE, 'utf-8') : fs.readFileSync(defaultConfigFile, 'utf-8');
configs = ini.parse(configFile);

const configStore = new configstore(pkg.name);

exports.handler = async => {
    try {
        inquirer
            .prompt([
                {
                    name: 'profileName',
                    type: 'list',
                    choices: () => {
                        const profileNames = _.filter(configStore.all.profiles, p => {
                            return p.isMfa || p.type === 'assumed';
                        }).map(np => np.name);
                        if (profileNames.length === 0) {
                            console.log(boxen('No profiles eligible for renewal found\nAssumed profiles and profiles with MFA enabled can be renewed', warningBox));
                            process.exit();
                        } else {
                            return profileNames;
                        }
                    },
                    message: 'Choose a profile to renew ?'
                },
                {
                    name: 'mfaToken',
                    message: answers => {
                        const selectedProfile = _.find(configStore.all.profiles, p => p.name === answers.profileName);
                        if (selectedProfile.type === 'assumed') {
                            const sourceProfile = _.find(configStore.all.profiles, p => p.name === selectedProfile.sourceProfile);
                            return `Enter MFA token code for profile ${sourceProfile.name} & user ${_.last(_.split(sourceProfile.mfaSerial, '/'))}`;
                        } else {
                            return `Enter MFA token code for profile ${selectedProfile.name} & user ${_.last(_.split(selectedProfile.mfaSerial, '/'))}`;
                        }
                    },
                    when: answers => {
                        const selectedProfile = _.find(configStore.all.profiles, p => p.name === answers.profileName);
                        if (selectedProfile.type === 'assumed') {
                            const sourceProfile = _.find(configStore.all.profiles, p => p.name === selectedProfile.sourceProfile);
                            return sourceProfile.isMfa;
                        } else {
                            return selectedProfile.isMfa;
                        }
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
            .then(async answers => {
                try {
                    const selectedProfile = _.find(configStore.all.profiles, p => p.name === answers.profileName);
                    if (selectedProfile.type === 'assumed') {
                        const sourceProfile = _.find(configStore.all.profiles, p => p.name === selectedProfile.sourceProfile);
                        await _writeAssumedProfile(selectedProfile, answers, sourceProfile);
                    } else {
                        await _writeMfaProfile(selectedProfile, answers);
                    }
                } catch (error) {
                    spinner.fail(error.message ? error.message : error);
                }
            });
    } catch (error) {
        spinner.fail(error.message ? error.message : error);
    }
};

_writeMfaProfile = async (selectedProfile, answers) => {
    return new Promise(async (resolve, reject) => {
        const keys = {
            accessKeyId: selectedProfile.accessKey,
            secretAccessKey: selectedProfile.secretAccessKey
        };
        const sts = new AWS.STS(keys);
        spinner.start('Requesting temporary STS credentials');
        await sts
            .getSessionToken({
                SerialNumber: selectedProfile.mfaSerial,
                TokenCode: answers.mfaToken,
                DurationSeconds: selectedProfile.sessionDuration ? selectedProfile.sessionDuration : configStore.all.defaults.sessionDuration
            })
            .promise()
            .then(stsRes => {
                profiles[answers.profileName] = {
                    aws_access_key_id: stsRes.Credentials.AccessKeyId,
                    aws_secret_access_key: stsRes.Credentials.SecretAccessKey,
                    aws_session_token: stsRes.Credentials.SessionToken,
                    expiration: moment(stsRes.Credentials.Expiration).format()
                };
                fs.writeFileSync(defaultCredsFile, ini.stringify(profiles));


                spinner.succeed();

                console.log(
                    boxen(
                        `Profile '${answers.profileName}' created succesfully\nExecute below alias command to set your AWS profile\n\nAWS_${answers.profileName.toUpperCase()}\n\nExecute 'source ~/.awsprofilealiases' if the command is not found`,
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

_writeAssumedProfile = async (selectedProfile, answers, sourceProfile) => {
    return new Promise(async (resolve, reject) => {
        const keys = {
            accessKeyId: sourceProfile.accessKey,
            secretAccessKey: sourceProfile.secretAccessKey
        };

        const sts = new AWS.STS(keys);

        if (sourceProfile.isMfa) {
            try {
                const assumeRoleParams = {
                    RoleArn: selectedProfile.roleArn,
                    RoleSessionName: `${_.last(_.split(selectedProfile.roleArn, '/'))}-AssumedSession`,
                    DurationSeconds: selectedProfile.sessionDuration,
                    SerialNumber: sourceProfile.mfaSerial,
                    TokenCode: answers.mfaToken
                };
                await _getAssumedSTSCreds(sts, assumeRoleParams, selectedProfile);
            } catch (error) {
                spinner.fail(error.message ? error.message : error);
            }
        } else {
            try {
                const assumeRoleParams = {
                    RoleArn: selectedProfile.roleArn,
                    RoleSessionName: `${_.last(_.split(selectedProfile.roleArn, '/'))}-AssumedSession`,
                    DurationSeconds: selectedProfile.sessionDuration
                };
                await _getAssumedSTSCreds(sts, assumeRoleParams, selectedProfile);
            } catch (error) {
                spinner.fail(error.message ? error.message : error);
            }
        }
    });
};

_getAssumedSTSCreds = async (sts, assumeRoleParams, selectedProfile) => {
    return new Promise(async (resolve, reject) => {
        spinner.start('Requesting temporary STS credentials');

        await sts
            .assumeRole(assumeRoleParams)
            .promise()
            .then(async stsRes => {
                profiles[selectedProfile.name] = {
                    aws_access_key_id: stsRes.Credentials.AccessKeyId,
                    aws_secret_access_key: stsRes.Credentials.SecretAccessKey,
                    aws_session_token: stsRes.Credentials.SessionToken,
                    expiration: moment(stsRes.Credentials.Expiration).format()
                };
                fs.writeFileSync(defaultCredsFile, ini.stringify(profiles));

                spinner.succeed();

                console.log(
                    boxen(
                        `Profile '${selectedProfile.name}' created succesfully\nExecute below alias command to set your AWS profile\n\nAWS_${selectedProfile.name.toUpperCase()}\n\nExecute 'source ~/.awsprofilealiases' if the command is not found`,
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
