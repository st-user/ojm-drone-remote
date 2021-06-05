import { CommonEventDispatcher } from 'client-js-lib';
import { CustomEventNames } from './CustomEventNames.js';

import Logger from './Logger.js';

const TRY_CONNECTING_COUNT = 3;
const TRY_PRIMARY_COUNT = 10;
const TRY_INTERVAL_MILLIS = 1000;
const SEND_COORD_INTERVAL_MILLIS = 100;

export default class RTCHandler {

    #viewStateModel;
    #startAreaModel;

    #peerConnectionId;
    #webSocket;
    #pc;
    #dc;
    #iceServerInfo;

    #newOrConnectingCount;
    #dataChannelConnectingCount;
    #blockedByAnotherPrimaryPeerCount;
    #checkAndTryTimer;
    
    #xyCoordToSend;
    #zrCoordToSend;

    constructor(viewStateModel, startAreaModel) {

        this.#viewStateModel = viewStateModel;
        this.#startAreaModel = startAreaModel;

        this.#peerConnectionId = Date.now();

        this.#newOrConnectingCount = 0;
        this.#dataChannelConnectingCount = 0;
        this.#blockedByAnotherPrimaryPeerCount = 0;

        setTimeout(() => this.#doSendJoystickZr(), SEND_COORD_INTERVAL_MILLIS);
        setTimeout(() => this.#doSendJoystickXy(), SEND_COORD_INTERVAL_MILLIS);
    }

    init() {
        clearTimeout(this.#checkAndTryTimer);

        this.#newOrConnectingCount = 0;
        this.#dataChannelConnectingCount = 0;
        this.#blockedByAnotherPrimaryPeerCount = 0;

        this.#closeRTCConnectionQuietly();        
    }

    startChecking() {
        clearTimeout(this.#checkAndTryTimer);
        this.#checkAndTryTimer = setTimeout(async () => {
            await this.checkAndTry();
        }, TRY_INTERVAL_MILLIS);
    }

    setUpConnection(startKey) {

        const wsProtocol = 0 <= location.protocol.indexOf('https') ? 'wss' : 'ws';
        const isPrimary = this.#startAreaModel.isPrimary();
        const url = `${wsProtocol}://${location.host}/remote?startKey=${startKey}&peerConnectionId=${this.#peerConnectionId}&isPrimary=${isPrimary}`;
        const webSocket = new WebSocket(url);
        this.#webSocket = webSocket;
    
        let onerror;
        webSocket.onmessage = async event => {
            const dataJson = JSON.parse(event.data);
            const messageType = dataJson.messageType;
    
            switch(messageType) {
            case 'iceServerInfo':
                this.#iceServerInfo = dataJson.iceServerInfo;
                // checkIfCanOffer();
                break;
            case 'canOffer':
                switch(dataJson.state) {
                case 'EMPTY':
                    this.#blockedByAnotherPrimaryPeerCount = 0;
                    this.#closeRTCConnectionQuietly();
                    await this.startCreatingConnection();
                    break;
                case 'SAME':
                    this.#blockedByAnotherPrimaryPeerCount = 0;
                    Logger.warn('Can not offer.');
                    break;
                case 'EXIST':
                    this.#blockedByAnotherPrimaryPeerCount++;
                    if (TRY_PRIMARY_COUNT < this.#blockedByAnotherPrimaryPeerCount) {
                        onerror = true;
                        alert('Another peer is now controlling the drone. Please retry later or join as an audience.');
                        webSocket.close();
                    }
                    break;
                default:
                    Logger.warn('Unexpected state', dataJson.state);
                }
                break;
            case 'answer':
                Logger.debug('answer', dataJson.answer);
                if (dataJson.err) {
                    this.#closeRTCConnectionQuietly();
                } else {
                    this.#pc.setRemoteDescription(dataJson.answer);
                }
                break;
            case 'ping':
                webSocket.send(JSON.stringify({
                    messageType: 'pong'
                }));
                break;
            default:
                return;
            }
        };
    
        webSocket.onerror = () => {
            alert('Failed to start connecting to the remote peer. The input code may be invalid.');
            onerror = true;
            webSocket.close();
            this.#viewStateModel.toInit();
        };
    
        webSocket.onopen = async () => {
            Logger.debug('open!!');
        };
    
        webSocket.onclose = () => {
            if (!onerror) {
                alert('Failed to open connection or connection was closed. Please retry.');
            }
            this.#viewStateModel.toInit();
        };
    
    }

    async checkAndTry() {

        const _checkAndTry = () => {
            this.#checkAndTryTimer = setTimeout(async () => {
                await this.checkAndTry();
            }, TRY_INTERVAL_MILLIS);
        };

        if (this.#viewStateModel.isInit() || !this.#pc) {
            this.#checkIfCanOffer();
            _checkAndTry();
            return;
        }
        const tryToConnect = async () => {
            Logger.info(`try to connect ${this.#pc.connectionState} - ${!this.#dc ? '' : this.#dc.readyState}.`);
            this.#checkIfCanOffer();
        };
    
        const isNewOrConnectiong = this.#pc.connectionState === 'new' || this.#pc.connectionState === 'connecting';
        if (isNewOrConnectiong) {
            const tail = ' .'.repeat(this.#newOrConnectingCount + 1);

            this.#showMessage(`Waiting for a while until the connection is established${tail}`);

            this.#newOrConnectingCount++;
        } else {
            this.#newOrConnectingCount = 0;
        }
        const isPeerConnectionStateNotValid = this.#pc.connectionState === 'disconnected' ||
                                                  this.#pc.connectionState === 'failed' ||
                                                  this.#pc.connectionState === 'closed';
    
            
        let isDataChannelConnecting = false;
        let isDataChannelStateNotValid = false;
        if (this.#dc) {
            isDataChannelConnecting = this.#dc.connectionState === 'connectiong';
            if (isDataChannelConnecting) {
                this.#dataChannelConnectingCount++;
            } else {
                this.#dataChannelConnectingCount = 0;
            }
        
            isDataChannelStateNotValid = this.#dc.readyState === 'closing' || 
                                                   this.#dc.readyState === 'closed';
        }
                                               
        if (
            (isNewOrConnectiong && TRY_CONNECTING_COUNT < this.#newOrConnectingCount) || 
                isPeerConnectionStateNotValid || 
                (isDataChannelConnecting && TRY_CONNECTING_COUNT < this.#dataChannelConnectingCount) ||
                isDataChannelStateNotValid
        ) {
            this.#dataChannelConnectingCount = 0;
            this.#newOrConnectingCount = 0;

            this.#viewStateModel.toReady();

            await tryToConnect();
        } else {
            Logger.info(`Connection is valid. don't need to try (${this.#newOrConnectingCount},${this.#dataChannelConnectingCount}).`);
        }
        _checkAndTry();
    }

    #checkIfCanOffer() {
        if (!this.#webSocket) {
            return;
        }
        this.#webSocket.send(JSON.stringify({
            messageType: 'canOffer',
            peerConnectionId: this.#peerConnectionId,
            isPrimary: this.#startAreaModel.isPrimary()
        }));
    }

    async startCreatingConnection() {
        this.#createPeerConnection();
        this.#prepareDataChannel();
        await this.negotiate();
    }

    #createPeerConnection() {
        Logger.debug(this.#iceServerInfo);
    
        const config = {
            sdpSemantics: 'unified-plan'
        };
        if (this.#iceServerInfo) {
            config.iceServers = [
                {
                    urls: this.#iceServerInfo.stun
                },
                {
                    urls: this.#iceServerInfo.turn,
                    username: this.#iceServerInfo.credentials.username,
                    credential: this.#iceServerInfo.credentials.password
                }
            ];
        }
            
        const pc = new RTCPeerConnection(config);
        this.#pc = pc;

        Logger.debug(config);
        
        pc.addEventListener('connectionstatechange', () => {
            Logger.debug(`connectionstatechange: ${pc.iceGatheringState}`);
        });
    
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

    async negotiate() {
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
    
        this.#webSocket.send(JSON.stringify({
            messageType: 'offer',
            peerConnectionId: this.#peerConnectionId,
            offer: {
                sdp: offerLocalDesc.sdp,
                type: offerLocalDesc.type,
            }
        }));
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

    #showMessage(message) {
        CommonEventDispatcher.dispatch(CustomEventNames.OJM_DRONE_REMOTE__MESSAGE_ONLY, {
            message
        });
    }

    setZrCoordToSend(coord) {
        this.#zrCoordToSend = coord;
    }

    setXyCoordToSend(coord) {
        this.#xyCoordToSend = coord;
    }

    #doSendJoystickXy() {
        this.#sendJoystickXyIfNecessary();
        setTimeout(() => {
            this.#doSendJoystickXy();
        }, SEND_COORD_INTERVAL_MILLIS);
    }
    
    #sendJoystickXyIfNecessary() {
        if (!this.#xyCoordToSend) {
            return;
        }
        this.#sendJoystickXy(this.#xyCoordToSend);
    }
    
    #sendJoystickXy(xy) {
        this.#sendJoystickCommand(xy);
    }
    
    #doSendJoystickZr() {
        this.#sendJoystickZrIfNecessary();
        setTimeout(() => {
            this.#doSendJoystickZr();
        }, SEND_COORD_INTERVAL_MILLIS);
    }
    
    #sendJoystickZrIfNecessary() {
        if (!this.#zrCoordToSend) {
            return;
        }
        this.#sendJoystickZr(this.#zrCoordToSend);
    }
    
    #sendJoystickZr(zr) {
        this.#sendJoystickCommand(zr);
    }
    
    #sendJoystickCommand(command) {
        if (this.#dc) {
            this.#dc.send(JSON.stringify({ command }));
        } else {
            Logger.debug('DataChannel is not opened.', command);
        }
    }  


}