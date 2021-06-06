require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const { verify } = require('./components/token.js');
const logger = require('./components/Logger.js');
const RemoteServer = require('./components/RemoteServer.js');
const LocalServer = require('./components/LocalServer.js');

const PORT = process.env.PORT;
const TOKEN_HASH = process.env.TOKEN_HASH;

const app = express();

app.use(express.json());
app.use('/', express.static('dist'));
app.use('/audience', express.static('dist'));


logger.info(`Environment: ${process.env.NODE_ENV}`);


const httpServer = app.listen(PORT, () => {
    logger.info(`Listening on ${PORT}.`);
});

const localServer = new LocalServer(httpServer);
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
 
    localServer.setStartKey(startKey);
    remoteServer.setStartKeyIfAbsent(startKey);

    res.json({ startKey });
});

app.post('/ticket', (req, res) => {

    const { startKey } = req.body;

    const ticket = localServer.generateTicket(startKey);
    if (!ticket) {
        const _startKey = !startKey ? '' : startKey;
        logger.warn(`Invalid startKey: ${_startKey.slice(0, 5)}...`);
        res.status(401);
        res.send('Invalid startKey');
        return;
    }

    res.json({ ticket });
});

localServer.on('message', (ws, data) => {

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

remoteServer.on(['offer', 'canOffer'], (socket, data) => {

    logger.debug(data);

    const { startKey } = socket.data.clientInfo;
    localServer.send(startKey, data);
});

remoteServer.on('disconnect', socket => {

    const { startKey, peerConnectionId, isPrimary } = socket.data.clientInfo;

    localServer.send(startKey, {
        messageType: 'close',
        peerConnectionId, isPrimary
    });

});