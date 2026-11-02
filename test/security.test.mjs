import test from 'node:test';
import assert from 'node:assert/strict';
import { requestGate } from '../src/request-gate.mjs';
const capability='test-only-capability';
const req=(method='GET',headers={},url='/control/status')=>({method,url,socket:{localPort:31471},headers:{host:'127.0.0.1:31471',...headers}});
test('status reads are local and cross-origin reads are rejected',()=>{
  assert.equal(requestGate(req(),capability),true);
  assert.equal(requestGate(req('GET',{host:'attacker.example:31471'}),capability),false);
  assert.equal(requestGate(req('GET',{origin:'https://attacker.example'}),capability),false);
});
test('all HTTP mutations and chat reads require the private process capability',()=>{
  assert.equal(requestGate(req('POST'),capability),false);
  assert.equal(requestGate(req('POST',{'x-deskpet-capability':capability}),capability),true);
  assert.equal(requestGate(req('GET',{},'/dsh-pet-7340/chat?pet=main'),capability),false);
});
test('legacy shutdown cannot mutate state through a GET or HEAD request',()=>{
  assert.equal(requestGate(req('GET',{},'/shutdown'),capability),false);
  assert.equal(requestGate(req('HEAD',{},'/shutdown'),capability),false);
  assert.equal(requestGate(req('GET',{'x-deskpet-capability':capability},'/shutdown'),capability),false);
  assert.equal(requestGate(req('POST',{'x-deskpet-capability':capability},'/shutdown'),capability),true);
});
test('encoded private paths receive the same protection as decoded paths',()=>{
  for(const path of ['/dsh-pet-7340/%63hat','/dsh-pet-7340/ch%61t','/%73hutdown'])assert.equal(requestGate(req('GET',{},path),capability),false);
});
