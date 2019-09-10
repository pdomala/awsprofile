const fs = require('fs');
const ini = require('ini');
const spinner = require('./spin').spinner;
const boxen = require('boxen');
const successBox = { borderColor: 'green', borderStyle: 'round', padding: 1, margin: 1 };
const warningBox = { borderColor: 'yellow', borderStyle: 'round', padding: 1, margin: 1 };
const homedir = require('os').homedir();
const aliasesFilePath = `${homedir}/.awsprofilealiases`;

exports.handler = async => {
    try {
        aliasesFile = fs.readFileSync(aliasesFilePath, 'utf-8');

        if (Object.keys(ini.parse(aliasesFile)).map(a => a.replace('alias ', '')).length === 0) {
            console.log(boxen('No aliases found', warningBox));
        } else {
            aliases = Object.keys(ini.parse(aliasesFile)).map(a => a.replace('alias ', '')).toString().replace(/,/g, '\n');
            message = `Execute below aliases to set your AWS profile
Execute \'source ~/.awsprofilealiases\' if the command is not found
Add the source command to your bash_profile / .zshrc\n\n`;
            console.log(boxen(`${message}${aliases}`, successBox));
        }
    } catch (error) {
        spinner.fail(error.message ? error.message : error);
    }
};
