import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_entry.js');
const canvas=require('@napi-rs/canvas');
globalThis.DOMMatrix=canvas.DOMMatrix;globalThis.ImageData=canvas.ImageData;globalThis.Path2D=canvas.Path2D;
const pdf=await import('file:///'+require.resolve('pdfjs-dist/legacy/build/pdf.mjs').replaceAll('\\','/'));
const d=await pdf.getDocument({data:new Uint8Array(fs.readFileSync('TPS55340.pdf')),useSystemFonts:true}).promise;
for(let i=1;i<=d.numPages;i++){const p=await d.getPage(i);const t=(await p.getTextContent()).items.map(x=>x.str).join(' ');if(t.includes('SEPIC Converter Application Schematic')){console.log('SEPIC page',i,t);const v=p.getViewport({scale:1.8});const c=canvas.createCanvas(v.width,v.height);await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;fs.writeFileSync('SEPIC-reference.png',c.toBuffer('image/png'));}}
