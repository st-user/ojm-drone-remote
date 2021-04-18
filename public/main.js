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

    const _q = selector => document.querySelector(selector);
    const _none = $elem => $elem.style.display = 'none';
    const _block = $elem => $elem.style.display = 'block';
    const _click = ($elem, handler) => $elem.addEventListener('click', handler);

    const $messageArea = _q('#messageArea');

    const $start = _q('#start');
    const $startKey = _q('#startKey');

    const $appArea = _q('#appArea');
    const $droneVideoEmpty = _q('#droneVideoEmpty');
    const $droneVideoArea = _q('#droneVideoArea');
    const $video = _q('#video');
    const $droneControlArea = _q('#droneControlArea');


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
        _none($appArea);
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
        _block($appArea);
        _block($droneVideoEmpty);
        _none($droneVideoArea);
        disableControl();
    }

    function land() {
        state = STATE.LAND;
        landView();
    }

    function landView() {
        showMessage('The connection to the remote peer is established. Please wait until the drone takes off.');
        $startKey.disabled = true;
        $start.disabled = true;
        _block($appArea);
        _none($droneVideoEmpty);
        _block($droneVideoArea);
        disableControl();
    }

    function takeoff() {
        state = STATE.TAKEOFF;
        takeoffView();
    }

    function takeoffView() {
        showMessage('The drone took off. Now you can control the drone. Enjoy!!');
        $startKey.disabled = true;
        $start.disabled = true;
        _block($appArea);
        _none($droneVideoEmpty);
        _block($droneVideoArea);
        enableControl();
    }


    function disableControl() {
        $droneControlArea.classList.remove('enabled');
        $droneControlArea.classList.add('disabled');
    }

    function enableControl() {
        $droneControlArea.classList.add('enabled');
        $droneControlArea.classList.remove('disabled');
    }

    function showMessage(message, level) {
        $messageArea.textContent = message;
        $messageArea.classList.remove('error');
        $messageArea.classList.remove('normal');

        switch(level) {
        case 'error':
            $messageArea.classList.add('error');
            break;
        case 'info':
        default:
            $messageArea.classList.add('info');
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
        console.log(iceServerInfo);

        const config = {
            sdpSemantics: 'unified-plan'
        };
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
        }
        console.log(config);
    
        pc = new RTCPeerConnection(config);
    
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
                    console.debug(`$video.videoWidth ${$video.videoWidth}`);
                    $droneVideoArea.style.width = `${$video.videoWidth}px`;
                };
                $video.srcObject = event.streams[0];
            }          
        });
    
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
        const offer = await pc.createOffer({offerToReceiveVideo : true, offerToReceiveAudio: true});
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
                const answer = dataJson.answer;
                console.debug(`answer`, answer);
                pc.setRemoteDescription(answer);
                break;
            default:
                return;
            }
        }

        webSocket.onopen = async () => {
            console.debug('open!!');
        };

        webSocket.onclose = () => {
            showMessage('Failed to open connection or connection was closed. Please retry.');
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
            showMessage(`Waiting for a while until the connection is established. (${newOrConnectingCount}/${TRY_CONNECTING_COUNT})`);
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

    _click($start, setUpConnection);

    function sendCommand(command) {
        dc.send(JSON.stringify({ command }));
    }

    function setUpControl(selector, command) {
        const $elem = document.querySelector(selector);
        $elem.addEventListener('click', async () => {
            if (state === STATE.TAKEOFF) {
                sendCommand(command);
            }
        });
    }
    
    setUpControl('#moveForward', 'forward');
    setUpControl('#moveRight', 'right');
    setUpControl('#moveBackward', 'back');
    setUpControl('#moveLeft', 'left');
    
    setUpControl('#moveUp', 'up');
    setUpControl('#turnRight', 'cw');
    setUpControl('#moveDown', 'down');
    setUpControl('#turnLeft', 'ccw');


    init();
});