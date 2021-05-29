/* global ZrJoyStickUI, XyJoyStickUI */

window.addEventListener('DOMContentLoaded', () => {


    const STATE = {
        INIT: 0,
        READY: 1,
        LAND: 2,
        TAKEOFF: 3
    };

    const peerConnectionId = Date.now();
    let webSocket;
    let iceServerInfo;
    let pc;
    let dc;
    let state;

    let newOrConnectingCount = 0;
    let dataChannelConnectingCount = 0;
    const TRY_CONNECTING_COUNT = 3;
    const TRY_INTERVAL_MILLIS = 1000;
    let checkAndTryTimer;
    let messageTimer;

    let xyCoordToSend = undefined;
    let zrCoordToSend = undefined;

    const _q = selector => document.querySelector(selector);
    const _none = $elem => $elem.style.display = 'none';
    const _block = $elem => $elem.style.display = 'block';
    const _click = ($elem, handler) => $elem.addEventListener('click', handler);

    /* start area */
    const $start = _q('#start');
    const $startKey = _q('#startKey');

    /* main section */
    const $messageArea = _q('#messageArea');
    const $messageContent = _q('#messageContent');
    const $mainSection = _q('#mainSection');
    const $videoEmpty = _q('#videoEmpty');
    const $video = _q('#video');


    /* JoyStick */
    const zrJoyStickUI = new ZrJoyStickUI({
        selector: '#zrCanvas',
        radius: 100
    });
    zrJoyStickUI.onmove(data => {
        const coords = data.coords;
        zrCoordToSend = {
            z: coords.inUI.y / zrJoyStickUI.radius,
            r: coords.inUI.x / zrJoyStickUI.radius
        };
    });
    zrJoyStickUI.onend(() => {
        zrCoordToSend = undefined;
        sendJoystickZr({ z: 0, r: 0 });
    });
    zrJoyStickUI.drawBase(false);
    
    const xyJoyStickUI = new XyJoyStickUI({
        selector: '#xyCanvas',
        radius: 100
    });
    xyJoyStickUI.onmove(data => {
        const coords = data.coords;
        xyCoordToSend = {
            x: coords.inUI.x / xyJoyStickUI.radius,
            y: coords.inUI.y / xyJoyStickUI.radius
        }; 
    });
    xyJoyStickUI.onend(() => {
        xyCoordToSend = undefined;
        sendJoystickXy({ x: 0, y: 0 });
    });
    xyJoyStickUI.drawBase(false);


    _click($start, () => {
        if (state !== STATE.INIT) {
            return;
        }
        setUpConnection();
    });
    window.addEventListener('resize', resizeVideo);
    _click($messageContent, () => _none($messageArea));

    init();
    resizeVideo();

    setTimeout(doSendJoystickXy, 100);
    setTimeout(doSendJoystickZr, 100);




    function init() {
        clearTimeout(checkAndTryTimer);
        state = STATE.INIT;
        initView();
        closeRTCConnectionQuietly();
    }

    function initView() {
        showMessage('Please input a key and click the start button.');
        $startKey.disabled = false;
        $start.disabled = false;
        _block($videoEmpty);
        _none($video);
        enableStartButton();
    }

    function ready() {
        state = STATE.READY;
        readyView();
        startChecking();
    }

    function readyView() {
        showMessage('Now connecting to the remote peer that controls the drone. Please wait a minute.');
        $startKey.disabled = true;
        $start.disabled = true;
        _block($videoEmpty);
        _none($video);
        disableStartButton();
    }

    function land() {
        state = STATE.LAND;
        landView();
    }

    function landView() {
        showMessage('The connection to the remote peer is established. Please wait until the drone takes off.');
        $startKey.disabled = true;
        $start.disabled = true;
        _none($videoEmpty);
        _block($video);
        disableStartButton();
    }

    function takeoff() {
        state = STATE.TAKEOFF;
        takeoffView();
    }

    function takeoffView() {
        showMessage('The drone took off. Now you can control the drone. Enjoy!!');
        $startKey.disabled = true;
        $start.disabled = true;
        _none($videoEmpty);
        _block($video);
        disableStartButton();
    }

    function resetClass($elem, classToAdd, classToRemove) {
        $elem.classList.remove(classToRemove);
        $elem.classList.add(classToAdd);        
    }

    function disableStartButton() {
        resetClass($start, 'disabled', 'enabled');
    }

    function enableStartButton() {
        resetClass($start, 'enabled', 'disabled');
    }

    function showMessage(message, level) {
        _block($messageArea);
        clearTimeout(messageTimer);
        $messageContent.textContent = message;
        $messageContent.classList.remove('error');
        $messageContent.classList.remove('normal');

        messageTimer = setTimeout(() => _none($messageArea), 10000);
        switch(level) {
        case 'error':
            $messageContent.classList.add('error');
            break;
        case 'info':
        default:
            $messageContent.classList.add('info');
            return;
        }
    }

    function closeRTCConnectionQuietly() {
        try {
            closeRTCConnection();
        } catch(e) {
            console.error(e);
        }
    }

    function closeRTCConnection() {

        if (dc) {
            dc.close();
        }

        if (pc) {
            if (pc.getTransceivers) {
                pc.getTransceivers().forEach(transceiver => {
                    if (transceiver.stop) {
                        transceiver.stop();
                    }
                });
            }
        
            pc.getSenders().forEach(sender => {
                if (sender.track && sender.track.stop) {
                    sender.track.stop();
                }
            });
        
            pc.close();
        }
    }

    function createPeerConnection() {
        console.debug(iceServerInfo);

        const config = {
            sdpSemantics: 'unified-plan'
        };
        if (iceServerInfo) {
            config.iceServers = [
                {
                    urls: iceServerInfo.stun
                },
                {
                    urls: iceServerInfo.turn,
                    username: iceServerInfo.credentials.username,
                    credential: iceServerInfo.credentials.password
                }
            ];
        }
        
        try {
            pc = new RTCPeerConnection(config);
        } catch(e) {
            console.error('Try using RTCIceServer.url.', e);
            if (iceServerInfo) {
                config.iceServers = [
                    {
                        url: iceServerInfo.stun
                    },
                    {
                        url: iceServerInfo.turn,
                        username: iceServerInfo.credentials.username,
                        credential: iceServerInfo.credentials.password
                    }
                ];
                pc = new RTCPeerConnection(config);
            }
        }
        console.debug(config);
    
        pc.addEventListener('connectionstatechange', () => {
            console.debug(`connectionstatechange: ${pc.iceGatheringState}`);
        });

        pc.addEventListener('icegatheringstatechange', () => {
            console.debug(`icegatheringstatechange: ${pc.iceGatheringState}`);
        });
    
        pc.addEventListener('iceconnectionstatechange', () => {
            console.debug(`iceconnectionstatechange: ${pc.iceConnectionState}`);
        });
    
        pc.addEventListener('signalingstatechange', () => {
            console.debug(`signalingstatechange: ${pc.signalingState}`);
        });
    
        pc.addEventListener('track', event => {
            console.debug('track', event.streams);
            if (event.track.kind == 'video') {
                land();

                $video.onloadedmetadata = () => {
                    resizeVideo();
                };
                $video.srcObject = event.streams[0];
            }          
        });
    
    }

    function resizeVideo() {
        const videoWidth = $video.videoWidth;
        const videoHeight = $video.videoHeight;
        const aspectRatio = !videoHeight ? 16/9 : videoWidth / videoHeight; 
    
        let videoSectionWidth = window.innerWidth;
        let videoSectionHeight = videoSectionWidth / aspectRatio;
        const windowHeight = window.innerHeight * 0.9;
        if (windowHeight < videoSectionHeight) {
            videoSectionHeight = windowHeight;
            videoSectionWidth = videoSectionHeight * aspectRatio;
        }
        console.debug(`video ${videoSectionWidth}/${videoSectionHeight}`);
        $mainSection.style.width = `${videoSectionWidth}px`;
        $mainSection.style.height = `${videoSectionHeight}px`;
        $videoEmpty.style.width = `${videoSectionWidth}px`;
        $videoEmpty.style.height = `${videoSectionHeight}px`;
        $video.style.width = `${videoSectionWidth}px`;
        $video.style.height = `${videoSectionHeight}px`;
    }

    function prepareDataChannel() {
        dc = pc.createDataChannel('command');
        dc.onclose = () => {
            console.debug('data channel close');
        };
        dc.onopen = () => {
            console.debug('data channel open');
        };
        dc.onmessage = event => {
            
            const data = event.data;

            if (typeof data === 'string') {
                const dataJson = JSON.parse(data);
                const messageType = dataJson.messageType;

                switch(messageType) {
                case 'takeoff':
                    takeoff();
                    break;
                case 'land':
                    land();
                    break;
                default:
                    return;
                } 
            }
        };
    }

    async function negotiate() {
        
        const gather = () => {
            return new Promise(function(resolve) {
                console.debug('gather', pc.iceGatheringState);
                if (pc.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    const checkState = () => {
                        console.debug('gather', pc.iceGatheringState);
                        if (pc.iceGatheringState === 'complete') {
                            pc.removeEventListener('icegatheringstatechange', checkState);
                            resolve();
                        }
                    };
                    pc.addEventListener('icegatheringstatechange', checkState);
                }
            });
        };

        const transceiver = pc.addTransceiver('video');
        transceiver.direction = 'recvonly';
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await gather();
        const offerLocalDesc = pc.localDescription;

        webSocket.send(JSON.stringify({
            messageType: 'offer',
            offer: {
                sdp: offerLocalDesc.sdp,
                type: offerLocalDesc.type,
            }
        }));
    }

    async function startCreatingConnection() {
        createPeerConnection();
        prepareDataChannel();
        await negotiate();
    }

    function checkIfCanOffer() {
        if (!webSocket) {
            return;
        }
        webSocket.send(JSON.stringify({
            messageType: 'canOffer',
            peerConnectionId
        }));
    }

    function setUpConnection() {
        ready();

        const startKey = $startKey.value;

        const wsProtocol = 0 <= location.protocol.indexOf('https') ? 'wss' : 'ws';
        webSocket = new WebSocket(`${wsProtocol}://${location.host}/remote?startKey=${startKey}`);
        webSocket.onmessage = async event => {
            const dataJson = JSON.parse(event.data);
            const messageType = dataJson.messageType;

            switch(messageType) {
            case 'iceServerInfo':
                iceServerInfo = dataJson.iceServerInfo;
                checkIfCanOffer();
                break;
            case 'canOffer':
                if (dataJson.canOffer) {
                    closeRTCConnectionQuietly();
                    await startCreatingConnection();
                } else {
                    console.warn('Can not offer.');
                }
                break;
            case 'answer':
                console.debug('answer', dataJson.answer);
                pc.setRemoteDescription(dataJson.answer);
                break;
            default:
                return;
            }
        };

        let onerror;
        webSocket.onerror = () => {
            alert('Failed to start connecting to the remote peer. The input code may be invalid.');
            onerror = true;
            init();
            webSocket.close();
        };

        webSocket.onopen = async () => {
            console.debug('open!!');
        };

        webSocket.onclose = () => {
            if (!onerror) {
                alert('Failed to open connection or connection was closed. Please retry.');
            }
            init();
        };

    }

    function startChecking() {
        clearTimeout(checkAndTryTimer);
        checkAndTryTimer = setTimeout(checkAndTry, TRY_INTERVAL_MILLIS);
    }

    async function checkAndTry() {
        if (state === STATE.INIT || !pc || !dc) {
            checkIfCanOffer();
            checkAndTryTimer = setTimeout(checkAndTry, TRY_INTERVAL_MILLIS);
            return;
        }
        const tryToConnect = async () => {
            console.log(`try to connect ${pc.connectionState} - ${dc.readyState}.`);
            checkIfCanOffer();
        };

        const isNewOrConnectiong = pc.connectionState === 'new' || pc.connectionState === 'connecting';
        if (isNewOrConnectiong) {
            const tail = ' .'.repeat(newOrConnectingCount + 1);
            showMessage(`Waiting for a while until the connection is established${tail}`);
            newOrConnectingCount++;
        } else {
            newOrConnectingCount = 0;
        }
        const isPeerConnectionStateNotValid = pc.connectionState === 'disconnected' ||
                                              pc.connectionState === 'failed' ||
                                              pc.connectionState === 'closed';

        const isDataChannelConnecting = dc.connectionState === 'connectiong';
        if (isDataChannelConnecting) {
            dataChannelConnectingCount++;
        } else {
            dataChannelConnectingCount = 0;
        }

        const isDataChannelStateNotValid = dc.readyState === 'closing' || 
                                           dc.readyState === 'closed';

                                           
        if (
            (isNewOrConnectiong && TRY_CONNECTING_COUNT < newOrConnectingCount) || 
            isPeerConnectionStateNotValid || 
            (isDataChannelConnecting && TRY_CONNECTING_COUNT < dataChannelConnectingCount) ||
            isDataChannelStateNotValid
        ) {
            dataChannelConnectingCount = 0;
            newOrConnectingCount = 0;
            readyView();
            await tryToConnect();
        } else {
            console.log(`Connection is valid. don't need to try (${newOrConnectingCount},${dataChannelConnectingCount}).`);
        }
        checkAndTryTimer = setTimeout(checkAndTry, TRY_INTERVAL_MILLIS);
    }

    /*
     * Sends a x,y coordinate each 100ms
     */
    async function doSendJoystickXy() {
        await sendJoystickXyIfNecessary();
        setTimeout(doSendJoystickXy, 100);
    }

    async function sendJoystickXyIfNecessary() {
        if (!xyCoordToSend) {
            return;
        }
        await sendJoystickXy(xyCoordToSend);
    }

    function sendJoystickXy(xy) {
        sendJoystickCommand(xy);
    }

    /*
     * Sends a z,r coordinate each 100ms
    */
    async function doSendJoystickZr() {
        await sendJoystickZrIfNecessary();
        setTimeout(doSendJoystickZr, 100);
    }

    async function sendJoystickZrIfNecessary() {
        if (!zrCoordToSend) {
            return;
        }
        await sendJoystickZr(zrCoordToSend);
    }

    function sendJoystickZr(zr) {
        sendJoystickCommand(zr);
    }

    function sendJoystickCommand(command) {
        if (dc) {
            dc.send(JSON.stringify({ command }));
        } else {
            console.debug('DataChannel is not opend.', command);
        }
    } 
});