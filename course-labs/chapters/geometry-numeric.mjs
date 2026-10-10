export const N=32, clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function rng(seed=1){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
export const grid=f=>Array.from({length:N*N},(_,i)=>f(i%N,Math.floor(i/N)));
export const heat=(title,data,kind='heatmap')=>({kind,title,width:N,height:N,data:Array.from(data)});
export const curves=(title,values)=>({kind:'curves',title,series:[{label:title,points:values.map((v,i)=>[i,v])}]});
export const scatter=(title,points,lines=[])=>({kind:'scatter',title,points,lines});
export const rmse=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)/a.length);
export function solve(A,b){let m=A.map((r,i)=>[...r,b[i]]),n=b.length;for(let k=0;k<n;k++){let p=k;for(let j=k+1;j<n;j++)if(Math.abs(m[j][k])>Math.abs(m[p][k]))p=j;[m[k],m[p]]=[m[p],m[k]];const q=m[k][k]||1e-12;for(let j=k;j<=n;j++)m[k][j]/=q;for(let i=0;i<n;i++)if(i!==k){const t=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=t*m[k][j];}}return m.map(r=>r[n]);}
export function ls(rows,b){const n=rows[0].length,A=Array.from({length:n},()=>Array(n).fill(0)),v=Array(n).fill(0);rows.forEach((r,k)=>r.forEach((x,i)=>{v[i]+=x*b[k];r.forEach((y,j)=>A[i][j]+=x*y);}));return solve(A,v);}
export const control=(key,label,min,max,step,value)=>({key,label,min,max,step,value});
export function scene(id,title,pages,controls,compute,goal,principle,steps,questions,failure,file){return {id,title,source:{file,pages},controls,compute,goal,principle,steps,questions,failure};}
export function result(views,stages,metrics,numeric,message='合成场景含已知真值；改变参数后重新计算。'){return {views,stages,metrics:Object.entries(metrics).map(([label,value])=>({label,value})),numeric,message};}
export const stage=(label,views)=>({label,views});
// Mean photometric residual plus lambda/4 times each undirected first-order edge.
// gradient is the derivative of the reported mean objective, including boundary edges.
export function sfsObjectiveGradient(q,intensity,width,lambda){const gradient=Array(q.length).fill(0);let energy=0;for(let i=0;i<q.length;i++){const a=q[i],r=1/Math.sqrt(1+a*a)-intensity[i];energy+=r*r;gradient[i]+=-2*r*a/(1+a*a)**1.5;for(const j of [i%width<width-1?i+1:-1,i+width<q.length?i+width:-1])if(j>=0){const d=a-q[j];energy+=lambda*d*d/4;gradient[i]+=lambda*d/2;gradient[j]-=lambda*d/2;}}return {objective:energy/q.length,gradient:gradient.map(v=>v/q.length)};}
