export function sourceMapping(source,target={width:source.w,height:source.h}){
  const sx=source.w/source.originalWidth,sy=source.h/source.originalHeight;
  const fit=Math.min(target.width/source.w,target.height/source.h);
  const offset=[(target.width-source.w*fit)/2,(target.height-source.h*fit)/2];
  return {
    original:{width:source.originalWidth,height:source.originalHeight},
    decoded:{width:source.w,height:source.h},analysis:{...target},
    convention:'zero-based pixel-center coordinates; decoded browser image orientation',
    fitScale:fit,fitOffset:offset,
    originalToAnalysis:[[fit*sx,0,offset[0]+fit*(sx-1)/2],[0,fit*sy,offset[1]+fit*(sy-1)/2],[0,0,1]]
  };
}
