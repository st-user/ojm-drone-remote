const {
    START_KEY_TIMEOUT_CHECK_INTERVAL,
    START_KEY_TIMEOUT_MILLIS
} = require('./Environment.js');

const logger = require('./Logger.js');
const storage = require('./Storage.js');

module.exports = class StartKeySweeper {
    
    
    constructor(localServer, remoteServer) {
        this._startKeyTimestampMap = new Map();
        
        setInterval(async () => {

            const current = Date.now();
            for (const [startKey, timestamp] of this._startKeyTimestampMap.entries()) {

                if(localServer.isStartKeyUsed(startKey) || remoteServer.isStartKeyUsed(startKey)) {
                    logger.debug('StartKey is used');
                    await this.setStartKeyWithTimestamp(startKey, current);
                    continue;
                }

                if (current - timestamp < START_KEY_TIMEOUT_MILLIS) {
                    logger.debug('StartKey is not timeout');
                    continue;
                }

                localServer.remove(startKey);
                remoteServer.remove(startKey);
                await this._removeStartKey(startKey);

                logger.info(`StartKey timeout ${startKey.slice(0, 5)}...`);
            }



        }, START_KEY_TIMEOUT_CHECK_INTERVAL);
    }    

    async setStartKey(startKey) {
        await this.setStartKeyWithTimestamp(startKey, Date.now());
    }

    async setStartKeyWithTimestamp(startKey, timestamp) {
        this._startKeyTimestampMap.set(startKey, timestamp);
        await storage.updateStartKey(startKey, timestamp);
    }

    async _removeStartKey(startKey) {
        this._startKeyTimestampMap.delete(startKey);
        await storage.deleteStartKey(startKey);
    }
};