export default class StartAreaModel {

    #isPrimary;
    #startKey;

    constructor() {
        this.#isPrimary = location.pathname === '/';
    }

    isPrimary() {
        return this.#isPrimary;
    }

    setStartKey(startKey) {
        this.#startKey = startKey;
    }

    getStartKey() {
        return this.#startKey;
    }
}