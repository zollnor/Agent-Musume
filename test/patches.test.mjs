import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patchStandalone,patchHelper } from '../src/patches.mjs';
// The upstream files as they were copied in (prepare.mjs keeps them as *.original.js beside the patched output).
const source=new URL('../vendor/dsh-pet/',import.meta.url);
test('patch connects only the standalone event source and native HTTP gate',async()=>{
  const input=await readFile(new URL('lib/standalone.original.js',source),'utf8');
  const output=patchStandalone(input);
  assert(output.startsWith('#!'),'the executable hashbang must remain the first line');
  assert(!output.includes('from "@electron/get"'));
  assert(output.includes('agent-musume.events'));
  assert(output.includes('agent-musume.host'));
  assert(output.includes('x-deskpet-bridge-capability'));
  assert(output.includes('function reduceWorkStatus('));
});
test('patch rejects unknown upstream structure instead of silently half-patching',()=>{
  assert.throws(()=>patchStandalone('unrecognized build'),/patch/i);
});
test('helper data is isolated and extension is loaded',async()=>{
  const input=await readFile(new URL('runtime/electron-helper/main.original.js',source),'utf8');
  const output=patchHelper(input);
  assert(output.includes("app.setName('agent-musume')"));
  assert(output.includes('AGENT_MUSUME_DATA'));
  assert(output.includes('deskpet-extension.cjs'));
  assert(output.includes('bridge-guard.cjs'));
});
test('clip files are served with byte ranges so a walk can seek to its turn back',async()=>{
  const {patchHelper}=await import('../src/patches.mjs');
  const out=patchHelper(await readFile(new URL('../vendor/dsh-pet/runtime/electron-helper/main.original.js',import.meta.url),'utf8'));
  assert(out.includes("return fileResponse(data, request.headers.get('range'), resp.status || 200, headers);"));
  const i=out.indexOf('function fileResponse');
  const fileResponse=new Function('Response','return '+out.slice(i,out.indexOf('\n}\n',i)+2))(class{constructor(body,init){this.body=body;this.init=init;}});
  const data=new Uint8Array(100).map((_,k)=>k);
  const whole=fileResponse(data,null,200,{});assert.equal(whole.init.status,200);assert.equal(whole.init.headers['accept-ranges'],'bytes');
  const part=fileResponse(data,'bytes=90-',200,{});assert.equal(part.init.status,206);assert.equal(part.init.headers['content-range'],'bytes 90-99/100');assert.deepEqual([...part.body],[90,91,92,93,94,95,96,97,98,99]);
  assert.equal(fileResponse(data,'bytes=-5',200,{}).init.headers['content-range'],'bytes 95-99/100');
  assert.equal(fileResponse(data,'bytes=200-',200,{}).init.status,416);
});
