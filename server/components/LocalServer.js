const WebSocket = require('ws');

const logger = require('./Logger.js');
const MessageHandlerServer = require('./MessageHandlerServer.js');
const { generateICEServerInfo } = require('./token.js');

const LOCAL_SERVER_PING_INTERVAL = 5000;

module.exports = class LocalServer extends MessageHandlerServer {

    constructor(httpServer) {
        super();

        const server = new WebSocket.Server({ noServer: true });

        this._startKeyLocalClientMap = new Map();

        httpServer.on('upgrade', (request, socket, head) => {

            const url = new URL( request.url, 'http://localhost');
            const pathname = url.pathname;
        
            if (pathname === '/signaling') {
        
                const startKey = url.searchParams.get('startKey');
        
                if(!this._startKeyLocalClientMap.has(startKey)) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }
        
                server.handleUpgrade(request, socket, head, ws => {
                    server.emit('connection', ws, request);
                });
            }
        
        });

        server.on('connection', (ws, request) => {

            const url = new URL( request.url, 'http://localhost');
            const startKey = url.searchParams.get('startKey');
        
            if (!this._startKeyLocalClientMap.has(startKey)) {
                logger.warn(`Invalid startKey: ${startKey.slice(0, 5)}...`);
                ws.close();
                return;
            }
        
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