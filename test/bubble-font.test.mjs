import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {patchRenderer,patchShared,BUBBLE_FONT} from '../src/patches.mjs';

const root=new URL('../',import.meta.url),helper=new URL('vendor/dsh-pet/runtime/electron-helper/',root),fonts=new URL('vendor/dsh-pet/assets/fonts/',root);
const read=(name,base=helper)=>readFileSync(new URL(name,base),'utf8');

test('the only bubble font shipped is the open one, with its licence beside it',()=>{
  assert.deepEqual(readdirSync(fonts).sort(),['MaokenAssortedSans-Lite.ttf','OFL-MaokenAssortedSans.txt']);
  assert.match(read('OFL-MaokenAssortedSans.txt',fonts),/SIL Open Font License/);
});

test('the pet windows load that font and no longer name the old one',()=>{
  const renderer=patchRenderer(read('renderer.original.js')),shared=patchShared(read('shared-core.original.js'));
  assert(renderer.includes(`font-family:"${BUBBLE_FONT}"`));assert(renderer.includes("encodeURIComponent('MaokenAssortedSans-Lite')"));
  assert(existsSync(new URL('MaokenAssortedSans-Lite.ttf',fonts)));
  assert(shared.includes(BUBBLE_FONT));
  for(const text of [renderer,shared,read('../../../../src/interaction-stage.js')])assert(!text.includes('ShangshouSoftCandy'));
});

test('a bubble line never starts with the wave mark',async()=>{
  const {createRequire}=await import('node:module');const I=createRequire(import.meta.url)('../src/interaction-catalog.cjs');
  assert.equal(I.softBreaks('摸鱼时间到～歇会儿嘛！').replace('\u200b',''),'摸鱼时间到\u2060～歇会儿嘛！');
  assert.equal(I.softBreaks('收到！'),'收到！','a line with nothing to join is left alone');
});
