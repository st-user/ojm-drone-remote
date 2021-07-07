const {
    isDevelopment,
    STORAGE_PROJEDT_ID,
    STORAGE_KEY_PATH
} = require('./Environment.js');

const Firestore = require('@google-cloud/firestore');
const { v4: uuidv4 } = require('uuid');

const logger = require('./Logger.js');

if (!STORAGE_PROJEDT_ID && isDevelopment) {

    logger.info('STORAGE_PROJEDT_ID is empty and NODE_ENV is development so use static access token.');

    class EventManager {
        // TODO
    }

    class MessageSender {
        // TODO
    }

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
    module.exports = {
        storage: new Storage(),
        remoteEventManager: new EventManager('remote'),
        localEventManager: new EventManager('local'),
        remoteMessageSender: new MessageSender('remote'),
        localMessageSender: new MessageSender('local')
    };

} else {

    const firestoreDb = new Firestore({
        projectId: STORAGE_PROJEDT_ID,
        keyFilename: STORAGE_KEY_PATH,
    });

    class Storage {

        constructor(db) {
            this._db = db;
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

    class EventManager {

        constructor(context, firestoreDb) {
            this._eventCollectionName = `${context}_events`;
            this._handlers = new Map();
            this._db = firestoreDb;
            this._db.collection(this._eventCollectionName).onSnapshot(async qs => {
    
                qs.docChanges().forEach(ch => {
    
                    if (ch.type === 'added') {
    
                        const docData = ch.doc.data();
                        const eventName = docData.eventName;
                        const detail = docData.detail;
    
                        logger.debug(`handle ${eventName}`);
    
                        const handlers = this._handlers.get(eventName);
                        if (!handlers) {
                            return;
                        }
                        handlers.forEach(handler => {
                            handler.call({}, { detail });
                        });
    
                    } else {
                        logger.debug(`Not new message ${ch.type}`);
                    }
                });
            });
        }
    
        async trigger(eventData) {
            const docId = uuidv4();
            await this._db.collection(this._eventCollectionName).doc(docId).set(eventData);
        }
    
        on(eventName, handler) {
            let _handlerArr = this._handlers.get(eventName);
            if (!_handlerArr) {
                _handlerArr = [];
                this._handlers.set(eventName, _handlerArr);
            }
            _handlerArr.push(handler);
        }
    }

    class MessageSender {

        constructor(context, firestoreDb) {
            this._sessionKeyCollectionName = `${context}_sessionKeys`;
            this._roomCollectionName = `${context}_rooms`;
            this._ticketCollectionName = `${context}_tickets`;
            this._db = firestoreDb;
        }
    
        async checkAllData(sessionKey) {
            
            let ret = new Set();
            const sessRef = this._db.collection(this._sessionKeyCollectionName).doc(sessionKey);
            const sessDoc = await sessRef.get();
            const sessData = sessDoc.data();
            if (!sessData) {
                return [];
            }
            const roomId = sessData.detail.roomId;
            const roomRef = this._db.collection(this._roomCollectionName).doc(roomId);
    
            const start = Date.now();
            await this._db.runTransaction(async t => {
    
                const roomDoc = await t.get(roomRef);
                const roomData = roomDoc.data();
    
                const msgs = roomData.detail.messages;
                for (const msg of msgs) {
                    const { message } = msg;
                    if (msg[sessionKey]) {
                        ret.add(message);
                    }
                    delete msg[sessionKey];
                    msg.cnt--;
                }
    
                msgs.some((v, i) => {
                    if (v.cnt <= 0) {
                        msgs.splice(i, 1);
                    }
                });
    
                t.update(roomRef, {
                    timestamp: Date.now(),
                    detail: {
                        messages: msgs
                    }
                });
    
            });
            const end = Date.now();
            logger.debug(`elapsed on checkAllData tx ${(end - start) / 1000}sec.`);
    
            return Array.from(ret);
        }
    
        async setSessionKey(sessionKey, roomId, data) {
            const detail = { roomId };
            if (data) {
                detail.data = data;
            }
            
            await this._db.collection(this._sessionKeyCollectionName).doc(sessionKey).set({
                timestamp: Date.now(),
                detail
            });
        }
    
        async checkSessionKey(sessionKey) {
            const data = await this._getSessionKeyData(sessionKey);
            if (!data || !data.timestamp) {
                return undefined;
            }
            return data.detail;
        }
    
        async _getSessionKeyData(sessionKey) {
            const sessRef = this._db.collection(this._sessionKeyCollectionName).doc(sessionKey);
            const doc = await sessRef.get();
            return doc.data();   
        }
    
        async setTicketForRoom(ticket, roomId) {
            await this._db.collection(this._ticketCollectionName).doc(ticket).set({
                timestamp: Date.now(),
                detail: {
                    roomId
                }
            });
        }

        async getRoomIdFromTicket(ticket) {
            const ref = this._db.collection(this._ticketCollectionName).doc(ticket);
            const doc = await ref.get();
            const data = doc.data();
            if (!data) {
                return undefined;
            }
            return data.detail.roomId;
        }

        async deleteTicket(ticket) {
            await this._db.collection(this._ticketCollectionName).doc(ticket).delete();
        }

        async setRoom(roomId) {
            await this._db.collection(this._roomCollectionName).doc(roomId).set({
                timestamp: Date.now(),
                detail: {
                    messages: []
                }
            });
        }

        async hasRoom(roomId) {
            const ref = this._db.collection(this._roomCollectionName).doc(roomId);
            const doc = await ref.get();
            const data = doc.data();

            if (!data || !data.timestamp) {
                return false;
            }
            return true;
        }
    
        async sendMessage(message, roomId) {
    
            const sessionKeys = [];
            const snapshot = await this._db.collection(this._sessionKeyCollectionName).where('detail.roomId', '==', roomId).get();
    
            snapshot.forEach(doc => {
                sessionKeys.push(doc.id);
            });
    
            
            const roomRef = this._db.collection(this._roomCollectionName).doc(roomId);
            const start = Date.now();
            await this._db.runTransaction(async t => {
    
                const roomDoc = await t.get(roomRef);
                const roomData = roomDoc.data();
    
                const newMsgs = roomData.detail.messages;
                const messageInfo = { message };
                sessionKeys.forEach(sessionKey => {
                    messageInfo[sessionKey] = true;
                });
                messageInfo['cnt'] = sessionKeys.length;
                newMsgs.push(messageInfo);
                t.update(roomRef, {
                    timestamp: Date.now(),
                    detail: {
                        messages: newMsgs
                    }
                });
    
            });
            const end = Date.now();
            logger.debug(`elapsed on sendMessage tx ${(end - start) / 1000}sec.`);
    
    
            return roomId;
        }
    }

    module.exports = {
        storage: new Storage(firestoreDb),
        remoteEventManager: new EventManager('remote', firestoreDb),
        localEventManager: new EventManager('local', firestoreDb),
        remoteMessageSender: new MessageSender('remote', firestoreDb),
        localMessageSender: new MessageSender('local', firestoreDb)
    };
}

