import { v4 as uuidv4 } from 'uuid';

import { CommonEventDispatcher } from 'client-js-lib';
import { CustomEventNames } from './CustomEventNames.js';

import SocketHandler from './SocketHandler.js';
import Logger from './Logger.js';

const TRY_INTERVAL_MILLIS = 1000;
const SEND_COORD_INTERVAL_MILLIS = 100;

const MAx_RETRY_COUNT_ON_SOC_DISCONNECT = 10;
const RETRY_INTERVAL_MILLIS_ON_SOC_DISCONNECT = 1000;

export default class RTCHandler {

    #viewStateModel;
    #startAreaModel;

    #peerConnectionId;
    #socketHandler;
    #pc;
    #dc;
    #iceServerInfo;
    #currentLocalDescription;

    #checkAndTryTimer;

    #retryCountOnSocDisconnect;
    #retryTimerOnSocDisconnect;
    
    #coordToSend;

    constructor(viewStateModel, startAreaModel) {

        this.#viewStateModel = viewStateModel;
        this.#startAreaModel = startAreaModel;

        this.#retryCountOnSocDisconnect = 0;

        setTimeout(() => this.#doSendCoord(), SEND_COORD_INTERVAL_MILLIS);
    }

    init() {
        clearTimeout(this.#checkAndTryTimer);

        this.#retryCountOnSocDisconnect = 0;
        clearTimeout(this.#retryTimerOnSocDisconnect);

        this.#closeRTCConnectionQuietly();        
    }

    startChecking() {
        clearTimeout(this.#checkAndTryTimer);
        this.#checkAndTryTimer = setTimeout(async () => {
            await this.#checkAndTry();
        }, TRY_INTERVAL_MILLIS);
    }

    async setUpConnection() {
        
        await this.#startCreatingConnection();

        this.#socketHandler = new SocketHandler('/remote', this.#startAreaModel.getStartKey(), {
            peerConnectionId: this.#peerConnectionId,
            isPrimary: this.#startAreaModel.isPrimary()
        });

        this.#socketHandler.on('answer', event => {
            const data = event.detail;

            if (data.err) {
                Logger.warn(`Error on answer to ${data.peerConnectionId}.`);
            } else {
                Logger.info(`Receives answer to ${data.peerConnectionId}.`);
                this.#pc.setRemoteDescription(data.answer);
            }
        });

        let onerror;
        this.#socketHandler.on('connect_error', () => {
            if (0 < this.#retryCountOnSocDisconnect) {
                return;
            }
            alert('Failed to start connecting to the remote peer. The input code may be invalid.');
            onerror = true;
            this.#socketHandler.close();
            this.#viewStateModel.toInit();
        });

        this.#socketHandler.on('connect', event => {
            const data = event.detail;
            this.#iceServerInfo = data.iceServerInfo;

            Logger.debug('open.');

            this.#retryCountOnSocDisconnect = 0;
            clearTimeout(this.#retryTimerOnSocDisconnect);
    
        });

        const disconnectMsg = 'Failed to open connection or connection was closed. Please retry.';
        const retry = async () => {

            Logger.info(`trying to recover websocket connection ${this.#retryCountOnSocDisconnect}/${MAx_RETRY_COUNT_ON_SOC_DISCONNECT}.`);
            if (MAx_RETRY_COUNT_ON_SOC_DISCONNECT < this.#retryCountOnSocDisconnect) {
                alert(disconnectMsg);
                this.#viewStateModel.toInit();
                return;
            }
            this.#retryCountOnSocDisconnect++;
            this.#retryTimerOnSocDisconnect = setTimeout(retry, RETRY_INTERVAL_MILLIS_ON_SOC_DISCONNECT);

            await this.#socketHandler.connect();
        };

        this.#socketHandler.on('disconnect', async event => {
            const reason = event.detail;

            if (reason !== 'client disconnect') {
                retry();
                return;
            }

            if (!onerror) {
                alert(disconnectMsg);
            }
            this.#viewStateModel.toInit();
        });

        await this.#socketHandler.connect();
    }

    async #checkAndTry() {

        const _checkAndTry = () => {
            this.#checkAndTryTimer = setTimeout(async () => {
                await this.#checkAndTry();
            }, TRY_INTERVAL_MILLIS);
        };

        if (this.#viewStateModel.isInit() || !this.#pc || this.#pc.connectionState === 'new') {
            await this.#checkAndOffer();
            _checkAndTry();
            return;
        }
        const tryToConnect = async () => {
            Logger.info(`try to connect ${this.#peerConnectionId} : ${this.#pc.connectionState} - ${!this.#dc ? '' : this.#dc.readyState} - ${this.#pc.signalingState}.`);
            await this.#checkAndOffer();
        };

        const isPcConnected = this.#pc.signalingState === 'stable';

        if (!isPcConnected) {
            await tryToConnect();
        } else {
            Logger.info(`Connection is stable. don't need to try. ${this.#peerConnectionId} : ${this.#pc.connectionState} - ${!this.#dc ? '' : this.#dc.readyState} - ${this.#pc.signalingState}`);
        }
    
        _checkAndTry();
    }

    async #checkAndOffer() {
        if (!this.#socketHandler || !this.#currentLocalDescription) {
            return;
        }

        await this.#doOffer();
    }

    async #startCreatingConnection() {
        this.#createPeerConnection();
        this.#prepareDataChannel();
        await this.#initLocalDescription();
    }

    #createPeerConnection() {
        Logger.debug(this.#iceServerInfo);
    
        this.#peerConnectionId = uuidv4();
        Logger.info(`peerConnectionId created ${this.#peerConnectionId}`);

        const config = {
            sdpSemantics: 'unified-plan'
        };
        if (this.#iceServerInfo) {
            config.iceServers = this.#iceServerInfo.iceServers;
        }
            
        const pc = new RTCPeerConnection(config);
        this.#pc = pc;

        Logger.debug(config);
        
        const connectionStateChangeHandler = async () => {
            switch (this.#pc.connectionState) {
            case 'failed':
                Logger.warn(`ConnectionState(${this.#peerConnectionId}) changed to ${this.#pc.connectionState}(${this.#pc.signalingState}).`);
                break;
            case 'disconnected':
            case 'closed':
                Logger.info(`ConnectionState(${this.#peerConnectionId}) changed to ${this.#pc.connectionState}(${this.#pc.signalingState}) so retry offer later.`);
                this.#currentLocalDescription = undefined;
                this.#socketHandler.close();
    
                setTimeout(async () => {
    
                    await this.setUpConnection();
    
                }, 1000);
                pc.removeEventListener('connectionstatechange', connectionStateChangeHandler);
            }
        };

        pc.addEventListener('connectionstatechange', connectionStateChangeHandler);
    
        pc.addEventListener('icegatheringstatechange', () => {
            Logger.debug(`icegatheringstatechange: ${pc.iceGatheringState}`);
        });
        
        pc.addEventListener('iceconnectionstatechange', () => {
            Logger.debug(`iceconnectionstatechange: ${pc.iceConnectionState}`);
        });
        
        pc.addEventListener('signalingstatechange', () => {
            Logger.debug(`signalingstatechange: ${pc.signalingState}`);
        });
        
        pc.addEventListener('track', event => {
            Logger.debug('track', event.streams);

            if (event.track.kind == 'video') {
                this.#viewStateModel.toLand();

                CommonEventDispatcher.dispatch(CustomEventNames.OJM_DRONE_REMOTE__VIDEO_TRACK, {
                    srcObject: event.streams[0]
                });
            }          
        });
        
    }

    #prepareDataChannel() {
        if (!this.#startAreaModel.isPrimary()) {
            return;
        }
        const dc = this.#pc.createDataChannel('command');
        this.#dc = dc;

        dc.onclose = () => {
            Logger.debug('data channel close');
        };
        dc.onopen = () => {
            Logger.debug('data channel open');
        };
        dc.onmessage = event => {
                
            const data = event.data;
    
            if (typeof data === 'string') {
                const dataJson = JSON.parse(data);
                const messageType = dataJson.messageType;
    
                switch(messageType) {
                case 'takeoff':
                    this.#viewStateModel.toTakeOff();
                    break;
                case 'land':
                    this.#viewStateModel.toLand();
                    break;
                default:
                    return;
                } 
            }
        };
    }

    async #initLocalDescription() {
        const gather = () => {
            return new Promise(resolve => {
                const pc = this.#pc;

                Logger.debug('gather', pc.iceGatheringState);
                if (pc.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    const checkState = () => {
                        Logger.debug('gather', pc.iceGatheringState);
                        if (pc.iceGatheringState === 'complete') {
                            pc.removeEventListener('icegatheringstatechange', checkState);
                            resolve();
                        }
                    };
                    pc.addEventListener('icegatheringstatechange', checkState);
                }
            });
        };
    
        const pc = this.#pc;
        const transceiver = pc.addTransceiver('video');
        transceiver.direction = 'recvonly';
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await gather();
        const offerLocalDesc = pc.localDescription;

        this.#currentLocalDescription = offerLocalDesc;
    }

    async #doOffer() {

        const offerLocalDesc = this.#currentLocalDescription;

        Logger.info(`Send offer of ${this.#peerConnectionId}.`);
        await this.#socketHandler.send('offer', {
            messageType: 'offer',
            peerConnectionId: this.#peerConnectionId,
            isPrimary: this.#startAreaModel.isPrimary(),
            offer: {
                sdp: offerLocalDesc.sdp,
                type: offerLocalDesc.type,
            }            
        });
    }


    #closeRTCConnectionQuietly() {
        try {
            this.#closeRTCConnection();
        } catch(e) {
            Logger.error(e);
        }
    }

    #closeRTCConnection() {
        if (this.#dc) {
            this.#dc.close();
        }
    
        if (this.#pc) {
            if (this.#pc.getTransceivers) {
                this.#pc.getTransceivers().forEach(transceiver => {
                    if (transceiver.stop) {
                        transceiver.stop();
                    }
                });
            }
            
            this.#pc.getSenders().forEach(sender => {
                if (sender.track && sender.track.stop) {
                    sender.track.stop();
                }
            });
            
            this.#pc.close();
        }
    }

    setCoordToSend(coord) {
        this.#coordToSend = coord;
    }

    sendAndSetCoord(toSend, toSet) {
        this.#coordToSend = toSet;
        this.#sendCoord(toSend);
    }

    #doSendCoord() {
        this.#sendCoordIfNecessary();
        setTimeout(() => {
            this.#doSendCoord();
        }, SEND_COORD_INTERVAL_MILLIS);
    }
    
    #sendCoordIfNecessary() {
        if (!this.#coordToSend) {
            return;
        }
        this.#sendCoord(this.#coordToSend);
    }
    
    #sendCoord(command) {
        if (this.#dc) {
            this.#dc.send(JSON.stringify({ command }));
        } else {
            Logger.debug('DataChannel is not opened.', command);
        }
    }
}