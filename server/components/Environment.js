require('dotenv').config();

const _parseIntOrDefault = (value, defaultValue) => {
    return !value? defaultValue : parseInt(value, 10);
};

const isDevelopment = process.env.NODE_ENV === 'development';

module.exports = {
    isDevelopment,

    PORT: _parseIntOrDefault(process.env.PORT, 8080),
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    TURN_SECRETS: process.env.TURN_SECRETS,
    HOURS_TURN_CREDENTIAL_VALID: process.env.HOURS_TURN_CREDENTIAL_VALID,
    STUN_URLS: process.env.STUN_URLS,
    TURN_URLS: process.env.TURN_URLS,

    MAX_LOCAL_CLIENT_COUNT: _parseIntOrDefault(process.env.MAX_REMOTE_CLIENT_COUNT, 1000),
    MAX_LOCAL_CLIENT_HTTP_BUF_SIZE: _parseIntOrDefault(process.env.MAX_HTTP_BUF_SIZE, 1024 * 1024),
    LOCAL_CLIENT_PING_INTERVAL: _parseIntOrDefault(process.env.LOCAL_CLIENT_PING_INTERVAL, 5 * 1000),
    LOCAL_CLIENT_TIMEOUT_MILLIS: _parseIntOrDefault(process.env.LOCAL_CLIENT_TIMEOUT_MILLIS, 10 * 1000),
    TICKET_EXPIRES_IN: _parseIntOrDefault(process.env.TICKET_EXPIRES_IN, 10 * 1000),

    MAX_REMOTE_CLIENT_COUNT: _parseIntOrDefault(process.env.MAX_REMOTE_CLIENT_COUNT, 1000),
    MAX_REMOTE_CLIENT_HTTP_BUF_SIZE: _parseIntOrDefault(process.env.MAX_HTTP_BUF_SIZE, 1024 * 1024),
    REMOTE_CLIENT_TIMEOUT_MILLIS: _parseIntOrDefault(process.env.REMOTE_CLIENT_TIMEOUT_MILLIS, 10 * 1000),
    REMOTE_CLIENT_PING_INTERVAL: _parseIntOrDefault(process.env.REMOTE_CLIENT_PING_INTERVAL, 3 * 1000),
    REMOTE_CLIENT_SUSPEND_CLOSE_MILLIS: _parseIntOrDefault(process.env.REMOTE_CLIENT_SUSPEND_CLOSE_MILLIS, 5 * 1000),

    START_KEY_TIMEOUT_CHECK_INTERVAL: _parseIntOrDefault(process.env.START_KEY_TIMEOUT_CHECK_INTERVAL, 10 * 1000),
    START_KEY_TIMEOUT_MILLIS: _parseIntOrDefault(process.env.START_KEY_TIMEOUT_MILLIS, 5 * 60 * 1000),

    STORAGE_PROJEDT_ID: process.env.STORAGE_PROJEDT_ID,
    STORAGE_KEY_PATH: process.env.STORAGE_KEY_PATH,
};