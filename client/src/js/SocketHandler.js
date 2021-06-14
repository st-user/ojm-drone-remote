import { io } from 'socket.io-client';
import Logger from './Logger.js';

export default class SocketHandler {
    
    #socket;

    constructor(path, startKey, query) {
        this.#socket = io({
            path,
            auth: {
                token: startKey
            },
            query: query,
            reconnection: false
        });
    }

    connect() {
        this.#socket.connect();
    }

    send(eventName, value) {
        this.#socket.emit(eventName, value);
    }

    on(eventName, handler) {
        this.#socket.on(eventName, handler);
    }

    close() {
        try {
            this.#socket.close();
        } catch(e) {
            Logger.error(e);
        } 
    }
}