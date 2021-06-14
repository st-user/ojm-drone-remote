const {
    MAX_LOCAL_CLIENT_COUNT,
    MAX_LOCAL_CLIENT_HTTP_BUF_SIZE,
    LOCAL_CLIENT_PING_INTERVAL,
    LOCAL_CLIENT_TIMEOUT_MILLIS,
    TICKET_EXPIRES_IN
} = require('./Environment.js');

const WebSocket = require('ws');
const crypto = require('crypto');

const logger = require('./Logger.js');
const MessageHandlerServer = require('./MessageHandlerServer.js');
const { generateICEServerInfo } = require('./token.js');


class RemoteConnectionManager {

    constructor(ws) {
        this.ws = ws;
    }

    start() {
        clearTimeout(this.timer);

        this.timer = setTimeout(() => {
            this._ping();
            this.start();
        }, LOCAL_CLIENT_PING_INTERVAL);
    }

    consumePong() {
        clearTimeout(this.stopTimer);

        this.stopTimer = setTimeout(() => {
            this.stop();
        }, LOCAL_CLIENT_TIMEOUT_MILLIS);
    }

    stop() {
        this.clear();

        const startKey = this.ws.__startKey;
        logger.info(`Close the peer ${startKey.slice(0, 5)}...`);

        if (this.ws.readyState !== WebSocket.CLOSED) {
            try {
                this.ws.close();
            } catch(e) {
                logger.error(e);
            }
            
        }
    }

    clear() {
        clearTimeout(this.timer);
        clearTimeout(this.stopTimer);
    }

    _ping() {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                messageType: 'ping'
            }));
        }
    }
}

module.exports = class LocalServer extends MessageHandlerServer {

    constructor(httpServer) {
        super();

        const server = new WebSocket.Server({ 
            noServer: true,
            maxPayload: MAX_LOCAL_CLIENT_HTTP_BUF_SIZE,
            clientTracking: true
        });

        this._startKeyLocalClientMap = new Map();
        this._tickets = new Map();

        httpServer.on('upgrade', (request, socket, head) => {

            const url = new URL( request.url, 'http://localhost');
            const pathname = url.pathname;
        
            if (pathname === '/signaling') {
        
                if (MAX_LOCAL_CLIENT_COUNT <= server.clients.size) {
                    const msg = `Over rate limit: ${server.clients.size}`;
                    logger.warn(msg);
                    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
                    socket.destroy();
                    return;
                }

                const ticket = url.searchParams.get('ticket');
                const startKey = this._tickets.get(ticket);
                this._tickets.delete(ticket);

                if(!this._startKeyLocalClientMap.has(startKey)) {
                    const _startKey = !startKey ? '' : startKey;
                    logger.warn(`Invalid startKey: ${_startKey.slice(0, 5)}...`);
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }
        
                server.handleUpgrade(request, socket, head, ws => {
                    server.emit('connection', ws, request, startKey);
                });
            }
        
        });

        server.on('connection', (ws, _request, startKey) => {
              
            this._startKeyLocalClientMap.set(startKey, ws);
            ws.__startKey = startKey;
        
            const remoteConnectionManager = new RemoteConnectionManager(ws);

            for (const [eventName, handlers] of this._messageHandlersMap.entries()) {
                ws.on(eventName, msg => {
                    if (eventName === 'message') {
                        const dataJson = JSON.parse(msg);
                        if (dataJson.messageType === 'pong') {
                            remoteConnectionManager.consumePong();                            
                        } else {
                            handlers.forEach(h => h.call(ws, ws, dataJson));
                        }
                    } else {
                        handlers.forEach(h => h.call(ws, ws, msg));
                    }

                });
            }

            ws.on('close', () => {
                remoteConnectionManager.clear();
            });      
        
            remoteConnectionManager.start();
            const iceServerInfo = generateICEServerInfo();
            ws.send(JSON.stringify({ 
                messageType: 'iceServerInfo',
                iceServerInfo
            }));
        });
    }

    setStartKey(startKey) {
        this._startKeyLocalClientMap.set(startKey, {});
    }

    generateTicket(startKey) {

        if (!this._startKeyLocalClientMap.has(startKey)) {
            return undefined;
        }

        const ticket = crypto.randomBytes(8).toString('hex');
        this._tickets.set(ticket, startKey);
        setTimeout(() => {
            if (this._tickets.has(ticket)) {
                this._tickets.delete(ticket);
                logger.warn(`A ticket for startKey has expired ${ticket.slice(0, 3)}...`);
            } 
        }, TICKET_EXPIRES_IN);

        return ticket;
    }

    send(startKey, data) {
        this._doWithLocalClient(startKey, localClient => {
            localClient.send(JSON.stringify(data));
        });        
    }


    isStartKeyUsed(startKey) {
        const localClient = this._startKeyLocalClientMap.get(startKey);
        return localClient && localClient.readyState === WebSocket.OPEN;
    }

    remove(startKey) {
        const localClient = this._startKeyLocalClientMap.get(startKey);
        if (!localClient || !localClient.close) {
            return;
        }
        try {
            localClient.close();
        } catch(e) {
            logger.error(e);
        }
    }

    _doWithLocalClient(startKey, handler) {
        const localClient = this._startKeyLocalClientMap.get(startKey);

        if (!localClient || localClient.readyState !== WebSocket.OPEN) {
            logger.warn(`Local client is not opened. ${startKey.slice(0, 5)}...`);
            return;
        }
        
        handler(localClient);
    }
};