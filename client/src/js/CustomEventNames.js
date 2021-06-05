import { CustomEventNamesFactory } from 'client-js-lib';

const CustomEventNames = CustomEventNamesFactory.createNames();
const CustomEventContextNames = CustomEventNamesFactory.createNames();

CustomEventNames
    .set('OJM_DRONE_REMOTE__VIEW_STATE_CHANGED', 'ojm-drone-remote/view-state-changed')
    .set('OJM_DRONE_REMOTE__VIDEO_TRACK', 'ojm-drone-remote/video-track')
    .set('OJM_DRONE_REMOTE__MESSAGE_ONLY', 'ojm-drone-remote/message_only')

;

export { CustomEventNames, CustomEventContextNames };
