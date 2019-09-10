const AWS = require('aws-sdk');
const keys = {
    accessKeyId: 'AKIARLWHPC4T54QZ5I74',
    secretAccessKey: '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'
};

const sts = new AWS.STS(keys);

console.log(sts);