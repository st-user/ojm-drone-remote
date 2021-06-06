module.exports = class MessageHandlerServer {


    constructor() {
        this._messageHandlersMap = new Map();
    }

    on(eventName, handler) {
        const _setHandler = _eventName => {
            let handlers = this._messageHandlersMap.get(_eventName);
            if (!handlers) {
                handlers = [];
                this._messageHandlersMap.set(_eventName, handlers);
            }
            handlers.push(handler);
        };
        if (Array.isArray(eventName)) {
            eventName.forEach(_setHandler);
        } else {
            _setHandler(eventName);
        }

    }
};