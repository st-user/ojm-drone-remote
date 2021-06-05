import { CommonEventDispatcher, DOM } from 'client-js-lib';
import { CustomEventNames } from './CustomEventNames.js';

import Logger from './Logger.js';
import { ZrJoyStickUI, XyJoyStickUI } from './joystick.js';


export default class MainSectionView {


    #viewStateModel;
    #startAreaModel;
    #mainSectionModel;
    

    #$messageArea;
    #$messageContent;
    #$mainSection;
    #$videoEmpty;
    #$video;
    #$joystickArea;

    #messageTimer;

    #zrJoyStickUI;
    #xyJoyStickUI;

    constructor(viewStateModel, startAreaModel, mainSectionModel) {

        this.#viewStateModel = viewStateModel;
        this.#startAreaModel = startAreaModel;
        this.#mainSectionModel = mainSectionModel;

        this.#$messageArea = DOM.query('#messageArea');
        this.#$messageContent = DOM.query('#messageContent');
        this.#$mainSection = DOM.query('#mainSection');
        this.#$videoEmpty = DOM.query('#videoEmpty');
        this.#$video = DOM.query('#video');
        this.#$joystickArea = DOM.query('#joystickArea');

        this.#zrJoyStickUI = new ZrJoyStickUI({
            selector: '#zrCanvas',
            radius: 100
        });

        this.#xyJoyStickUI = new XyJoyStickUI({
            selector: '#xyCanvas',
            radius: 100
        });
    }

    setUpEvent() {

        this.#zrJoyStickUI.onmove(data => {
            const coords = data.coords;
            const r = this.#zrJoyStickUI.radius;
            const zrCoordToSend = {
                z: coords.inUI.y / r,
                r: coords.inUI.x / r
            };
            this.#mainSectionModel.setCoord(zrCoordToSend);
        });
        this.#zrJoyStickUI.onend(() => {
            this.#mainSectionModel.setCoord({ z: 0, r: 0 }, true);
        });
            
        this.#xyJoyStickUI.onmove(data => {
            const coords = data.coords;
            const r = this.#xyJoyStickUI.radius;
            const xyCoordToSend = {
                x: coords.inUI.x / r,
                y: coords.inUI.y / r
            };
            this.#mainSectionModel.setCoord(xyCoordToSend);
        });
        this.#xyJoyStickUI.onend(() => {
            this.#mainSectionModel.setCoord({ x: 0, y: 0 }, true);
        });

        this.#$video.onloadedmetadata = () => {
            this.#resize();
        };

        window.addEventListener('resize', () => {
            this.#resize();
        });

        CommonEventDispatcher.on(CustomEventNames.OJM_DRONE_REMOTE__VIDEO_TRACK, event => {
            this.#$video.srcObject = event.detail.srcObject;
        });

        CommonEventDispatcher.on(CustomEventNames.OJM_DRONE_REMOTE__MESSAGE_ONLY, event => {
            const message = event.detail.message;
            this.#showMessage(message);
        });

        CommonEventDispatcher.on(CustomEventNames.OJM_DRONE_REMOTE__VIEW_STATE_CHANGED, () => {
            this.#render();
        });

        this.#zrJoyStickUI.drawBase(false);
        this.#xyJoyStickUI.drawBase(false);

        this.#render();
        this.#resize();
    }

    #render() {

        if (this.#viewStateModel.isInit()) {
            this.#mainSectionModel.init();

            this.#showMessage('Please input a key and click the start button.');
            
            DOM.block(this.#$videoEmpty);
            DOM.none(this.#$video);
        
            if (this.#startAreaModel.isPrimary()) {
                DOM.block(this.#$joystickArea);
            } else {
                DOM.none(this.#$joystickArea);
            }
        }

        if (this.#viewStateModel.isReady()) {
            this.#showMessage('Now connecting to the remote peer that controls the drone. Please wait a minute.');
            DOM.block(this.#$videoEmpty);
            DOM.none(this.#$video);
        }

        if (this.#viewStateModel.isLand()) {
            if (this.#startAreaModel.isPrimary()) {
                this.#showMessage('The connection to the remote peer is established. Please wait until the drone takes off.');
            } else {
                this.#showMessage('The connection to the remote peer is established.');
            }
        
            DOM.none(this.#$videoEmpty);
            DOM.block(this.#$video);
        }

        if (this.#viewStateModel.isTakeOff()) {
            if (this.#startAreaModel.isPrimary()) {
                this.#showMessage('The drone took off. Now you can control the drone. Enjoy!!');
            }
            DOM.none(this.#$videoEmpty);
            DOM.block(this.#$video);
        }

    }

    #showMessage(message) {
        clearTimeout(this.#messageTimer);


        DOM.block(this.#$messageArea);
        this.#$messageContent.textContent = message;
    
        this.#messageTimer = setTimeout(() => DOM.none(this.#$messageArea), 10000);
    }

    #resize() {
        const videoWidth = this.#$video.videoWidth;
        const videoHeight = this.#$video.videoHeight;
        const aspectRatio = !videoHeight ? 16/9 : videoWidth / videoHeight; 
        
        let videoSectionWidth = window.innerWidth;
        let videoSectionHeight = videoSectionWidth / aspectRatio;
        const windowHeight = window.innerHeight * 0.9;
        if (windowHeight < videoSectionHeight) {
            videoSectionHeight = windowHeight;
            videoSectionWidth = videoSectionHeight * aspectRatio;
        }
        Logger.debug(`video ${videoSectionWidth}/${videoSectionHeight}`);
        this.#$mainSection.style.width = `${videoSectionWidth}px`;
        this.#$mainSection.style.height = `${videoSectionHeight}px`;
        this.#$videoEmpty.style.width = `${videoSectionWidth}px`;
        this.#$videoEmpty.style.height = `${videoSectionHeight}px`;
        this.#$video.style.width = `${videoSectionWidth}px`;
        this.#$video.style.height = `${videoSectionHeight}px`;
    }
}