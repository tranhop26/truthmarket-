/**
 * TruthMarket — Deploy Script (Node.js ESM)
 * Chạy: node --input-type=module < scripts/deploy_contracts.mjs
 * Hoặc: node scripts/deploy_contracts.mjs
 */

import { createClient, createAccount, chains } from 'genlayer-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Tài khoản test đã được fund qua sim_fundAccount
const PRIVATE_KEY = '0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a';

// Khởi tạo client + account
const account = createAccount(PRIVATE_KEY);
const client = createClient({
  chain: chains.studionet,
  account,
});

console.log('='.repeat(60));
console.log('  TruthMarket — Deploy Script');
console.log(`  Account: ${account.address}`);
console.log('='.repeat(60));

// Helper: đọc contract code
function readContract(filename) {
  const path = resolve(ROOT, 'contracts', filename);
  const code = readFileSync(path, 'utf8');
  console.log(`\n[READ] ${filename} — ${code.length} bytes`);

  // Checklist: chỉ dùng directive chính thức theo docs.genlayer.com
  const lines = code.split('\n');
  if (!lines[0].includes('Depends')) {
    throw new Error('CHECKLIST FAIL: Dòng 1 phải là # { "Depends": "py-genlayer:..." }');
  }
  // NOTE: self.x = TreeMap() trong __init__ là ĐÚNG theo PatternTest.py chính thức
  // Rule cũ sai đã bị xóa
  if (!code.includes('class Contract(gl.Contract):')) {
    throw new Error('CHECKLIST FAIL: Thiếu class Contract(gl.Contract)');
  }
  if (!code.includes('from genlayer import *')) {
    throw new Error('CHECKLIST FAIL: Thiếu from genlayer import *');
  }
  console.log('  ✅ Pre-deploy checklist PASS');
  return code;
}

// Helper: deploy một contract, chờ finalization, trả về EVM address
async function deployContract(name, code, args = []) {
  console.log(`\n📦 Deploying ${name}...`);
  console.log(`   Args: ${JSON.stringify(args)}`);

  try {
    const txHash = await client.deployContract({ code, args });
    console.log(`  TX Hash: ${txHash}`);

    // Chờ finalization để lấy EVM address
    process.stdout.write('  Waiting for finalization...');
    let evmAddress = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const tx = await client.getTransaction({ hash: txHash });
      if (tx.statusName === 'FINALIZED') {
        evmAddress = tx.contract_snapshot?.contract_address;
        process.stdout.write(` DONE\n`);
        break;
      }
      process.stdout.write('.');
    }
    if (!evmAddress) throw new Error(`Finalization timeout for ${name}`);

    console.log(`  ✅ ${name} deployed at EVM: ${evmAddress}`);
    return { txHash, evmAddress };
  } catch (err) {
    console.error(`  ❌ Deploy FAILED: ${err.message}`);
    throw err;
  }
}

// Main deploy flow
async function main() {
  const addresses = {};

  // ── STEP 1: Deploy market.py — must finalize first to get EVM address
  const marketCode = readContract('market.py');
  const market = await deployContract('Market', marketCode, ['']);
  addresses.market_tx   = market.txHash;
  addresses.market      = market.evmAddress;

  // ── STEP 2: Deploy market_registry.py — pass EVM address (not tx hash)
  const registryCode = readContract('market_registry.py');
  const registry = await deployContract('MarketRegistry', registryCode, [
    addresses.market,   // EVM address of market contract
  ]);
  addresses.registry_tx = registry.txHash;
  addresses.registry    = registry.evmAddress;

  // ── STEP 3: Deploy dispute_resolver.py — pass EVM address (not tx hash)
  const resolverCode = readContract('dispute_resolver.py');
  const resolver = await deployContract('DisputeResolver', resolverCode, [
    addresses.market,   // EVM address of market contract
    2,                  // dispute_window_hours = 2
    100000,             // min_bond_amount = 100,000 wei
  ]);
  addresses.resolver_tx = resolver.txHash;
  addresses.resolver    = resolver.evmAddress;

  // ── Lưu kết quả ──
  const output = {
    deployed_at: new Date().toISOString(),
    account: account.address,
    network: 'studionet',
    rpc: 'https://studio.genlayer.com/api',
    contracts: {
      market: addresses.market,
      market_registry: addresses.registry,
      dispute_resolver: addresses.resolver,
    }
  };

  const outPath = resolve(ROOT, 'deployed_addresses.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Địa chỉ đã lưu: ${outPath}`);

  // Tạo .env.local cho frontend
  const envContent = `# TruthMarket — tự động tạo bởi deploy_contracts.mjs
NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS=${addresses.market}
NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS=${addresses.registry}
NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS=${addresses.resolver}
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_CHAIN_ID=61999
`;
  const envPath = resolve(ROOT, 'frontend', '.env.local');
  writeFileSync(envPath, envContent);
  console.log(`✅ .env.local đã cập nhật: ${envPath}`);

  console.log('\n' + '='.repeat(60));
  console.log('  🎉 Tất cả 3 contract đã deploy thành công!');
  console.log('='.repeat(60));
  console.log(`\n  Market:          ${addresses.market}`);
  console.log(`  MarketRegistry:  ${addresses.registry}`);
  console.log(`  DisputeResolver: ${addresses.resolver}`);

  return addresses;
}

main().catch(err => {
  console.error('\n❌ Deploy failed:', err);
  process.exit(1);
});
