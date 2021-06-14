const {
    STORAGE_PROJEDT_ID,
    STORAGE_KEY_PATH
} = require('./Environment.js');

const Firestore = require('@google-cloud/firestore');

module.exports = class Storage {

    constructor() {
        this._db = new Firestore({
            projectId: STORAGE_PROJEDT_ID,
            keyFilename: STORAGE_KEY_PATH,
        });
    }

    async getAccessTokens() {
        const snapshot = await this._db.collection('accessKeyHashes').get();
        const ret = [];
        snapshot.forEach(doc => {
            ret.push(doc.data().value);
        });
        return ret;
    }
};