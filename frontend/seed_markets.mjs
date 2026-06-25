// TruthMarket seed — use genlayer-js writeContract directly (no CLI subprocess)
// Decrypts keystore to get private key, then calls writeContract with correct types
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { readFileSync } from 'fs';
import { Wallet } from 'ethers';
import { homedir } from 'os';
import { join } from 'path';

const TM = '0x0ba8A1f3A816236237CE4d2a9FE1633a00dd81bD';
const KEYSTORE_PATH = join(homedir(), '.genlayer', 'keystores', 'pactkeeper-deployer.json');
const PASSWORD = 'PactKeeper2026!';

async function main() {
  console.log('=== TruthMarket Seed via genlayer-js ===');

  // Decrypt keystore
  console.log('Decrypting keystore...');
  const keystore = readFileSync(KEYSTORE_PATH, 'utf8');
  const wallet = await Wallet.fromEncryptedJson(keystore, PASSWORD);
  console.log(`Signer: ${wallet.address}`);

  const account = createAccount(wallet.privateKey);

  const client = createClient({ chain: studionet });

  const countBefore = Number(await client.readContract({ address: TM, functionName: 'get_market_count', args: [] }));
  console.log(`market_count BEFORE = ${countBefore}`);

  // Market 2: AI benchmark
  const sources2 = JSON.stringify(['https://leaderboard.lmsys.org', 'https://openai.com/research/gpt-4']);
  console.log('\n--- Creating Market 2: AI Benchmark ---');
  console.log('sources_json:', sources2);
  
  const tx2 = await client.writeContract({
    address: TM,
    functionName: 'create_market',
    args: [
      'Will any AI model surpass average human expert score on MMLU benchmark by end of 2026?',
      sources2,
      BigInt(1761091200)
    ],
    account,
  });
  console.log('TX2:', tx2);

  // Market 3: ETH staking
  const sources3 = JSON.stringify(['https://beaconcha.in', 'https://dune.com/hildobby/eth2-staking']);
  console.log('\n--- Creating Market 3: ETH Staking ---');
  
  const tx3 = await client.writeContract({
    address: TM,
    functionName: 'create_market',
    args: [
      'Will Ethereum total staked ETH exceed 50 million by December 31 2026?',
      sources3,
      BigInt(1767225600)
    ],
    account,
  });
  console.log('TX3:', tx3);

  // Check result
  await new Promise(r => setTimeout(r, 3000));
  const countAfter = Number(await client.readContract({ address: TM, functionName: 'get_market_count', args: [] }));
  console.log(`\nmarket_count AFTER = ${countAfter}`);

  if (countAfter > countBefore) {
    const summary = await client.readContract({ address: TM, functionName: 'get_all_markets_summary', args: [] });
    console.log('\n✅ Markets summary:', summary);
  } else {
    console.log('❌ Count did not change');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
