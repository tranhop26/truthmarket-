// test_mutable_str.mjs — xác định xem readContract có đọc state sau write không
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client = createClient({ chain: chains.studionet, account });

// Contract cực kỳ đơn giản: str field, set trong init, ghi đè qua write
const CODE = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    variable: str

    def __init__(self):
        self.variable = "INITIAL"

    @gl.public.write
    def set_variable(self, value: str) -> None:
        self.variable = value

    @gl.public.view
    def read_variable(self) -> str:
        return self.variable
`;

async function waitFinalized(hash) {
  process.stdout.write('  poll:');
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      const states = Object.keys(tx.contract_snapshot?.states?.finalized || {}).length;
      process.stdout.write(` DONE (states=${states})\n`);
      return tx;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

// Also try raw gen_call with correct params
async function rawGenCall(addr, fn, args = []) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    method: 'gen_call',
    params: { address: addr, function: fn, args, value: 0 },
    id: 1,
  });
  const resp = await fetch('https://studio.genlayer.com/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
  return resp.json();
}

(async () => {
  console.log('=== Mutable Str Test ===');
  
  // Deploy
  const deployHash = await client.deployContract({ code: CODE, args: [] });
  console.log('deploy TX:', deployHash);
  const deployTx = await waitFinalized(deployHash);
  const addr = deployTx.contract_snapshot?.contract_address;
  console.log('addr:', addr);

  // Read BEFORE write
  const v0 = await client.readContract({ address: addr, functionName: 'read_variable', args: [] });
  console.log('read BEFORE write:', v0, '(expected: INITIAL)');

  // Write: set_variable("UPDATED")
  console.log('\nWriting "UPDATED"...');
  const writeHash = await client.writeContract({
    address: addr,
    functionName: 'set_variable',
    args: ['UPDATED'],
    value: 0n,
  });
  await waitFinalized(writeHash);

  // Read AFTER write via readContract
  const v1 = await client.readContract({ address: addr, functionName: 'read_variable', args: [] });
  console.log('read AFTER write (readContract):', v1);

  if (v1 === 'UPDATED') {
    console.log('✅ readContract reads CURRENT state! Bug is elsewhere.');
  } else if (v1 === 'INITIAL') {
    console.log('❌ readContract reads GENESIS state! Root cause of all failures.');
  }

  // Raw gen_call test
  const rawResp = await rawGenCall(addr, 'read_variable', []);
  console.log('raw gen_call result:', JSON.stringify(rawResp).slice(0, 150));

  // Also try with state_type
  const body2 = JSON.stringify({
    jsonrpc: '2.0',
    method: 'gen_call',
    params: { contract_address: addr, function: 'read_variable', args: [], value: 0, state_type: 'finalized' },
    id: 2,
  });
  const resp2 = await fetch('https://studio.genlayer.com/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body2,
  });
  const raw2 = await resp2.json();
  console.log('gen_call (contract_address, finalized):', JSON.stringify(raw2).slice(0, 150));

})().catch(e => console.error('FATAL:', e.message));
