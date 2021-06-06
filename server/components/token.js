const environment = require('./Environment.js');
const SECRET = environment.isDevelopment ? undefined : environment.TURN_SECRET;
const {
    HOURS_TURN_CREDENTIAL_VALID,
    STUN_URL,
    TURN_URL
} = environment;

const crypto = require('crypto');


const createHash = token => {

    return new Promise((resolve, reject) => {

        const salt = crypto.randomBytes(16).toString('hex');

        crypto.scrypt(token, salt, 64, (error, derivedKey) => {

            if (error) {
                reject(error);
            } else {
                resolve(`${salt}:${derivedKey.toString('hex')}`);
            }
        });

    });
};

const generateToken = async () => {

    const token = crypto.randomBytes(32).toString('hex');
    const hash = await createHash(token);

    return { token, hash };
};

const generateTokenByToken = async token => {

    const hash = await createHash(token);

    return { token, hash };
};

const verify = (inputToken, hash) => {

    return new Promise((resolve, reject) => {

        const [salt, key] = hash.split(':');

        crypto.scrypt(inputToken, salt, 64, (error, derivedKey) => {

            if (error) {
                reject(error);
            } else {
                resolve(key === derivedKey.toString('hex'));
            }
        });

    });

};

const generateTurnCredentials = name => {

    if (!SECRET || !HOURS_TURN_CREDENTIAL_VALID) {
        return undefined;
    }

    const timestamp = parseInt(Date.now() / 1000) + HOURS_TURN_CREDENTIAL_VALID * 3600;
    const username = `${timestamp}:${name}`;

    const hmac = crypto.createHmac('sha1', SECRET);
    hmac.setEncoding('base64');
    hmac.write(username);
    hmac.end();

    const password = hmac.read();

    return {
        username: username,
        password: password
    };
};

const generateICEServerInfo = () => {
    const credentials = generateTurnCredentials(crypto.randomBytes(8).toString('hex'));
    const iceServerInfo = !credentials ? undefined : {
        stun: STUN_URL,
        turn: TURN_URL,
        credentials
    };

    return iceServerInfo;
};

module.exports = {
    createHash,
    generateToken,
    generateTokenByToken,
    verify,
    generateTurnCredentials,
    generateICEServerInfo
};