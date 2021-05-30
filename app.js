const express = require('express');
const crypto = require('crypto');
const WebSocket = require('ws');
const { verify, generateTurnCredentials } = require('./tools/token.js');

require('dotenv').config();
console.log(`Environment: ${process.env.NODE_ENV}`);

const PORT = process.env.PORT;
const TOKEN_HASH = process.env.TOKEN_HASH;
const STUN_URL = process.env.STUN_URL;
const TURN_URL = process.env.TURN_URL;
const REMOTE_TIMEOUT_MILLIS = (process.env.PRIMARY_TIMEOUT_SEC || 10) * 1000;
const REMOTE_TIMEOUT_CHECK_INTERVAL_MILLIS = 1000;

const app = express();
app.use('/', express.static('public'));
app.use('/audience', express.static('public'));

const startKeyLocalClientMap = new Map();
const startKeyRemoteClientMap = new Map();

const httpServer = app.listen(PORT, () => {
    console.log(`Listening on ${PORT}.`);
});

const signalingServer = new WebSocket.Server({ noServer: true });
const remoteServer = new WebSocket.Server({ noServer: true });



const generateKey = () => {
    const buff = crypto.randomBytes(16);
    return buff.toString('hex');
};

app.get('/generateKey', async (req, res) => {

    const bearerToken = req.headers['authorization'] || '';
    const [ bearerStr, inputToken ] = bearerToken.split(' ');

    const isTokenValid = bearerStr === 'bearer' && await verify(inputToken || '', TOKEN_HASH);
    if (!isTokenValid) {
        res.status(401);
        res.setHeader('WWW-Authenticate', 'Bearer realm=""');
        res.send('');
        return;
    }

    const startKey = generateKey();
 
    startKeyLocalClientMap.set(startKey, {});

    if (!startKeyRemoteClientMap.has(startKey)) {
        startKeyRemoteClientMap.set(startKey, new Map());
    }

    res.json({ startKey });
});

class RemoteConnectionManager {

    constructor(peerConnectionId, isPrimary, ws, localClientSupplier) {
        this._peerConnectionId = peerConnectionId;
        this._isPrimary = isPrimary;
        this.ws = ws;
        this._localClientSupplier = localClientSupplier;
    }

    start() {
        this.timer = setTimeout(() => {
            this._ping();
            this.start();
        }, REMOTE_TIMEOUT_CHECK_INTERVAL_MILLIS);
    }

    consumePong() {
        clearTimeout(this.stopTimer);
        this.stopTimer = setTimeout(() => {
            this.stop();
        }, REMOTE_TIMEOUT_MILLIS);
    }

    stop() {
        clearTimeout(this.timer);
        clearTimeout(this.stopTimer);
        console.log(' !!!! ____ _close ____ !!!! ');

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        const localClient = this._localClientSupplier();
        if (!localClient) {
            console.log('Local client is not opened.');
            return;
        }
        localClient.send(JSON.stringify({
            messageType: 'close',
            peerConnectionId: this._peerConnectionId,
            isPrimary: this._isPrimary
        }));
    }

    _ping() {
        this.ws.send(JSON.stringify({
            messageType: 'ping'
        }));
    }
}

signalingServer.on('connection', (ws, request) => {

    const url = new URL( request.url, 'http://localhost');
    const startKey = url.searchParams.get('startKey');

    if (!startKeyLocalClientMap.has(startKey)) {
        console.log(`Invalid startKey: ${startKey}`);
        ws.close();
        return;
    }

    startKeyLocalClientMap.set(startKey, ws);
    ws.__startKey = startKey;

    ws.on('message', data => {

        const dataJson = JSON.parse(data);
        const messageType = dataJson.messageType;
        const peerConnectionId = dataJson.peerConnectionId;

        const startKey = ws.__startKey;
        const remoteClients = startKeyRemoteClientMap.get(startKey);

        if (!remoteClients) {
            console.log('Remote client is not opened.');
            return;
        }
        const remoteClient = remoteClients.get(peerConnectionId);
        if (!remoteClient || remoteClient.readyState !== WebSocket.OPEN) {
            console.log('Remote client is not opened.');
            return;
        }

        switch(messageType) {
        case 'answer':
        case 'canOffer':
            remoteClient.send(data);
            break;
        default:
            console.log(`Unexpected messageType from local: ${messageType}.`);
            return;
        }
        
    });

    const credentials = generateTurnCredentials(crypto.randomBytes(8).toString('hex'));
    const iceServerInfo = !credentials ? undefined : {
        stun: STUN_URL,
        turn: TURN_URL,
        credentials
    };

    ws.send(JSON.stringify({ 
        messageType: 'iceServerInfo',
        iceServerInfo
    }));
});

remoteServer.on('connection', (ws, request) => {

    const url = new URL( request.url, 'http://localhost');
    const startKey = url.searchParams.get('startKey');
    const peerConnectionId = parseFloat(url.searchParams.get('peerConnectionId'));
    const isPrimary = url.searchParams.get('isPrimary') === 'true';

    console.log(`Requested peer: ${startKey}/${peerConnectionId}/${isPrimary}`);
    if (!startKeyLocalClientMap.has(startKey)) {
        console.log(`Invalid startKey: ${startKey}`);
        ws.close();
        return;
    }

    const peerConnectionIdRemoteClientMap = startKeyRemoteClientMap.get(startKey);
    peerConnectionIdRemoteClientMap.set(peerConnectionId, ws);
    ws.__startKey = startKey;
    ws.__peerConnectionId = peerConnectionId;

    const _getLocalClient = () => {
        const localClient = startKeyLocalClientMap.get(startKey);

        if (!localClient || localClient.readyState !== WebSocket.OPEN) {
            console.log('Local client is not opened.');
            return;
        }
        return localClient;
    };

    const connectionManager = new RemoteConnectionManager(
        peerConnectionId, isPrimary, ws, _getLocalClient
    );

    ws.on('message', data => {

        const dataJson = JSON.parse(data);
        const messageType = dataJson.messageType;

        const localClient = _getLocalClient();
        if (!localClient) {
            return;
        }       

        switch(messageType) {
        case 'offer':
            connectionManager.start();
            localClient.send(data);
            break;
        case 'canOffer':
            localClient.send(data);
            break;
        case 'pong':
            connectionManager.consumePong();
            break;
        default:
            console.log(`Unexpected messageType from local: ${messageType}.`);
            return;
        }
        
    });

    ws.on('close', () => {
        peerConnectionIdRemoteClientMap.delete(ws.__peerConnectionId);
        connectionManager.stop();
    });

    const credentials = generateTurnCredentials(crypto.randomBytes(8).toString('hex'));
    const iceServerInfo = !credentials ? undefined : {
        stun: STUN_URL,
        turn: TURN_URL,
        credentials
    };

    ws.send(JSON.stringify({ 
        messageType: 'iceServerInfo',
        iceServerInfo
    }));
});

httpServer.on('upgrade', (request, socket, head) => {

    const url = new URL( request.url, 'http://localhost');
    const pathname = url.pathname;
    const startKey = url.searchParams.get('startKey');

    if(!startKeyLocalClientMap.has(startKey)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    if (pathname === '/signaling') {

        signalingServer.handleUpgrade(request, socket, head, ws => {
            signalingServer.emit('connection', ws, request);
        });
    }

    if (pathname === '/remote') {

        remoteServer.handleUpgrade(request, socket, head, ws => {
            remoteServer.emit('connection', ws, request);
        });
    }

});
