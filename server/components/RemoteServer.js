const {
    MAX_REMOTE_CLIENT_COUNT,
    MAX_REMOTE_CLIENT_HTTP_BUF_SIZE
} = require('./Environment.js');


const events = require('events');

const { v4: uuidv4 } = require('uuid');

const logger = require('./Logger.js');
const MessageHandlerServer = require('./MessageHandlerServer.js');
const { generateICEServerInfo } = require('./token.js');
const { remoteEventManager, remoteMessageSender } = require('./Storage.js');

const em = new events.EventEmitter();

module.exports = class RemoteServer extends MessageHandlerServer {  

    constructor(app) {
        super();

        app.post('/remote/startObserving', async (req, res) => {

            const { startKey } = req.body;
       
            if (!remoteMessageSender.hasRoom(startKey)) {
                res.sendStatus(403);
                return;
            }
        
            const sessionKey = uuidv4();
            await remoteMessageSender.setSessionKey(
                sessionKey, startKey
            );        

            const iceServerInfo = generateICEServerInfo();
            res.send({ 
                sessionKey,
                data: { iceServerInfo }
            });

        });

        app.post('/remote/observe', async (req, res) => {

            const { sessionKey, query } = req.body;
            const { peerConnectionId } = query;

            const { roomId } = await remoteMessageSender.checkSessionKey(sessionKey);

            if (!roomId) {
                res.sendStatus(403);
                return;
            }
      
            const eventName = `message_for_${roomId}_${peerConnectionId}`;
            const handleData = async () => {
                const existingData = await remoteMessageSender.checkAllData(sessionKey);
                if (existingData && existingData.length > 0) {
                    res.send(existingData);
                    return true;
                }
                return false;
            };
        
            if (await handleData()) {
                logger.debug('check messages.');
                return;
            }
        
            const handler = async () => {
                clearTimeout(timer);
                if (!await handleData()) {
                    res.send([]);
                }
            };
        
            let timer = setTimeout(() => {
                em.removeListener(eventName, handler);
                res.send([]);
            }, 5 * 60 * 1000);
        
            em.once(eventName, handler);            

        });

        app.post('/remote/send', async (req, res) => {

            const { sessionKey, eventName, message } = req.body;
        
            const { roomId } = await remoteMessageSender.checkSessionKey(sessionKey);

            if (!roomId) {
                res.sendStatus(403);
                return;
            }
        
            const handlers = this._messageHandlersMap.get(eventName);
            handlers.forEach(h => h.call({}, {
                startKey: roomId
            }, message));
        
            res.end();
        });

        remoteEventManager.on('message', ({ detail }) => {

            const eventName = `message_for_${detail.roomId}_${detail.peerConnectionId}`;

            logger.debug(eventName);
            em.emit(eventName, detail.messageType);
        });
    }

    async setStartKeyIfAbsent(startKey) {
        if (!await remoteMessageSender.hasRoom(startKey)) {
            await remoteMessageSender.setRoom(startKey);
        }
    }

    async send(startKey, peerConnectionId, messageType, data) {
        await remoteMessageSender.sendMessage(
            { eventName: messageType, data },
            startKey
        );

        await remoteEventManager.trigger('message', {
            roomId: startKey,
            peerConnectionId,
        });
    }
};