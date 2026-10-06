export function resampleContour(raw,count=40){
  if(raw.length<4||raw.length>2000||count<4||count>100||raw.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error('轮廓至少需要四个有效位置，绘制点数最多2000');
  const points=raw.filter((p,i)=>!i||Math.hypot(p[0]-raw[i-1][0],p[1]-raw[i-1][1])>1e-6).map(p=>[...p]);
  if(points.length>1&&Math.hypot(...points[0].map((v,j)=>v-points.at(-1)[j]))<1e-6)points.pop();
  if(points.length<4)throw new Error('轮廓至少需要四个不同位置');
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let area=0,total=0;const lengths=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length];area+=p[0]*q[1]-q[0]*p[1];const length=Math.hypot(q[0]-p[0],q[1]-p[1]);lengths.push(length);total+=length;
    for(let j=i+2;j<points.length;j++){
      if(i===0&&j===points.length-1)continue;const a=points[j],b=points[(j+1)%points.length];
      if(cross(p,q,a)*cross(p,q,b)<0&&cross(a,b,p)*cross(a,b,q)<0)throw new Error('初始轮廓有交叉，请沿目标外缘重画');
    }
  }
  if(Math.abs(area)/2<25||total<20)throw new Error('轮廓面积太小或近共线，请圈出一个区域');
  const result=[];let segment=0,passed=0;
  for(let i=0;i<count;i++){
    const target=i/count*total;while(segment<lengths.length-1&&passed+lengths[segment]<target){passed+=lengths[segment++];}
    const t=(target-passed)/lengths[segment],a=points[segment],b=points[(segment+1)%points.length];result.push(a.map((v,j)=>v+(b[j]-v)*t));
  }return result;
}
