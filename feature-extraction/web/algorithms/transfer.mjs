export function transferBuffers(payload){
  const objects=new Set(),buffers=new Set();
  function visit(value){
    if(!value||typeof value!=='object'||objects.has(value))return;objects.add(value);
    if(ArrayBuffer.isView(value)){if(value.buffer instanceof ArrayBuffer)buffers.add(value.buffer);return;}
    if(value instanceof ArrayBuffer){buffers.add(value);return;}
    for(const child of Object.values(value))visit(child);
  }
  visit(payload);return [...buffers];
}
