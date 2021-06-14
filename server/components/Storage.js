const {
    isDevelopment,
    STORAGE_PROJEDT_ID,
    STORAGE_KEY_PATH
} = require('./Environment.js');

const Firestore = require('@google-cloud/firestore');

const logger = require('./Logger.js');

if (!STORAGE_PROJEDT_ID && isDevelopment) {

    logger.info('STORAGE_PROJEDT_ID is empty and NODE_ENV is development so use static access token.');

    class Storage {
        async getAccessTokens() {
            return [
                // key_for_test
                '5c7f54ceaadad2a8cd17bd862ff05945:77d662c4eb26421d7de51c211cf7574c30a9e412268487e7e50568adcb2e5e7fa0f87e6bf9177dece49b1c21a3d097c479df365b79e1032b54c77525733c774c'
            ];
        }

        async getStartKeys() {
            return [];
        }

        async deleteStartKey() {
        }

        async updateStartKey() {
        }

    }
    module.exports = new Storage();

} else {
    class Storage {

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

        async getStartKeys() {
            const snapshot = await this._db.collection('startKeys').get();
            const ret = [];
            snapshot.forEach(doc => {
                ret.push({
                    startKey: doc.id,
                    timestamp: doc.data().timestamp
                });
            });

            return ret;
        }
    
        async updateStartKey(startKey, timestamp) {

            const collectionRef = this._db.collection('startKeys');
            await this._db.runTransaction(async t => {

                const docRef = await collectionRef.doc(startKey);
                const doc = await t.get(docRef);
                    
                if (!doc.data()) {
                    docRef.set({ timestamp });   
                } else {
                    t.update(docRef, { timestamp });
                }
    
            });
        }

        async deleteStartKey(startKey) {
            return await this._db.collection('startKeys').doc(startKey).delete();
        }
    }

    module.exports = new Storage();
}

