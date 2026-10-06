import {seededRandom} from './numerics.mjs';

export function solve(A,b){
  const n=b.length,m=A.map((r,i)=>[...r,b[i]]);
  let norm=0;for(const row of A)for(const v of row)norm=Math.max(norm,Math.abs(v));
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[pivot][k]))pivot=i;
    if(Math.abs(m[pivot][k])<Math.max(1e-13,norm*1e-12))throw new Error('退化或病态配置：线性系统无法稳定求解');
    [m[k],m[pivot]]=[m[pivot],m[k]];const divisor=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=divisor;
    for(let i=0;i<n;i++)if(i!==k){const factor=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=factor*m[k][j];}
  }
  return m.map(row=>row[n]);
}
export function leastSquares(rows,values){
  const n=rows[0].length,A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
  for(let k=0;k<rows.length;k++)for(let i=0;i<n;i++){b[i]+=rows[k][i]*values[k];for(let j=0;j<n;j++)A[i][j]+=rows[k][i]*rows[k][j];}
  return solve(A,b);
}
function centerAndScale(points){
  const cx=points.reduce((s,p)=>s+p[0],0)/points.length,cy=points.reduce((s,p)=>s+p[1],0)/points.length;
  const scale=Math.sqrt(points.reduce((s,p)=>s+(p[0]-cx)**2+(p[1]-cy)**2,0)/points.length);
  if(scale<1e-8)throw new Error('退化配置：点重合');
  return {cx,cy,scale,points:points.map(p=>[(p[0]-cx)/scale,(p[1]-cy)/scale])};
}
export function fitModel(points,type){
  const minimum=type==='line'?2:type==='circle'?3:5;
  if(points.length<minimum)throw new Error(`至少需要 ${minimum} 个点`);
  const norm=centerAndScale(points),p=norm.points;
  if(type==='line'){
    let xx=0,xy=0,yy=0;for(const [x,y]of p){xx+=x*x;xy+=x*y;yy+=y*y;}
    const angle=.5*Math.atan2(2*xy,xx-yy),a=-Math.sin(angle),b=Math.cos(angle);
    return {type,a,b,c:-(a*norm.cx+b*norm.cy),angle,objective:'orthogonal TLS'};
  }
  if(type==='circle'){
    const [D,E,F]=leastSquares(p.map(([x,y])=>[x,y,1]),p.map(([x,y])=>-x*x-y*y));
    const cx=-D/2,cy=-E/2,r2=cx*cx+cy*cy-F;
    if(r2<=0)throw new Error('圆拟合退化');
    return {type,cx:cx*norm.scale+norm.cx,cy:cy*norm.scale+norm.cy,radius:Math.sqrt(r2)*norm.scale,objective:'algebraic least squares'};
  }
  if(type!=='ellipse')throw new Error('不支持的模型');
  // Normalize first; solve a genuine conic, then check positive definite ellipse.
  const [B,C,D,E,F]=leastSquares(p.map(([x,y])=>[x*y,y*y,x,y,1]),p.map(([x])=>-x*x));
  const det=C-B*B/4;
  if(det<=1e-8)throw new Error('椭圆拟合失败：二次曲线不是正定椭圆');
  const cx=(-C*D+B*E/2)/(2*det),cy=(-E+B*D/2)/(2*det);
  const constant=-(cx*cx+B*cx*cy+C*cy*cy+D*cx+E*cy+F);
  const delta=Math.hypot(1-C,B),l1=(1+C-delta)/2,l2=(1+C+delta)/2;
  if(constant<=0||l1<=0)throw new Error('椭圆拟合退化');
  const angle=.5*Math.atan2(B,1-C)+Math.PI/2;
  return {type,cx:cx*norm.scale+norm.cx,cy:cy*norm.scale+norm.cy,a:Math.sqrt(constant/l1)*norm.scale,b:Math.sqrt(constant/l2)*norm.scale,angle,objective:'algebraic conic least squares (x² coefficient fixed after normalization)'};
}
export function residual([px,py],model){
  if(model.type==='line')return Math.abs(model.a*px+model.b*py+model.c);
  if(model.type==='circle')return Math.abs(Math.hypot(px-model.cx,py-model.cy)-model.radius);
  const c=Math.cos(model.angle),s=Math.sin(model.angle),dx=px-model.cx,dy=py-model.cy;
  const x=Math.abs(c*dx+s*dy),y=Math.abs(-s*dx+c*dy),a=model.a,b=model.b;
  // Closest point by coarse global angular search followed by bounded golden search.
  // Stable for interior points and eccentric ellipses, unlike radial error.
  const distance=t=>(a*Math.cos(t)-x)**2+(b*Math.sin(t)-y)**2;
  let best=0,min=Infinity;for(let i=0;i<=32;i++){const t=i*Math.PI/64,v=distance(t);if(v<min){min=v;best=i;}}
  let lo=Math.max(0,(best-1)*Math.PI/64),hi=Math.min(Math.PI/2,(best+1)*Math.PI/64);
  const ratio=(Math.sqrt(5)-1)/2;
  for(let i=0;i<32;i++){const t1=hi-ratio*(hi-lo),t2=lo+ratio*(hi-lo);if(distance(t1)<distance(t2))hi=t2;else lo=t1;}
  return Math.sqrt(Math.min(distance(0),distance(Math.PI/2),distance((lo+hi)/2)));
}
export function ransac(points,type,{seed=42,threshold=3,iterations=80}={}){
  const count=type==='line'?2:type==='circle'?3:5,random=seededRandom(seed),trace=[];
  if(points.length<count)throw new Error('点数不足');
  if(threshold<=0||iterations<1||iterations>500)throw new Error('RANSAC 参数超出范围');
  let best=null;
  for(let iteration=0;iteration<iterations;iteration++){
    const sample=[];while(sample.length<count){const index=Math.floor(random()*points.length);if(!sample.includes(index))sample.push(index);}
    try {
      const model=fitModel(sample.map(i=>points[i]),type),inliers=[];let error=0;
      for(let i=0;i<points.length;i++){const d=residual(points[i],model);if(d<=threshold){inliers.push(i);error+=d*d;}}
      const candidate={model,inliers,error};
      if(!best||inliers.length>best.inliers.length||(inliers.length===best.inliers.length&&error<best.error))best=candidate;
      trace.push({iteration:iteration+1,sample,model,inliers,bestCount:best.inliers.length});
    }catch{trace.push({iteration:iteration+1,sample,invalid:true,bestCount:best?.inliers.length||0});}
  }
  if(!best||best.inliers.length<count)throw new Error('RANSAC 未找到足够内点');
  try{best.model=fitModel(best.inliers.map(i=>points[i]),type);}catch{}
  const inliers=points.flatMap((p,i)=>residual(p,best.model)<=threshold?[i]:[]);
  return {model:best.model,inliers,trace};
}
export function project(H,[x,y]){
  const z=H[6]*x+H[7]*y+H[8];
  if(!Number.isFinite(z)||Math.abs(z)<1e-9)throw new Error('齐次坐标分母接近零：投影点在无穷远');
  const out=[(H[0]*x+H[1]*y+H[2])/z,(H[3]*x+H[4]*y+H[5])/z];
  if(out.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw new Error('投影范围超出安全预算');
  return out;
}
export function multiply(A,B){
  return Array.from({length:9},(_,i)=>{const row=Math.floor(i/3),col=i%3;return A[row*3]*B[col]+A[row*3+1]*B[col+3]+A[row*3+2]*B[col+6];});
}
export function inverse(H){
  const [a,b,c,d,e,f,g,h,i]=H,co=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const det=a*co[0]+b*co[3]+c*co[6];if(Math.abs(det)<1e-12)throw new Error('变换矩阵奇异');return co.map(v=>v/det);
}
function nonCollinear(points){
  let xx=0,xy=0,yy=0;for(const [x,y]of points){xx+=x*x;xy+=x*y;yy+=y*y;}
  if(xx*yy-xy*xy<1e-7*(xx+yy)**2)throw new Error('退化或病态配置：对应点共线或近共线');
}
export function estimateTransform(from,to,type='projective'){
  const minimum=type==='rigid'?2:type==='affine'?3:4;
  if(from.length!==to.length||from.length<minimum)throw new Error('对应点数量不足或不一致');
  const src=centerAndScale(from),dst=centerAndScale(to);
  if(type==='rigid'){
    let dot=0,cross=0;
    for(let i=0;i<from.length;i++){const x=from[i][0]-src.cx,y=from[i][1]-src.cy,u=to[i][0]-dst.cx,v=to[i][1]-dst.cy;dot+=x*u+y*v;cross+=x*v-y*u;}
    if(Math.hypot(dot,cross)<1e-10)throw new Error('刚体估计退化');
    const angle=Math.atan2(cross,dot),c=Math.cos(angle),s=Math.sin(angle);
    return [c,-s,dst.cx-c*src.cx+s*src.cy,s,c,dst.cy-s*src.cx-c*src.cy,0,0,1];
  }
  nonCollinear(src.points);nonCollinear(dst.points);
  const rows=[],rhs=[];
  for(let i=0;i<from.length;i++){
    const [x,y]=src.points[i],[u,v]=dst.points[i];
    rows.push(type==='affine'?[x,y,1,0,0,0]:[x,y,1,0,0,0,-u*x,-u*y]);rhs.push(u);
    rows.push(type==='affine'?[0,0,0,x,y,1]:[0,0,0,x,y,1,-v*x,-v*y]);rhs.push(v);
  }
  const fitted=leastSquares(rows,rhs),normalized=type==='affine'?[...fitted,0,0,1]:[...fitted,1];
  const S=[1/src.scale,0,-src.cx/src.scale,0,1/src.scale,-src.cy/src.scale,0,0,1];
  const D=[dst.scale,0,dst.cx,0,dst.scale,dst.cy,0,0,1];
  let H=multiply(multiply(D,normalized),S);if(Math.abs(H[8])>1e-12)H=H.map(v=>v/H[8]);
  inverse(H);for(const p of from)project(H,p);return H;
}
