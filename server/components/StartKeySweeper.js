const {
    START_KEY_TIMEOUT_CHECK_INTERVAL,
    START_KEY_TIMEOUT_MILLIS
} = require('./Environment.js');

const logger = require('./Logger.js');

module.exports = class StartKeySweeper {
    
    
    constructor(localServer, remoteServer) {
        this._startKeyTimestampMap = new Map();
        
        setInterval(() => {

            const current = Date.now();
            for (const [startKey, timestamp] of this._startKeyTimestampMap.entries()) {

                if(localServer.isStartKeyUsed(startKey) || remoteServer.isStartKeyUsed(startKey)) {
                    logger.debug('StartKey is used');
                    this._startKeyTimestampMap.set(startKey, current);
                    continue;
                }

                if (current - timestamp < START_KEY_TIMEOUT_MILLIS) {
                    logger.debug('StartKey is not timeout');
                    continue;
                }

                localServer.remove(startKey);
                remoteServer.remove(startKey);
                this._startKeyTimestampMap.delete(startKey);

                logger.info(`StartKey timeout ${startKey.slice(0, 5)}...`);
            }



        }, START_KEY_TIMEOUT_CHECK_INTERVAL);
    }    

    setStartKey(startKey) {
        this._startKeyTimestampMap.set(startKey, Date.now());
    }
};