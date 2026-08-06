export class WorkerClient { constructor(url=new URL('./camera-pose.worker.js',import.meta.url)){this.worker=new Worker(url,{type:'module'});this.pending=new Map();this.seq=0;this.worker.onmessage=e=>{const {id}=e.data;const p=this.pending.get(id);if(p){this.pending.delete(id);e.data.error?p.reject(Object.assign(new Error(e.data.error.message),e.data.error)):p.resolve(e.data.result??e.data);}};}
 request(type,payload={},transfer=[]){const id=++this.seq;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({type,id,...payload},transfer);});}
 cancel(id){this.worker.postMessage({type:'cancel',id});}
 terminate(){for(const p of this.pending.values())p.reject(new Error('CANCELLED'));this.pending.clear();this.worker.terminate();}}
