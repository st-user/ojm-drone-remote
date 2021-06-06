const { LOG_LEVEL } = require('./Environment.js');

const log4js = require('log4js');

const logger = log4js.getLogger();
logger.level = LOG_LEVEL;

module.exports = logger;