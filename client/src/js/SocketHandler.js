import Logger from './Logger.js';

export default class SocketHandler {
    
    #path;
    #startKey;
    #query;

    #sessionKey;
    #isClosed;

    #$eventDiv;

    constructor(path, startKey, query) {
        this.#path = path;
        this.#startKey = startKey;
        this.#query = query;
        this.#isClosed = false;
        this.#$eventDiv = document.createElement('div');
    }

    async connect() {

        let observeErrorCount = 0;
        let observeRetryTimer;
        this.#isClosed = true;

        const observe = async sessionKey => {
            if (this.#isClosed) {
                Logger.warn('The connection has been closed.');
                return;
            }
            await fetch(`${this.#path}/observe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionKey
                })
            }).then(res => {
                if (res.ok) {
                    observeErrorCount = 0;
                    clearTimeout(observeRetryTimer);
                    return res.json();
                }
                throw res.statusText;
            }).then(async responseJson => {
                if (this.#isClosed) {
                    return;
                }
                
                if (responseJson.forEach) {
                    responseJson.forEach(eventInfo => {
                        const { eventName, data } = eventInfo;
                        this.#dispatchEventIfConnectionOpened(eventName, data);
                    });
                }

                await observe(sessionKey);
  
            }).catch(e => {
                if (this.#isClosed) {
                    return;
                }
                
                Logger.warn('Failed to observe', e);
                observeErrorCount++;
                clearTimeout(observeRetryTimer);

                if (observeErrorCount > 5) {
                    observeErrorCount = 0;
                    this.#doDisconnect('fails to observe');
                    return;
                }
                
                observeRetryTimer = setTimeout(async () => {
                    await observe(sessionKey);
                }, 300);
            });
        };

        const startObserving = async () => {
            await fetch(`${this.#path}/startObserving`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    startKey: this.#startKey,
                    query: this.#query
                })
            }).then(res => {
                if (res.ok) {
                    return res.json();
                }
                throw res.statusText;
            }).then(async responseJson => {
                const { sessionKey, data } = responseJson;
                this.#sessionKey = sessionKey;

                this.#isClosed = false;
                this.#dispatchEventIfConnectionOpened('connect', data);
                
                await observe(sessionKey);

            }).catch(e => {
                this.#$eventDiv.dispatchEvent(new CustomEvent('connect_error', {
                    detail: e.toString()
                }));
            });
        };

        await startObserving();
    }

    async send(eventName, value) {
        if (!this.#sessionKey) {
            Logger.info('SessionKey is undefined');
            return;
        }
        await fetch(`${this.#path}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionKey: this.#sessionKey,
                eventName,
                message: value
            })
        }).then(res => {
            if (res.ok) {
                return;
            }
            throw res.statusText;
        }).catch(e => {
            if (this.#isClosed) {
                return;
            }

            Logger.warn('Failed to send message', e);
            this.#doDisconnect('fails to send message'); 
        });
    }

    on(eventName, handler) {
        this.#$eventDiv.addEventListener(eventName, handler);
    }

    close() {
        this.#doDisconnect('client disconnect');
    }

    reset(query) {
        this.#query = query;
        this.#doDisconnect('client reset');
    }

    #doDisconnect(reason) {
        this.#isClosed = true;
        this.#$eventDiv.dispatchEvent(new CustomEvent('disconnect', {
            detail: reason
        }));
    }

    #dispatchEventIfConnectionOpened(eventName, detail) {
        if (!this.#isClosed) {
            this.#$eventDiv.dispatchEvent(new CustomEvent(eventName, {
                detail
            }));
        }
    }
}