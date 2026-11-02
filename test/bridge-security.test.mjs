import test from 'node:test';
import assert from 'node:assert/strict';
import allow from '../src/bridge-guard.cjs';
test('helper callback requires its private process capability and exact local destination',()=>{
  const req={method:'POST',url:'/respond',socket:{localPort:61971},headers:{host:'127.0.0.1:61971'}};
  assert.equal(allow(req,'test-only-capability'),false);
  req.headers['x-deskpet-bridge-capability']='test-only-capability';assert.equal(allow(req,'test-only-capability'),true);
  req.headers.host='attacker.example:61971';assert.equal(allow(req,'test-only-capability'),false);
});
