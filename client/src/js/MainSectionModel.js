import RTCHandler from './RTCHandler.js';


export default class MainSectionModel {

    #rtcHandler;

    constructor(viewStateModel, startAreaModel) {
        this.#rtcHandler = new RTCHandler(viewStateModel, startAreaModel);
    }

    init() {
        this.#rtcHandler.init();
    }

    async setUpConnection() {
        this.#rtcHandler.startChecking();
        await this.#rtcHandler.setUpConnection();
    }

    setCoord(coord, shouldEndSending) {
        if (shouldEndSending) {
            this.#rtcHandler.sendAndSetCoord(coord);
        } else {
            this.#rtcHandler.setCoordToSend(coord);
        }   
    }
}