export function drawOverlay(ctx,quad,result){
  if(!ctx||!quad)return;ctx.save();ctx.strokeStyle=result?.quality==='unstable'?'#ef4444':'#22d3ee';ctx.lineWidth=3;ctx.beginPath();quad.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
  if(result){const o=quad[0],x=quad[1],y=quad[3],r=result.rotationMatrix||[[1,0,0],[0,1,0],[0,0,1]],length=Math.max(20,Math.hypot(x[0]-o[0],x[1]-o[1])*.35);const z=[o[0]+r[0][2]*length,o[1]+r[1][2]*length];for(const [color,end] of [['#ef4444',x],['#22c55e',y],['#3b82f6',z]]){ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(...o);ctx.lineTo(...end);ctx.stroke();}}
  ctx.restore();
}
