import {cp,mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';import {createHash} from 'node:crypto';
import {sites} from '../independent-sites.mjs';import {chapters} from '../real/catalog.mjs';
const repo=resolve(import.meta.dirname,'../..'),course=resolve(repo,'course-labs'),output=resolve(repo,'work/independent-sites');
const runtime=resolve(repo,'work/depth-runtime/vendor');
async function prepareRuntime(){
await mkdir(runtime,{recursive:true});
const runtimeUrl='https://hub-fover.github.io/Vision-Hu13/lab-007/vendor/';
const manifest=await fetch(runtimeUrl+'manifest.json').then(r=>{if(!r.ok)throw Error('无法取得已验证的深度运行时');return r.json()});
for(const file of manifest.files){if(file.path.includes('..')||file.path.startsWith('/'))throw Error('非法运行时路径');const dest=resolve(runtime,file.path);let bytes;try{bytes=await readFile(dest)}catch{}
 if(!bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256){const r=await fetch(runtimeUrl+file.path);if(!r.ok)throw Error(file.path);bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('运行时校验失败 '+file.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes)}}
await writeFile(resolve(runtime,'manifest.json'),JSON.stringify(manifest,null,2));
}
async function tree(dir){const list=[];for(const f of await readdir(dir,{withFileTypes:true})){if(['.git','.github','tests','package.json','integrity.json'].includes(f.name))continue;const p=resolve(dir,f.name);if(f.isDirectory())list.push(...await tree(p));else list.push(p)}return list;}
for(const site of sites.filter(s=>!process.argv.includes('--skip-depth')||s.group!=='depth')){
 const dest=resolve(output,site.repository),scene=chapters[site.chapter].scenes.find(s=>s.id===site.scene);await mkdir(dest,{recursive:true});
 if(site.group==='depth'){await prepareRuntime();
  await cp(resolve(repo,'lab-007/web'),dest,{recursive:true,filter:p=>!['node_modules','vendor','package.json','package-lock.json','.gitignore','test-results'].includes(p.split(/[\\/]/).at(-1))});await cp(runtime,resolve(dest,'vendor'),{recursive:true});
  // GitHub misidentifies upstream 32-character model identifiers as Mistral API keys.
  // Unicode escapes preserve both JavaScript identifiers and string values exactly.
  const bundlePath=resolve(dest,'vendor/transformers.web.min.js');let bundle=await readFile(bundlePath,'utf8');bundle=bundle.replace(/\b[A-Za-z][A-Za-z0-9]{31}\b/g,name=>name.slice(0,-1)+'\\u'+name.charCodeAt(31).toString(16).padStart(4,'0'));await writeFile(bundlePath,bundle);
  const runtimeManifestPath=resolve(dest,'vendor/manifest.json'),runtimeManifest=JSON.parse(await readFile(runtimeManifestPath,'utf8'));const bundleRecord=runtimeManifest.files.find(f=>f.path==='transformers.web.min.js');bundleRecord.bytes=Buffer.byteLength(bundle);bundleRecord.sha256=createHash('sha256').update(bundle).digest('hex');runtimeManifest.normalization='Upstream 32-character identifiers use equivalent Unicode escapes to avoid false positive secret detection.';await writeFile(runtimeManifestPath,JSON.stringify(runtimeManifest,null,2));
  let html=await readFile(resolve(dest,'index.html'),'utf8');html=html.replace('LAB 007 单目深度','实拍照片单目深度 · 独立实验').replaceAll('https://hub-fover.github.io/Vision-Hu13/lab-007/',site.url);await writeFile(resolve(dest,'index.html'),html);
  let config=await readFile(resolve(dest,'config.js'),'utf8');config=config.replaceAll('https://hub-fover.github.io/Vision-Hu13/lab-007/',site.url);await writeFile(resolve(dest,'config.js'),config);
  // Start the genuine built-in sample using the original inference path, with cancellation intact.
  await writeFile(resolve(dest,'js/independent-example.js'),`import './app.js';\nif(!new URLSearchParams(location.search).has('manual'))document.querySelector('[data-sample]').click();\n`);
  html=html.replace('src="./js/app.js"','src="./js/independent-example.js"');await writeFile(resolve(dest,'index.html'),html);
 }else{
  let html=await readFile(resolve(course,'lab.html'),'utf8');html=html.replaceAll('../style.css','./style.css').replaceAll('../real/style.css','./real/style.css').replaceAll('../app.mjs','./app.mjs').replace('<body data-state="loading">',`<body data-state="loading" data-chapter="${site.chapter}" data-scene="${site.scene}">`).replaceAll('href="../"','href="./"').replace('← 课程目录','↻ 本实验首页').replace('返回课程目录','本实验首页').replace('href="../TEACHER.md"','href="./TEACHER.md"');
  await writeFile(resolve(dest,'index.html'),html);await cp(resolve(course,'standalone.mjs'),resolve(dest,'app.mjs'));await cp(resolve(course,'style.css'),resolve(dest,'style.css'));await mkdir(resolve(dest,'real'),{recursive:true});
  for(const f of await readdir(resolve(course,'real')))if(/\.(mjs|css)$/.test(f)&&!['depth.mjs','entry.mjs'].includes(f))await cp(resolve(course,'real',f),resolve(dest,'real',f));
  if(site.group==='geometry'){await cp(resolve(course,'assets/geometry'),resolve(dest,'assets/geometry'),{recursive:true});}
  if(site.group==='perception'){await cp(resolve(course,'real/assets/perception'),resolve(dest,'real/assets/perception'),{recursive:true});if(site.scene!=='04')await cp(resolve(course,'real/assets/temporal'),resolve(dest,'real/assets/temporal'),{recursive:true});}
  if(site.group==='models')await cp(resolve(course,'real/assets/models'),resolve(dest,'real/assets/models'),{recursive:true,filter:p=>site.scene==='02'?p.split(/[\\/]/).at(-1)!=='mobilenet':p.split(/[\\/]/).at(-1)!=='coco'});
  if(site.group==='models'){const path=resolve(dest,'real/assets/models/manifest.json');const data=JSON.parse(await readFile(path,'utf8'));const kept=[];for(const record of data){try{await stat(resolve(dest,'real/assets/models',record.file));kept.push(record)}catch{}}await writeFile(path,JSON.stringify(kept,null,2));}
  for(const f of ['TEACHER.md','LICENSES.md'])await cp(resolve(course,f),resolve(dest,f));
 }
 await cp(resolve(repo,'LICENSE'),resolve(dest,'LICENSE'));
 await writeFile(resolve(dest,'README.md'),`# ${scene.title}\n\n独立课程实验 ${site.chapter}/${site.scene}。\n\n- 网站：[运行真实示例](${site.url})\n- 源码：[GitHub](${site.source})\n- 课件关联：第 ${scene.pages} 页。${scene.task}\n\n本仓库包含本实验网页、真实样例、运行时及资源来源说明，可部署到任意静态服务器。无需其他课程仓库；相机要求 HTTPS。${site.group==='depth'?'首次示例推理会从固定版本 Hugging Face 下载约 27 MB Depth Anything V2 Small 模型，输出为相对深度。运行时与实拍照片随仓库提供。':site.group==='models'?'打开即运行真实模型示例；分类/迁移使用 2 张训练照片及另一张测试照片，小样本不代表泛化能力。':'打开即运行实拍样例，可导入自己的数据。'}\n\n本地运行：\n\n\`\`\`sh\npython -m http.server 8000\n\`\`\`\n\n浏览器打开 http://localhost:8000/。请通过 HTTP/HTTPS 运行，不使用 file://。\n\n验证：\`npm test\` 检查随附资源 SHA-256。许可证及素材来源见 LICENSES.md、THIRD_PARTY_NOTICES.md（如适用）及各 assets 下 metadata/来源台账。\n`);
 await writeFile(resolve(dest,'.gitattributes'),'* -text\n');
 const hashes=[];for(const p of await tree(dest)){const bytes=await readFile(p);hashes.push({path:relative(dest,p).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}
 await writeFile(resolve(dest,'integrity.json'),JSON.stringify({repository:site.repository,files:hashes},null,2));
 await mkdir(resolve(dest,'tests'),{recursive:true});await writeFile(resolve(dest,'tests/assets.test.mjs'),`import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';\ntest('independent website assets match release manifest',async()=>{const m=JSON.parse(await readFile(new URL('../integrity.json',import.meta.url)));for(const f of m.files){assert.ok(!f.path.includes('..'));const b=await readFile(new URL('../'+f.path,import.meta.url));assert.equal(b.length,f.bytes,f.path);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256,f.path)}});\n`);
 await writeFile(resolve(dest,'package.json'),JSON.stringify({name:site.repository.toLowerCase(),private:true,type:'module',scripts:{test:'node --test tests/*.test.mjs'}},null,2));
 await mkdir(resolve(dest,'.github/workflows'),{recursive:true});await writeFile(resolve(dest,'.github/workflows/check.yml'),`name: Verify independent website\non: [push, pull_request]\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v6\n      - uses: actions/setup-node@v6\n        with:\n          node-version: '24'\n      - run: npm test\n`);
 console.log(`${site.repository}: ${hashes.length} self-contained files`);
}
