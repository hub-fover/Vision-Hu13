export function fitPairImage(input,iw,ih,w,h){
  if(input.length!==iw*ih||[iw,ih,w,h].some(v=>!Number.isInteger(v)||v<1)||w*h>1280*1280)throw new RangeError('第二图尺寸无效或超出预算');
  const scale=Math.min(w/iw,h/ih),offset=[(w-iw*scale)/2,(h-ih*scale)/2],pixels=new Float32Array(w*h).fill(20);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=(x-offset[0])/scale,v=(y-offset[1])/scale;if(u<0||v<0||u>iw-1||v>ih-1)continue;
    const a=Math.floor(u),b=Math.floor(v),c=Math.min(iw-1,a+1),d=Math.min(ih-1,b+1),dx=u-a,dy=v-b;
    pixels[y*w+x]=(1-dy)*((1-dx)*input[b*iw+a]+dx*input[b*iw+c])+dy*((1-dx)*input[d*iw+a]+dx*input[d*iw+c]);
  }return {pixels,scale,offset};
}
