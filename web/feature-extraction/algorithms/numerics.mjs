// Display normalization is deliberately separate from these physical responses.
// Derivative boundary convention: reflect-101; pixel spacing defaults to one.
export function derivatives(profile, spacing=1) {
  if(profile.length<3 || !Number.isFinite(spacing) || spacing<=0) throw new RangeError('profile/spacing');
  const first=new Float64Array(profile.length), second=new Float64Array(profile.length);
  for(let i=0;i<profile.length;i++) {
    const left=profile[i===0?1:i-1];
    const right=profile[i===profile.length-1?profile.length-2:i+1];
    first[i]=(right-left)/(2*spacing);
    second[i]=(right-2*profile[i]+left)/(spacing*spacing);
  }
  return {first,second};
}

export function gaussianKernel(sigma) {
  if(!Number.isFinite(sigma)||sigma<=0||sigma>50) throw new RangeError('sigma must be in (0,50]');
  const radius=Math.ceil(3*sigma), kernel=new Float64Array(2*radius+1);
  let sum=0;
  for(let i=-radius;i<=radius;i++) {kernel[i+radius]=Math.exp(-i*i/(2*sigma*sigma)); sum+=kernel[i+radius];}
  for(let i=0;i<kernel.length;i++) kernel[i]/=sum;
  return kernel;
}

export function integralImage(pixels,width,height) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||pixels.length!==width*height)
    throw new RangeError('image dimensions');
  const stride=width+1, result=new Float64Array(stride*(height+1));
  for(let y=0;y<height;y++) {
    let sum=0;
    for(let x=0;x<width;x++) {sum+=pixels[y*width+x]; result[(y+1)*stride+x+1]=result[y*stride+x+1]+sum;}
  }
  return result;
}

// Half-open rectangle: [x0,x1) × [y0,y1); zero-padded summed-area table.
export function rectangleSum(table,width,height,x0,y0,x1,y1) {
  if(![x0,y0,x1,y1].every(Number.isInteger)||x0<0||y0<0||x1>width||y1>height||x0>=x1||y0>=y1
    ||table.length!==(width+1)*(height+1)) throw new RangeError('invalid rectangle');
  const stride=width+1;
  return table[y1*stride+x1]-table[y0*stride+x1]-table[y1*stride+x0]+table[y0*stride+x0];
}

// Mulberry32: deterministic teaching noise and RANSAC sampling.
export function seededRandom(seed) {
  let state=seed>>>0;
  return () => {
    state=(state+0x6D2B79F5)>>>0;
    let value=Math.imul(state^(state>>>15),1|state);
    value^=value+Math.imul(value^(value>>>7),61|value);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}
