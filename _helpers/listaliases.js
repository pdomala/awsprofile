const fs = require('fs');
const ini = require('ini');
const spinner = require('./spin').spinner;
const boxen = require('boxen');
const successBox = { borderColor: 'green', borderStyle: 'round', padding: 1, margin: 1 };
const homedir = require('os').homedir();
const aliasesFilePath = `${homedir}/.awsprofilealiases`;

exports.handler = async => {
    try {
        aliasesFile = fs.readFileSync(aliasesFilePath, 'utf-8');

        aliases = Object.keys(ini.parse(aliasesFile)).map(a => a.replace('alias ', '')).toString().replace(/,/g,'\n');
        message = 'Execute below aliases to set your AWS profile\nExecute \'source ~/.awsprofilealiases\' if the command is not found\n\n'
        console.log(boxen(`${message}${aliases}`, successBox));

    } catch (error) {
        spinner.fail(error.message ? error.message : error);
    }
};
