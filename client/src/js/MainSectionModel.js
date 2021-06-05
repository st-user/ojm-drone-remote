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

    setZrCoordToSend(coord) {
        this.#rtcHandler.setZrCoordToSend(coord);
    }

    setXyCoordToSend(coord) {
        this.#rtcHandler.setXyCoordToSend(coord);
    }
}