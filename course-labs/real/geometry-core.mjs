/** Teaching SAD matcher; original implementation, not OpenCV StereoBM. d = x_left - x_right. */
function validate(left,right,w,h,block){if(left.length!==w*h||right.length!==w*h)throw Error('image shape mismatch');if(!Number.isInteger(block)||block<3||block%2!==1)throw Error('block must be odd and >=3');}
export function pointCosts(left,right,w,h,x,y,maxDisparity,block){
 validate(left,right,w,h,block);const r=block>>1,costs=new Float32Array(maxDisparity+1).fill(Infinity);
 if(y<r||y>=h-r||x<r||x>=w-r)return costs;
 for(let d=0;d<=Math.min(maxDisparity,x-r);d++){let sum=0;for(let yy=y-r;yy<=y+r;yy++)for(let xx=x-r;xx<=x+r;xx++)sum+=Math.abs(left[yy*w+xx]-right[yy*w+xx-d]);costs[d]=sum/(block*block);}return costs;
}
export function stereoMatch(left,right,w,h,{maxDisparity=48,block=7,uniqueness=.1}={}){
 validate(left,right,w,h,block);if(!Number.isInteger(maxDisparity)||maxDisparity<1||maxDisparity>=w)throw Error('maxDisparity outside image');
 const n=w*h,r=block>>1,best=new Float32Array(n).fill(Infinity),second=new Float32Array(n).fill(Infinity),disparity=new Float32Array(n),confidence=new Float32Array(n),valid=new Uint8Array(n),stride=w+1,integral=new Float64Array((w+1)*(h+1));
 for(let d=0;d<=maxDisparity;d++){
 integral.fill(0);for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){sum+=x>=d?Math.abs(left[y*w+x]-right[y*w+x-d]):0;integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;}}
 for(let y=r;y<h-r;y++)for(let x=d+r;x<w-r;x++){
 const a=(y-r)*stride+x-r,b=(y+r+1)*stride+x+r+1,c=(y-r)*stride+x+r+1,e=(y+r+1)*stride+x-r,v=(integral[b]+integral[a]-integral[c]-integral[e])/(block*block),i=y*w+x;
 if(v<best[i]){second[i]=best[i];best[i]=v;disparity[i]=d;}else if(v<second[i])second[i]=v;
 }}
 for(let y=r;y<h-r;y++)for(let x=r;x<w-r;x++){const i=y*w+x;if(Number.isFinite(second[i])){confidence[i]=(second[i]-best[i])/Math.max(second[i],1e-6);valid[i]=confidence[i]>=uniqueness&&second[i]>best[i]?1:0;}}
 return {disparity,confidence,valid,cost:best,width:w,height:h};
}
