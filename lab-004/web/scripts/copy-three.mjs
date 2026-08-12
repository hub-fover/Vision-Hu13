import { copyFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../vendor/',import.meta.url),{recursive:true});
await copyFile(new URL('../node_modules/three/build/three.module.js',import.meta.url),new URL('../vendor/three.module.js',import.meta.url));
await copyFile(new URL('../node_modules/three/build/three.core.js',import.meta.url),new URL('../vendor/three.core.js',import.meta.url));
console.log('Copied Three.js 0.185.1 to vendor/three.module.js');
