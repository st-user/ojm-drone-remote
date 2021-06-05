import RTCHandler from './RTCHandler.js';


export default class MainSectionModel {

    #rtcHandler;

    constructor(viewStateModel, startAreaModel) {
        this.#rtcHandler = new RTCHandler(viewStateModel, startAreaModel);
    }

    init() {
        this.#rtcHandler.init();
    }

    setUpConnection(startKey) {
        this.#rtcHandler.startChecking();
        this.#rtcHandler.setUpConnection(startKey);
    }

    setCoord(coord, shouldEndSending) {
        if (shouldEndSending) {
            this.#rtcHandler.sendAndSetCoord(coord);
        } else {
            this.#rtcHandler.setCoordToSend(coord);
        }   
    }
}