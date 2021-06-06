const WebSocket = require('ws');
const crypto = require('crypto');
const logger = require('./Logger.js');
const MessageHandlerServer = require('./MessageHandlerServer.js');
const { generateICEServerInfo } = require('./token.js');

const LOCAL_SERVER_PING_INTERVAL = 5000;
const TICKET_EXPIRES_IN = 30000;

module.exports = class LocalServer extends MessageHandlerServer {

    constructor(httpServer) {
        super();

        const server = new WebSocket.Server({ noServer: true });

        this._startKeyLocalClientMap = new Map();
        this._tickets = new Map();

        httpServer.on('upgrade', (request, socket, head) => {

            const url = new URL( request.url, 'http://localhost');
            const pathname = url.pathname;
        
            if (pathname === '/signaling') {
        
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
        
            let pingTimer;
            const ping = () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        messageType: 'ping'
                    }));
                }
            };
            const doPing = () => {
                ping();
                pingTimer = setTimeout(doPing, LOCAL_SERVER_PING_INTERVAL);
            };
            doPing();

            for (const [eventName, handlers] of this._messageHandlersMap.entries()) {
                ws.on(eventName, msg => {
                    handlers.forEach(h => h.call(ws, ws, msg));
                });
            }

            ws.on('close', () => {
                clearTimeout(pingTimer);
            });      
        
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
                logger.warn(`A ticket for startKey has expired ${ticket.slice(0 ,3)}...`);
            } 
        }, TICKET_EXPIRES_IN);

        return ticket;
    }

    send(startKey, data) {
        this._doWithLocalClient(startKey, localClient => {
            localClient.send(JSON.stringify(data));
        });        
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