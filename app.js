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

const app = express();
app.use('/', express.static('public'));


const startKeyLocalClientMap = new Map();
const startKeyRemoteClientMap = new Map();



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
        startKeyRemoteClientMap.set(startKey, {});
    }

    res.json({ startKey });
});

const httpServer = app.listen(PORT, () => {
    console.log(`Listening on ${PORT}.`);
});

const signalingServer = new WebSocket.Server({ noServer: true });
const remoteServer = new WebSocket.Server({ noServer: true });


signalingServer.on('connection', (ws, request) => {

    const url = new URL( request.url, 'http://localhost');
    const startKey = url.searchParams.get('startKey');

    if (!startKeyLocalClientMap.has(startKey)) {
        console.log(`Invalid startKey: ${startKey}`);
        ws.close()
        return;
    }

    startKeyLocalClientMap.set(startKey, ws);
    ws.__startKey = startKey;

    ws.on('message', data => {

        const dataJson = JSON.parse(data);
        const messageType = dataJson.messageType;

        const startKey = ws.__startKey;
        const remoteClient = startKeyRemoteClientMap.get(startKey);

        if (!remoteClient || remoteClient.readyState !== WebSocket.OPEN) {
            console.log(`Remote client is not opened.`);
            return;
        }

        switch(messageType) {
        case 'answer':
            remoteClient.send(JSON.stringify({
                messageType: 'answer',
                answer: dataJson.answer
            }));
            break;
        case 'canOffer':
            remoteClient.send(JSON.stringify({
                messageType: 'canOffer',
                canOffer: dataJson.canOffer
            }));
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

    if (!startKeyLocalClientMap.has(startKey)) {
        console.log(`Invalid startKey: ${startKey}`);
        ws.close()
        return;
    }

    startKeyRemoteClientMap.set(startKey, ws);
    ws.__startKey = startKey;

    ws.on('message', data => {

        const dataJson = JSON.parse(data);
        const messageType = dataJson.messageType;

        const startKey = ws.__startKey;
        const localClient = startKeyLocalClientMap.get(startKey);

        if (!localClient || localClient.readyState !== WebSocket.OPEN) {
            console.log(`Local client is not opened.`);
            return;
        }

        
        switch(messageType) {
        case 'offer':
            localClient.send(JSON.stringify({
                messageType: 'offer',
                offer: dataJson.offer
            }));
            break;
        case 'canOffer':
            localClient.send(JSON.stringify({
                messageType: 'canOffer',
                peerConnectionId: dataJson.peerConnectionId
            }));
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

httpServer.on('upgrade', (request, socket, head) => {

    const url = new URL( request.url, 'http://localhost');
    const pathname = url.pathname;

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
