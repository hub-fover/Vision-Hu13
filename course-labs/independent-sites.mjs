export const owner='hub-fover';
export const sites=[
 {chapter:'004',scene:'03',repository:'Vision-Lab-004-03-Depth',group:'depth'},
 {chapter:'005',scene:'02',repository:'Vision-Lab-005-02-Stereo',group:'geometry'},
 {chapter:'005',scene:'03',repository:'Vision-Lab-005-03-OpticalFlow',group:'perception'},
 {chapter:'006',scene:'01',repository:'Vision-Lab-006-01-Background',group:'perception'},
 {chapter:'006',scene:'02',repository:'Vision-Lab-006-02-Tracking',group:'perception'},
 {chapter:'006',scene:'04',repository:'Vision-Lab-006-04-Segmentation',group:'perception'},
 {chapter:'007',scene:'03',repository:'Vision-Lab-007-03-Classification',group:'models'},
 {chapter:'008',scene:'01',repository:'Vision-Lab-008-01-Transfer',group:'models'},
 {chapter:'008',scene:'02',repository:'Vision-Lab-008-02-Detection',group:'models'}
].map(s=>({...s,url:`https://${owner}.github.io/${s.repository}/`,source:`https://github.com/${owner}/${s.repository}`}));
export const siteFor=(chapter,scene)=>sites.find(s=>s.chapter===chapter&&s.scene===scene);
