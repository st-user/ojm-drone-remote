const { 
    remoteMessageSender,
    localMessageSender
} = require('./Storage.js');

const logger = require('./Logger.js');

module.exports = class UsageChecker {

    constructor(localServer) {
        this.checkers = [];

        setInterval(async () => {

            const usedKeys = localServer.getKeysOnOpenedSocket();
            if (usedKeys.length > 0) {
                logger.info(`Update timestamp of ${usedKeys.length} key(s)`);
            }
            for (const { startKey, sessionKey } of usedKeys) {

                await localMessageSender.updateRoomTimestamp(startKey);
                await remoteMessageSender.updateRoomTimestamp(startKey);

                await localMessageSender.updateSessionKeyTimestamp(sessionKey);
            }


        }, 1 * 60 * 1000);
    }

};