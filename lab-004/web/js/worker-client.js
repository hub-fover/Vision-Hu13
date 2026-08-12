export class WorkerClient {
  constructor(url=new URL('./camera-pose.worker.js',import.meta.url)){this.worker=new Worker(url,{type:'module'});this.pending=new Map();this.seq=0;this.worker.onmessage=e=>{const p=this.pending.get(e.data.id);if(!p)return;this.pending.delete(e.data.id);e.data.error?p.reject(Object.assign(new Error(e.data.error.message),e.data.error)):p.resolve(e.data.result??e.data);};}
  request(type,payload={},transfer=[]){const id=++this.seq;let resolveRequest,rejectRequest;const promise=new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;});promise.id=id;promise.requestId=id;promise.cancel=()=>this.cancel(id);this.pending.set(id,{resolve:resolveRequest,reject:rejectRequest});this.worker.postMessage({type,id,...payload},transfer);return promise;}
  cancel(id){this.worker.postMessage({type:'cancel',id});const p=this.pending.get(id);if(p){this.pending.delete(id);const e=new Error('CANCELLED');e.code='CANCELLED';p.reject(e);}}
  terminate(){for(const p of this.pending.values()){const e=new Error('CANCELLED');e.code='CANCELLED';p.reject(e);}this.pending.clear();this.worker.terminate();}
}
