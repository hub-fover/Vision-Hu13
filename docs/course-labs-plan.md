# 五章课程实验网站

Approved plan: five independent chapters (004–008), 24 real lightweight experiments, Chinese study material, local browser computation, fixed seeds, actual intermediate stages, PNG/JSON export, teacher mode, responsive layout. Publish under course-labs/ in the existing GitHub Pages artifact without replacing old Labs.

## Tasks
- [x] Public shell, renderer, Worker, route, cancellation, upload, export.
- [x] 004 five reconstruction experiments; 005 four geometry experiments.
- [x] 006 five perception experiments.
- [x] 007 five machine learning experiments; 008 five deep learning mechanism experiments.
- [x] Numeric, browser, teaching, release validation and review.
- [ ] Build/CI integration, publish, verify online, package deliverables.

## Shared interface
Each chapter exports `chapter={id,title,sections}` and `scenes` (ordered array). Scene fields: id (01 etc), title, goal, principle, steps (array), questions (array), failure, source {file,pages}, controls (array of {key,label,min,max,step,value}), compute({params,seed,input}). Optional input is {width,height,data} grayscale values 0..1. Each scene computes synchronously, no DOM/network. Params numeric and controls defaults must fully define them.

Result: {views,stages,metrics,message,numeric}. views is three objects, corresponding input/process/result. Each stage {label,views} holds actual intermediate results. metrics is [{label,value,unit?}]; numeric holds machine-readable computation results. All numbers finite. Results must be deterministic for seed. Only synthetic cases with ground truth may report errors/accuracy.

View types: {kind:'heatmap'|'matrix'|'surface',title,width,height,data:Array|TypedArray,range?:[min,max]}; {kind:'scatter',title,points:[[x,y,label?]],lines?:[[x1,y1,x2,y2]],domain?:[xmin,xmax,ymin,ymax]}; {kind:'curves',title,series:[{label,points:[[x,y]]}],xLabel?,yLabel?}; {kind:'bars',title,values:[number],labels?:[string]}. Keep heatmaps <=96*96, stages <=24. Three-dimensional surfaces rendered with rotatable projection. Tests node:test, independent of DOM. No dependencies in browser by default. Uploaded image experiments must explicitly consume input and label results without fabricated truth.

## Delivery paths
Source course-labs/, deploy web/course-labs/. Chapter URLs course-labs/chapter-004/?scene=01 and teacher=1. Main entry course-labs/. Node server must serve directories and .mjs MIME. Lightweight mechanism demonstrations do not claim full-scale CLIP, ViT, DETR, VLM, or image diffusion inference. Raw PPTs never published.
