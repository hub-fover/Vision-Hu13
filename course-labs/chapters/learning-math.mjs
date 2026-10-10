export const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
export const rng=seed=>()=>{seed=(1664525*(seed>>>0)+1013904223)>>>0;return seed/4294967296};
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const mse=(a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0)/a.length;
export function mlpForward(w,x){let h=[0,1,2].map(j=>sigmoid(w[j*3]*x[0]+w[j*3+1]*x[1]+w[j*3+2]));return {h,p:sigmoid(dot(h,w.slice(9,12))+w[12])}}
export const mlpLoss=(w,x,y)=>{let p=mlpForward(w,x).p;return -y*Math.log(p+1e-12)-(1-y)*Math.log(1-p+1e-12)};
export function mlpGradient(w,x,y){let {h,p}=mlpForward(w,x),d=p-y,g=Array(13).fill(0);for(let j=0;j<3;j++){let z=d*w[9+j]*h[j]*(1-h[j]);g[3*j]=z*x[0];g[3*j+1]=z*x[1];g[3*j+2]=z;g[9+j]=d*h[j]}g[12]=d;return g}
export function attention(q,k,v){let scores=q.map(a=>k.map(b=>dot(a,b)/Math.sqrt(a.length)));let weights=scores.map(row=>{let e=row.map(x=>Math.exp(x-Math.max(...row))),s=e.reduce((a,b)=>a+b);return e.map(x=>x/s)});return {scores,weights,output:weights.map(row=>v[0].map((_,j)=>row.reduce((s,w,i)=>s+w*v[i][j],0)))}}
export function iou(a,b){let z=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));return z/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-z||1)}
export const curve=(title,values)=>({kind:'curves',title,series:[{label:title,points:values.map((v,i)=>[i,v])}]});
export const bars=(title,values,labels)=>({kind:'bars',title,values,labels});
export const matrix=(title,data)=>({kind:'matrix',title,width:data[0].length,height:data.length,data:data.flat()});
export const scatter=(title,points)=>({kind:'scatter',title,points,domain:[-2,2,-2,2]});
export const control=(key,label,min,max,step,value)=>({key,label,min,max,step,value});
export function result(views,numeric,metrics,message,early){return {views,numeric,metrics,message,stages:[{label:'初始/中间真实状态',views:early||views},{label:'最终计算状态',views}]}}
export function scene(id,title,pages,goal,principle,controls,compute,chapter='007'){return {id,title,source:{file:chapter==='007'?'007-机器学习.pptx':'008-深度学习.pptx',pages},goal,principle,controls,steps:['观察带真值的合成输入与固定随机种子。','调整参数并重新执行实际数值计算。','比较中间状态、最终结果和损失。'],questions:['参数改变后哪些数值发生变化？','合成结果能否直接推广到真实数据？为什么？'],failure:'样本太少、过大步长或分布变化会使训练不稳定；本实验仅展示轻量机制，不提供真实数据性能保证。',compute}}
export function trainLinear(samples,steps=120,rate=.1,hinge=false,lambda=.05){let w=[0,0,0],losses=[];for(let t=0;t<=steps;t++){let g=[0,0,0],loss=0;for(let [x,y] of samples){let z=dot(w,x),p=sigmoid(z),d=p-y;if(hinge){let target=2*y-1;loss+=Math.max(0,1-target*z);d=target*z<1?-target:0}else loss+=-y*Math.log(p+1e-12)-(1-y)*Math.log(1-p+1e-12);x.forEach((v,j)=>g[j]+=d*v/samples.length)}if(hinge){loss+=samples.length*lambda*(w[0]*w[0]+w[1]*w[1])/2;g[0]+=lambda*w[0];g[1]+=lambda*w[1]}losses.push(loss/samples.length);if(t<steps)w=w.map((v,j)=>v-rate*g[j])}return {w,losses}}
export const accuracy=(samples,predict)=>samples.reduce((s,[x,y])=>s+(predict(x)===y),0)/samples.length;

