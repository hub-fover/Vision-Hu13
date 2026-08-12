import { cameraPoseError } from './contracts.js';
function area(q){ return .5*q.reduce((s,p,i)=>s+p[0]*q[(i+1)%4][1]-p[1]*q[(i+1)%4][0],0); }
function cross(a,b,c){ return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]); }
function segmentsCross(a,b,c,d){ const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]); return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0; }
export function validateQuad(points,width,height){
  if(!Array.isArray(points)||points.length!==4||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))) throw cameraPoseError('INVALID_QUAD');
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0) throw cameraPoseError('INVALID_DIMENSIONS');
  const q=points.map(p=>[Number(p[0]),Number(p[1])]);
  if(q.some(([x,y])=>x<=0||y<=0||x>=width||y>=height)) throw cameraPoseError('TARGET_CLIPPED');
  const minD=Math.max(4,.002*Math.hypot(width,height)); for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.hypot(q[i][0]-q[j][0],q[i][1]-q[j][1])<minD)throw cameraPoseError('INVALID_QUAD');
  if(segmentsCross(q[0],q[1],q[2],q[3])||segmentsCross(q[1],q[2],q[3],q[0])||area(q)<=Math.max(256,.001*width*height)) throw cameraPoseError('INVALID_QUAD');
  if(!q.every((_,i)=>cross(q[i],q[(i+1)%4],q[(i+2)%4])>0)) throw cameraPoseError('INVALID_QUAD');
  const e=q.map((p,i)=>Math.hypot(p[0]-q[(i+1)%4][0],p[1]-q[(i+1)%4][1])); if(Math.min(...e)/Math.max(...e)<.02) throw cameraPoseError('INVALID_QUAD'); return q;
}
export class QuadEditor {
 constructor(canvas){ this.canvas=canvas; this.points=[]; this.onChange=()=>{}; this.active=-1; canvas?.addEventListener('pointerdown',e=>this.#down(e)); canvas?.addEventListener('pointermove',e=>this.#move(e)); canvas?.addEventListener('pointerup',()=>this.active=-1); }
 setPoints(points){ this.points=points.map(p=>[...p]); this.draw(); }
 #point(e){ const r=this.canvas.getBoundingClientRect(); return [(e.clientX-r.left)*this.canvas.width/r.width,(e.clientY-r.top)*this.canvas.height/r.height]; }
 #down(e){ const p=this.#point(e); this.active=this.points.reduce((best,q,i)=>Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(this.points[best]?.[0]-p[0]||1e9,this.points[best]?.[1]-p[1]||1e9)?i:best,-1); }
 #move(e){ if(this.active<0)return; this.points[this.active]=this.#point(e); this.draw(); this.onChange(this.points); }
 draw(){ const c=this.canvas?.getContext?.('2d'); if(!c)return; c.clearRect(0,0,this.canvas.width,this.canvas.height); if(this.points.length!==4)return; c.strokeStyle='#22d3ee'; c.lineWidth=3;c.beginPath();this.points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.stroke(); this.points.forEach((p,i)=>{c.fillStyle='#f8fafc';c.beginPath();c.arc(...p,10,0,Math.PI*2);c.fill();c.fillStyle='#0f172a';c.font='bold 12px sans-serif';c.fillText(['TL','TR','BR','BL'][i],p[0]+12,p[1]-12);}); }
}
