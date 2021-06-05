export default class StartAreaModel {

    #isPrimary;

    constructor() {
        this.#isPrimary = location.pathname === '/';
    }

    isPrimary() {
        return this.#isPrimary;
    }
}