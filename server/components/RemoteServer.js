const {
    MAX_REMOTE_CLIENT_COUNT,
    MAX_REMOTE_CLIENT_HTTP_BUF_SIZE,
    REMOTE_CLIENT_TIMEOUT_MILLIS,
    REMOTE_CLIENT_PING_INTERVAL
} = require('./Environment.js');

const logger = require('./Logger.js');
const MessageHandlerServer = require('./MessageHandlerServer.js');
const { generateICEServerInfo } = require('./token.js');


module.exports = class RemoteServer extends MessageHandlerServer {  

    constructor(server) {
        super();

        const io = require('socket.io')(server, {
            path: '/remote',
            serveClient: false,
            pingTimeout: REMOTE_CLIENT_TIMEOUT_MILLIS,
            pingInterval: REMOTE_CLIENT_PING_INTERVAL,
            maxHttpBufferSize: MAX_REMOTE_CLIENT_HTTP_BUF_SIZE
        });
        this._startKeyRemoteClientMap = new Map();

        io.use((socket, next) => {

            if (MAX_REMOTE_CLIENT_COUNT <= io.sockets.size) {
                const msg = `Over rate limit: ${io.socket.size}`;
                logger.warn(msg);
                next(new Error(msg));
                return;
            } 

            const startKey = socket.handshake.auth.token;
            const { peerConnectionId, isPrimary } = socket.handshake.query;

            if (!this._startKeyRemoteClientMap.has(startKey)) {
                const msg = `Invalid startKey: ${startKey.slice(0, 5)}...`;
                logger.warn(msg);
                next(new Error(msg));
                return;
            }

            // https://socket.io/docs/v4/server-socket-instance/#Socket-data
            socket.data.clientInfo = {
                startKey,
                peerConnectionId,
                isPrimary: isPrimary === 'true'
            };

            const peerConnectionIdRemoteClientMap = this._startKeyRemoteClientMap.get(startKey);
            peerConnectionIdRemoteClientMap.set(peerConnectionId, socket);

            socket.on('disconnect', reasson => {
                logger.warn(`${reasson} - ${peerConnectionId}`);
                peerConnectionIdRemoteClientMap.delete(peerConnectionId);
            });

            for (const [eventName, handlers] of this._messageHandlersMap.entries()) {
                socket.on(eventName, msg => {
                    handlers.forEach(h => h.call(socket, socket, msg));
                });
            }

            logger.debug(`Requested peer: ${peerConnectionId}/${isPrimary}`);

            next();
        });

        io.on('connection', socket => {
            const iceServerInfo = generateICEServerInfo();
            socket.emit('iceServerInfo', {
                iceServerInfo
            });
        });
    }

    setStartKeyIfAbsent(startKey) {
        if (!this._startKeyRemoteClientMap.has(startKey)) {
            this._startKeyRemoteClientMap.set(startKey, new Map());
        }
    }

    send(startKey, peerConnectionId, messageType, data) {
        const sockets = this._startKeyRemoteClientMap.get(startKey);
        if (!sockets) {
            logger.warn('Remote client is not opened. The startkey should be invalid');
            return;
        }
        const socket = sockets.get(peerConnectionId);
        if (!socket || !socket.connected) {
            logger.warn(`Remote client is not opened. The peerId(${peerConnectionId}) should be invalid`);
            return;
        }
        socket.emit(messageType, data);
    }

    isStartKeyUsed(startKey) {
        const sockets = this._startKeyRemoteClientMap.get(startKey);
        if (!sockets || sockets.size === 0) {
            return false;
        }
        for (const socket of sockets.values()) {
            if (socket.connected) {
                return true;
            }
        }
        return false;
    }

    remove(startKey) {
        const sockets = this._startKeyRemoteClientMap.get(startKey);
        if (!sockets) {
            return;
        }
        for (const socket of sockets.values()) {
            try {
                socket.close();
            } catch(e) {
                logger.error(e);
            }
        }
        this._startKeyRemoteClientMap.delete(startKey);
    }
};