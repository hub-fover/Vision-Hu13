export const TrackingState={IDLE:'idle',TRACKING:'tracking',LOST:'tracking-lost'};
export function acceptTracking(metrics){return metrics&&metrics.trackedFeatures>=12&&metrics.homographyInlierRatio>=.6&&metrics.medianForwardBackwardErrorPx<=1.5;}
export function updateTracking(state,metrics){if(acceptTracking(metrics))return {...state,badFrames:0,status:TrackingState.TRACKING};const bad=(state.badFrames||0)+1;return {...state,badFrames:bad,status:bad>=3?TrackingState.LOST:TrackingState.TRACKING};}
