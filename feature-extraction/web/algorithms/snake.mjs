function sample(field,w,h,[x,y]){
  x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));
  const a=Math.floor(x),b=Math.floor(y),dx=x-a,dy=y-b,c=Math.min(w-1,a+1),d=Math.min(h-1,b+1);
  return (1-dy)*((1-dx)*field[b*w+a]+dx*field[b*w+c])+dy*((1-dx)*field[d*w+a]+dx*field[d*w+c]);
}
function term(points,i,field,w,h,{alpha,beta,gamma}){
  const n=points.length,p=points[i],before=points[(i+n-1)%n],after=points[(i+1)%n];
  return alpha*((p[0]-before[0])**2+(p[1]-before[1])**2)+beta*((before[0]-2*p[0]+after[0])**2+(before[1]-2*p[1]+after[1])**2)+gamma*sample(field,w,h,p);
}
export function snakeEnergy(points,field,w,h,{alpha=.02,beta=.2,gamma=40}={}){
  return points.reduce((s,p,i)=>s+term(points,i,field,w,h,{alpha,beta,gamma}),0);
}
export function evolveSnake(initial,field,w,h,{alpha=.02,beta=.2,gamma=40,step=1,iterations=100}={}){
  if(step<=0||step>5||!Number.isFinite(step))throw new RangeError('Snake 步长须在0至5px之间');
  if(initial.length<4||initial.length>100||field.length!==w*h||[alpha,beta,gamma].some(v=>!Number.isFinite(v)||v<0)||iterations<1||iterations>200)throw new RangeError('Snake 点数、能量参数或迭代预算无效');
  if(initial.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new RangeError('初始轮廓含无效坐标');
  const points=initial.map(([x,y])=>[Math.max(1,Math.min(w-2,x)),Math.max(1,Math.min(h-2,y))]),options={alpha,beta,gamma};
  const trace=[{iteration:0,points:points.map(p=>[...p]),energy:snakeEnergy(points,field,w,h,options)}];
  let reason='达到迭代上限';
  for(let iteration=1;iteration<=iterations;iteration++){
    let moved=0;
    for(let i=0;i<points.length;i++){
      const original=points[i],indices=[(i+points.length-1)%points.length,i,(i+1)%points.length];
      const energy=()=>indices.reduce((s,j)=>s+term(points,j,field,w,h,options),0);
      let best=energy(),chosen=original;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;const p=[original[0]+dx*step,original[1]+dy*step];
        if(p[0]<1||p[1]<1||p[0]>w-2||p[1]>h-2)continue;
        points[i]=p;const e=energy();if(e<best-1e-9){best=e;chosen=p;}
      }
      points[i]=chosen;if(chosen!==original)moved++;
    }
    trace.push({iteration,points:points.map(p=>[...p]),energy:snakeEnergy(points,field,w,h,options),moved});
    if(!moved){reason='离散邻域局部稳定：没有降低能量的移动';break;}
  }
  return {points,trace,reason};
}
