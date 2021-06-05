window.__ojm_drone_remote_log_level = 1;

export default class Logger {
    
    static debug(...args) {
        if (window.__ojm_drone_remote_log_level <= 0) {
            console.debug(...args);
        }
    }

    static info(...args) {
        if (window.__ojm_drone_remote_log_level <= 1) {
            console.log(...args);
        }
    }

    static warn(...args) {
        if (window.__ojm_drone_remote_log_level <= 2) {
            console.warn(...args);
        }
    }

    static error(...args) {
        if (window.__ojm_drone_remote_log_level <= 3) {
            console.error(...args);
        }
    }
}