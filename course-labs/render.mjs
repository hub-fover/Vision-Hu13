const colors=['#2364cf','#dd7643','#23977f','#8b66bb','#d3982f','#d75b89'];
const palette=t=>{t=Math.max(0,Math.min(1,t));const stops=[[20,40,88],[35,96,171],[41,173,176],[152,217,168],[249,219,104]];const q=t*4,i=Math.min(3,Math.floor(q)),f=q-i;return stops[i].map((c,j)=>Math.round(c*(1-f)+stops[i+1][j]*f));};
export function draw(canvas,view,rotation={yaw:.65,pitch:.7}){
 const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#f8faff';ctx.fillRect(0,0,W,H);ctx.font='18px "Microsoft YaHei",sans-serif';ctx.textAlign='left';canvas.dataset.kind=view.kind;
 const box={x:62,y:30,w:W-90,h:H-92};
 if(['heatmap','matrix'].includes(view.kind))imageView(ctx,view,box,W,H);
 else if(view.kind==='surface')surface(ctx,view,box,rotation);
 else if(view.kind==='scatter')scatter(ctx,view,box);
 else if(view.kind==='curves')curves(ctx,view,box,W,H);
 else if(view.kind==='bars')bars(ctx,view,box);
 else {ctx.fillStyle='#536982';ctx.fillText('未支持的视图类型',50,50);}
}
function extent(values){let min=Infinity,max=-Infinity;for(const v of values){if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}if(!Number.isFinite(min))return[0,1];return[min,max];}
function format(x){if(Math.abs(x)>=10000||Math.abs(x)>0&&Math.abs(x)<.001)return x.toExponential(1);return Number(x.toFixed(3)).toString();}
function imageView(ctx,v,b,W,H){
 const a=v.data,range=v.range??extent(a),span=range[1]-range[0]||1,cell=Math.min(b.w/v.width,(b.h-20)/v.height),w=v.width*cell,h=v.height*cell,x=b.x+(b.w-w)/2,y=b.y+(b.h-h-20)/2;
 const small=new OffscreenCanvas(v.width,v.height),s=small.getContext('2d'),p=s.createImageData(v.width,v.height);
 for(let i=0;i<a.length;i++){const rgb=palette((a[i]-range[0])/span);p.data.set([...rgb,255],i*4);}s.putImageData(p,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,x,y,w,h);ctx.imageSmoothingEnabled=true;
 if(v.kind==='matrix'&&v.width<=12&&v.height<=12){ctx.font=`${Math.min(22,cell*.3)}px system-ui`;ctx.textAlign='center';for(let j=0;j<v.height;j++)for(let i=0;i<v.width;i++){const z=a[j*v.width+i],t=(z-range[0])/span;ctx.fillStyle=t<.4?'#fff':'#20354f';ctx.fillText(format(z),x+(i+.5)*cell,y+(j+.57)*cell);}ctx.textAlign='left';}
 for(let i=0;i<240;i++){ctx.fillStyle=`rgb(${palette(i/239).join(',')})`;ctx.fillRect(W/2-120+i,H-42,1,10);}ctx.font='15px system-ui';ctx.fillStyle='#61738d';ctx.textAlign='right';ctx.fillText(format(range[0]),W/2-128,H-31);ctx.textAlign='left';ctx.fillText(format(range[1]),W/2+128,H-31);
}
function axes(ctx,b,xRange,yRange,xLabel='',yLabel=''){
 ctx.strokeStyle='#dbe4f1';ctx.lineWidth=1;ctx.font='15px system-ui';ctx.fillStyle='#8191a8';
 for(let i=0;i<=4;i++){let x=b.x+b.w*i/4,y=b.y+b.h*i/4;ctx.beginPath();ctx.moveTo(x,b.y);ctx.lineTo(x,b.y+b.h);ctx.stroke();ctx.beginPath();ctx.moveTo(b.x,y);ctx.lineTo(b.x+b.w,y);ctx.stroke();ctx.textAlign='center';ctx.fillText(format(xRange[0]+(xRange[1]-xRange[0])*i/4),x,b.y+b.h+24);ctx.textAlign='right';ctx.fillText(format(yRange[1]-(yRange[1]-yRange[0])*i/4),b.x-8,y+5);}
 ctx.textAlign='center';ctx.fillStyle='#637c9c';ctx.fillText(xLabel,b.x+b.w/2,b.y+b.h+51);ctx.save();ctx.translate(18,b.y+b.h/2);ctx.rotate(-Math.PI/2);ctx.fillText(yLabel,0,0);ctx.restore();ctx.textAlign='left';
 return(x,y)=>[b.x+(x-xRange[0])/(xRange[1]-xRange[0]||1)*b.w,b.y+b.h-(y-yRange[0])/(yRange[1]-yRange[0]||1)*b.h];
}
function padded(range){const d=range[1]-range[0]||1;return[range[0]-.08*d,range[1]+.08*d];}
function scatter(ctx,v,b){
 const pts=v.points??[],all=[...pts,...(v.lines??[]).flatMap(l=>[[l[0],l[1]],[l[2],l[3]]])],domain=v.domain??[...padded(extent(all.map(p=>p[0]))),...padded(extent(all.map(p=>p[1])))],map=axes(ctx,b,domain.slice(0,2),domain.slice(2,4),v.xLabel??'x',v.yLabel??'y');
 ctx.lineWidth=2;ctx.strokeStyle='#8ba3c6';for(const l of v.lines??[]){const p=map(l[0],l[1]),q=map(l[2],l[3]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();}
 const labels=[...new Set(pts.map(p=>p[2]??0))];for(const p of pts){const xy=map(p[0],p[1]),idx=labels.indexOf(p[2]??0);ctx.fillStyle=colors[idx%colors.length];ctx.beginPath();ctx.arc(...xy,pts.length>500?2:4.5,0,Math.PI*2);ctx.fill();}
 if(labels.length>1&&labels.length<=8){ctx.font='14px system-ui';labels.forEach((label,i)=>{ctx.fillStyle=colors[i%colors.length];ctx.fillRect(b.x+i*90,5,12,12);ctx.fillText(String(label),b.x+18+i*90,17);});}
}
function curves(ctx,v,b,W,H){
 const all=(v.series??[]).flatMap(s=>s.points),xr=padded(extent(all.map(p=>p[0]))),yr=padded(extent(all.map(p=>p[1]))),map=axes(ctx,b,xr,yr,v.xLabel??'步骤',v.yLabel??'数值');
 for(const [i,s]of(v.series??[]).entries()){ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=2.8;ctx.beginPath();s.points.forEach((p,j)=>{const xy=map(...p);if(j)ctx.lineTo(...xy);else ctx.moveTo(...xy);});ctx.stroke();ctx.fillStyle=colors[i%colors.length];ctx.font='14px "Microsoft YaHei",sans-serif';ctx.fillText(s.label??'',b.x+i*180,17);}
}
function bars(ctx,v,b){
 const [min,max]=extent(v.values),range=[Math.min(0,min),Math.max(0,max)||1],map=axes(ctx,b,[0,v.values.length],padded(range),'项目','数值');
 v.values.forEach((z,i)=>{const x=b.x+(i+.2)*b.w/v.values.length,w=b.w/v.values.length*.6,y=map(i,z)[1],zero=map(i,0)[1];ctx.fillStyle=colors[i%colors.length];ctx.fillRect(x,Math.min(y,zero),w,Math.max(1,Math.abs(y-zero)));if(v.values.length<=15){ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillStyle='#3e5675';ctx.fillText(v.labels?.[i]??String(i),x+w/2,b.y+b.h+44);}});ctx.textAlign='left';
}
function surface(ctx,v,b,r){
 const [min,max]=v.range??extent(v.data),span=max-min||1;
 const project=(x,y,z)=>{const xx=x*Math.cos(r.yaw)-y*Math.sin(r.yaw),yy=x*Math.sin(r.yaw)+y*Math.cos(r.yaw),zz=(z-min)/span-.5;return[b.x+b.w/2+xx*b.w*.29,b.y+b.h*.55+(yy*Math.sin(r.pitch)-zz*Math.cos(r.pitch))*b.h*.6,yy];};
 const cells=[];for(let y=0;y<v.height-1;y++)for(let x=0;x<v.width-1;x++){let ids=[y*v.width+x,y*v.width+x+1,(y+1)*v.width+x+1,(y+1)*v.width+x],xyz=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],pts=xyz.map(([xx,yy],i)=>project(xx/(v.width-1)*2-1,yy/(v.height-1)*2-1,v.data[ids[i]]));cells.push({pts,z:ids.reduce((a,i)=>a+v.data[i],0)/4,depth:pts.reduce((a,p)=>a+p[2],0)/4});}
 cells.sort((a,c)=>a.depth-c.depth);for(const cell of cells){ctx.fillStyle=`rgb(${palette((cell.z-min)/span).join(',')})`;ctx.strokeStyle='rgba(20,50,90,.14)';ctx.lineWidth=.7;ctx.beginPath();cell.pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();ctx.stroke();}
 ctx.font='15px system-ui';ctx.fillStyle='#61738d';ctx.fillText(`z: ${format(min)} → ${format(max)} · 相对形状`,b.x,b.y+b.h+40);
}
