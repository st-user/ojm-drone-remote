import { CommonEventDispatcher, DOM } from 'client-js-lib';
import { CustomEventNames } from './CustomEventNames.js';


export default class StartAreaView {

    #viewStateModel;
    #startAreaModel;
    #mainSectionModel;
    
    #$startKey;
    #$start;
    #$toAudience;

    constructor(viewStateModel, startAreaModel, mainSectionModel) {
        this.#viewStateModel = viewStateModel;
        this.#startAreaModel = startAreaModel;
        this.#mainSectionModel = mainSectionModel;

        this.#$startKey = DOM.query('#startKey');
        this.#$start = DOM.query('#start');
        this.#$toAudience = DOM.query('#toAudience');
    }

    setUpEvent() {

        DOM.click(this.#$start, event => {
            event.preventDefault();

            if (!this.#viewStateModel.isInit()) {
                return;
            }
            this.#viewStateModel.toReady();
            this.#mainSectionModel.setUpConnection(this.#$startKey.value);
        });

        DOM.click(this.#$toAudience, event => {
            event.preventDefault();
            location.href = '/audience';
        });

        CommonEventDispatcher.on(CustomEventNames.OJM_DRONE_REMOTE__VIEW_STATE_CHANGED, () => {
            this.#render();
        });

        this.#render();
    }

    #render() {

        if (this.#viewStateModel.isInit()) {

            this.#$startKey.disabled = false;
            this.#enableStartButton();
        
            if (this.#startAreaModel.isPrimary()) {
                this.#$start.textContent = 'START';
                DOM.block(this.#$toAudience);
            } else {
                this.#$start.textContent = 'JOIN';
                DOM.none(this.#$toAudience);
            }
        }

        if (this.#viewStateModel.isReady() || this.#viewStateModel.isLand() || this.#viewStateModel.isTakeOff()) {

            this.#$startKey.disabled = true;           
            this.#disableStartButton();

            DOM.none(this.#$toAudience);
        }
    }
   
    #disableStartButton() {
        this.#resetClass(this.#$start, 'is-disabled', 'is-enabled');
    }
    
    #enableStartButton() {
        this.#resetClass(this.#$start, 'is-enabled', 'is-disabled');
    }

    #resetClass($elem, classToAdd, classToRemove) {
        $elem.classList.remove(classToRemove);
        $elem.classList.add(classToAdd);        
    }
}