const express = require('express');
const crypto = require('crypto');
const WebSocket = require('ws');
const { verify, generateTurnCredentials } = require('./components/token.js');
const logger = require('./components/Logger.js');
const RemoteServer = require('./components/RemoteServer.js');

require('dotenv').config();

const PORT = process.env.PORT;
const TOKEN_HASH = process.env.TOKEN_HASH;
const STUN_URL = process.env.STUN_URL;
const TURN_URL = process.env.TURN_URL;

const app = express();

app.use('/', express.static('dist'));
app.use('/audience', express.static('dist'));
logger.level = process.env.LOG_LEVEL || 'info';


logger.info(`Environment: ${process.env.NODE_ENV}`);


const httpServer = app.listen(PORT, () => {
    logger.info(`Listening on ${PORT}.`);
});

const startKeyLocalClientMap = new Map();
const signalingServer = new WebSocket.Server({ noServer: true });
const remoteServer = new RemoteServer(httpServer);



const generateKey = () => {
    const buff = crypto.randomBytes(16);
    return buff.toString('hex');
};

app.get('/generateKey', async (req, res) => {

    const bearerToken = req.headers['authorization'] || '';
    const [ bearerStr, inputToken ] = bearerToken.split(' ');

    const isTokenValid = bearerStr === 'bearer' && await verify(inputToken || '', TOKEN_HASH);
    if (!isTokenValid) {
        logger.warn('Invalid token.');
        res.status(401);
        res.setHeader('WWW-Authenticate', 'Bearer realm=""');
        res.send('');
        return;
    }

    const startKey = generateKey();
 
    startKeyLocalClientMap.set(startKey, {});
    remoteServer.setStartKeyIfAbsent(startKey);

    res.json({ startKey });
});

signalingServer.on('connection', (ws, request) => {

    const url = new URL( request.url, 'http://localhost');
    const startKey = url.searchParams.get('startKey');

    if (!startKeyLocalClientMap.has(startKey)) {
        logger.warn(`Invalid startKey: ${startKey.slice(0, 5)}...`);
        ws.close();
        return;
    }

    startKeyLocalClientMap.set(startKey, ws);
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
        pingTimer = setTimeout(doPing, 5000);
    };
    doPing();
    
    ws.on('message', data => {

        const dataJson = JSON.parse(data);
        const messageType = dataJson.messageType;

        if (messageType === 'pong') {
            return;
        }

        const peerConnectionId = dataJson.peerConnectionId;
        const startKey = ws.__startKey;
        remoteServer.send(
            startKey, peerConnectionId,
            messageType, dataJson
        );
        
    });

    const credentials = generateTurnCredentials(crypto.randomBytes(8).toString('hex'));
    const iceServerInfo = !credentials ? undefined : {
        stun: STUN_URL,
        turn: TURN_URL,
        credentials
    };

    ws.on('close', () => {
        clearTimeout(pingTimer);
    });

    ws.send(JSON.stringify({ 
        messageType: 'iceServerInfo',
        iceServerInfo
    }));
});

remoteServer.onconnection(socket => {

    const credentials = generateTurnCredentials(crypto.randomBytes(8).toString('hex'));
    const iceServerInfo = !credentials ? undefined : {
        stun: STUN_URL,
        turn: TURN_URL,
        credentials
    };

    socket.emit('iceServerInfo', {
        iceServerInfo
    });

});

const _doWithLocalClient = (startKey, handler) => {
    const localClient = startKeyLocalClientMap.get(startKey);

    if (!localClient || localClient.readyState !== WebSocket.OPEN) {
        logger.warn(`Local client is not opened. ${startKey.slice(0, 5)}...`);
        return;
    }
    
    handler(localClient);
};

remoteServer.on(['offer', 'canOffer'], (socket, data) => {

    logger.debug(data);

    const { startKey } = socket.data.clientInfo;
    _doWithLocalClient(startKey, localClient => {
        localClient.send(JSON.stringify(data));
    });
});

remoteServer.on('disconnect', socket => {

    const { startKey, peerConnectionId, isPrimary } = socket.data.clientInfo;

    _doWithLocalClient(startKey, localClient => {

        localClient.send(JSON.stringify({
            messageType: 'close',
            peerConnectionId, isPrimary
        }));

    });

});

httpServer.on('upgrade', (request, socket, head) => {

    const url = new URL( request.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/signaling') {

        const startKey = url.searchParams.get('startKey');

        if(!startKeyLocalClientMap.has(startKey)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        signalingServer.handleUpgrade(request, socket, head, ws => {
            signalingServer.emit('connection', ws, request);
        });
    }

});
