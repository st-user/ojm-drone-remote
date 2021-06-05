import { CommonEventDispatcher } from 'client-js-lib';
import { CustomEventNames } from './CustomEventNames.js';


const STATE = {
    INIT: 0,
    READY: 1,
    LAND: 2,
    TAKEOFF: 3
};

export default class ViewStateModel {

    #state;

    constructor() {
        this.#state = STATE.INIT;
    }

    isInit() {
        return this.#is(STATE.INIT);
    }

    toInit() {
        this.#setState(STATE.INIT);
    }

    isReady() {
        return this.#is(STATE.READY);
    }

    toReady() {
        this.#setState(STATE.READY);
    }

    isLand() {
        return this.#is(STATE.LAND);
    }

    toLand() {
        this.#setState(STATE.LAND);
    }

    isTakeOff() {
        return this.#is(STATE.TAKEOFF);
    }

    toTakeOff() {
        this.#setState(STATE.TAKEOFF);
    }

    #is(value) {
        return this.#state === value;
    }

    #setState(value) {
        this.#state = value;
        CommonEventDispatcher.dispatch(CustomEventNames.OJM_DRONE_REMOTE__VIEW_STATE_CHANGED);
    }
}