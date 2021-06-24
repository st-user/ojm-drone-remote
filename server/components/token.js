const environment = require('./Environment.js');
const SECRETS = environment.isDevelopment ? undefined : environment.TURN_SECRETS;
const {
    HOURS_TURN_CREDENTIAL_VALID,
    STUN_URLS,
    TURN_URLS
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

const verify = async (inputToken, hashes) => {

    
    const check = hash => {
        return new Promise(resolve => {

            const [salt, key] = hash.split(':');
    
            crypto.scrypt(inputToken, salt, 64, (error, derivedKey) => {
    
                if (error) {
                    resolve(false);
                } else {
                    resolve(key === derivedKey.toString('hex'));
                }
            });
    
        });
    };

    for (const hash of hashes) {
        const ret = await check(hash);
        if (ret) {
            return true;
        }
    }
    return false;
};

const generateTurnCredentials = (secret, name) => {

    if (!secret || !HOURS_TURN_CREDENTIAL_VALID) {
        return undefined;
    }

    const timestamp = parseInt(Date.now() / 1000) + HOURS_TURN_CREDENTIAL_VALID * 3600;
    const username = `${timestamp}:${name}`;

    const hmac = crypto.createHmac('sha1', secret);
    hmac.setEncoding('base64');
    hmac.write(username);
    hmac.end();

    const credential = hmac.read();

    return {
        username: username,
        credential: credential
    };
};

const generateICEServerInfo = () => {

    if (!SECRETS) {
        return undefined;
    }

    const secrets = SECRETS.split(',');
    const stuns = STUN_URLS.split(',');
    const turns = TURN_URLS.split(',');
    const iceServers = [];

    secrets.forEach((sec, index) => {
        const stun = stuns[index];
        const turn = turns[index];
        const { username, credential } = generateTurnCredentials(sec, crypto.randomBytes(8).toString('hex'));

        iceServers.push({
            urls: [stun]
        });
        iceServers.push({
            urls: [turn],
            username, credential
        });
    });  

    const iceServerInfo = { iceServers };

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