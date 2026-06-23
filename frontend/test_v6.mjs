// test_v6.mjs — test create_market on v6 contract
import { createClient, createAccount, chains } from 'genlayer-js';

const PRIVATE_KEY = '0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a';
const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: chains.studionet, account });

const MARKET   = '0x0ea22148F74F2C5320b5Afb3F934bbB8A5245d6d';
const REGISTRY = '0x01F4adb1DFb739Ca4033B63702Eed780A5699a2C';
const RESOLVER = '0x23Ca416F3E64a81C56a7CB4Ef0699A77D2eA3c46';

const now = BigInt(Math.floor(Date.now() / 1000));
const deadline = now + 600n;

async function waitFinalized(hash, label) {
  process.stdout.write(`  [${label}] polling`);
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      const stateCount = Object.keys(tx.contract_snapshot?.states?.finalized || {}).length;
      process.stdout.write(` DONE (result=${tx.result}, states=${stateCount})\n`);
      return tx;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

(async () => {
  console.log('=== TruthMarket v6 Test ===');
  console.log('Market:  ', MARKET);
  console.log('Registry:', REGISTRY);
  console.log('Resolver:', RESOLVER);
  console.log('deadline:', deadline.toString(), '(+' + 600 + 's from now)');

  // 1) Verify contract is indexable
  console.log('\n--- get_market_count (before) ---');
  try {
    const cnt = await client.readContract({ address: MARKET, functionName: 'get_market_count', args: [] });
    console.log('market_count =', cnt);
  } catch(e) {
    console.log('CONTRACT NOT INDEXED YET:', e.message.slice(0, 60));
    console.log('Waiting 10s and retrying...');
    await new Promise(r => setTimeout(r, 10000));
    const cnt = await client.readContract({ address: MARKET, functionName: 'get_market_count', args: [] });
    console.log('market_count =', cnt);
  }

  // 2) create_market
  console.log('\n--- create_market ---');
  const txHash = await client.writeContract({
    address: MARKET,
    functionName: 'create_market',
    args: [
      'Is Oppenheimer (2023) the highest-grossing biopic of all time globally?',
      JSON.stringify([
        'https://en.wikipedia.org/wiki/Oppenheimer_(film)',
        'https://www.imdb.com/title/tt15398776/',
      ]),
      deadline,
    ],
    value: 0n,
  });
  console.log('TX hash:', txHash);
  const writeTx = await waitFinalized(txHash, 'create_market');

  // Check state after write
  const stateAfter = writeTx.contract_snapshot?.states?.finalized || {};
  console.log('States count after write:', Object.keys(stateAfter).length);

  // Read count
  const cnt2 = await client.readContract({ address: MARKET, functionName: 'get_market_count', args: [] });
  console.log('market_count after:', cnt2, typeof cnt2);

  if (Number(cnt2) > 0) {
    console.log('\n✅✅✅ create_market SUCCESS! market_count =', cnt2);

    // Read market info
    const mkt = await client.readContract({ address: MARKET, functionName: 'get_market', args: [0n] });
    console.log('get_market(0):', JSON.parse(mkt));
  } else {
    console.log('\n❌ create_market FAIL: count still 0');
  }
})().catch(e => console.error('FATAL:', e.message, e.stack?.slice(0, 200)));
