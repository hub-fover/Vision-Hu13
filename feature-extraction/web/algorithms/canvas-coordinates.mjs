// CSS object-fit: contain adds letterboxing before the image-space zoom/pan.
export function canvasCoordinates(clientX,clientY,rect,width,height,view={zoom:1,x:0,y:0}){
  const scale=Math.min(rect.width/width,rect.height/height);
  const left=rect.left+(rect.width-width*scale)/2,top=rect.top+(rect.height-height*scale)/2;
  return [(clientX-left)/scale,(clientY-top)/scale].map((value,axis)=>{
    const size=axis?height:width,pan=axis?view.y:view.x;
    return Math.max(0,Math.min(size-1,(value-size/2-pan)/view.zoom+size/2));
  });
}
