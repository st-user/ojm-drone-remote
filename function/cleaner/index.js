const Firestore = require('@google-cloud/firestore');

const TAGET_COLLECTIONS = [
    'events',
    'rooms',
    'sessionKeys',
    'local_events',
    'local_rooms',
    'local_sessionKeys',
    'local_tickets',
    'remote_events',
    'remote_rooms',
    'remote_sessionKeys'
];

const MINUTS_EXPIRES_IN = {
    'events': 1,
    'local_events': 1,
    'remote_events': 1
};

async function deleteCollection(db, collectionName, batchSize) {
    const ref = db.collection(collectionName);

    const expiresIn = new Date();
    const minutesExpiresIn = MINUTS_EXPIRES_IN[collectionName] || 5
    expiresIn.setMinutes(expiresIn.getMinutes() - minutesExpiresIn);
    const query = ref.where('timestamp', '<=', expiresIn.getTime()).limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve, collectionName).catch(reject);
    });
}

async function deleteQueryBatch(db, query, resolve, collectionName) {
    const snapshot  =await query.get();

    const batchSize = snapshot.size;
    console.log(`Delete ${batchSize} documents(s) in ${collectionName}.`);

    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve, collectionName);
    });
}

exports.cleanup = async (event, context) => {

    const db = new Firestore({
        projectId: 'mystoragetestproject'
    });

    for (const collectionName of TAGET_COLLECTIONS) {
        await deleteCollection(db, collectionName, 100);
    }
};
