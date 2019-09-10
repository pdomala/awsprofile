const winston = require('winston');
const moment = require('moment');
const { splat, combine, timestamp, printf, align, colorize } = winston.format;

const myLogFormat = printf(({ timestamp, level, message, meta }) => {
    const ts = moment(timestamp).format('YYYY-MM-DD HH:mm:ss');
    return `${ts} ${level} ${message}`;
});

exports.logger = winston.createLogger({
    format: combine(
        colorize(),
        timestamp(),
        align(),
        myLogFormat
    ),
    transports: [new winston.transports.Console()]
});