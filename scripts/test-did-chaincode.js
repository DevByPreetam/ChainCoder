const { connectToFabric } = require('../backend/src/config/fabric');

async function test() {
  const conn = connectToFabric('BEL');
  try {
    console.log('--- 1. Testing ResolveDID for BEL001 ---');
    const r1 = await conn.contract.evaluateTransaction('ResolveDID', 'did:chaincoder:BEL:BEL001');
    console.log('Resolved BEL001:', r1.toString());

    console.log('--- 2. Testing ResolveDID for CON001 ---');
    const r2 = await conn.contract.evaluateTransaction('ResolveDID', 'did:chaincoder:Contractor:CON001');
    console.log('Resolved CON001:', r2.toString());

    console.log('--- 3. Testing VerifyDID for BEL001 ---');
    const v1 = await conn.contract.evaluateTransaction('VerifyDID', 'did:chaincoder:BEL:BEL001');
    console.log('Verified BEL001:', v1.toString());

    console.log('--- 4. Testing VerifyDID for Nonexistent ---');
    const v2 = await conn.contract.evaluateTransaction('VerifyDID', 'did:chaincoder:BEL:NONEXISTENT');
    console.log('Verified Nonexistent:', v2.toString());

    console.log('--- 5. Testing VerifyDID for Invalid format ---');
    const v3 = await conn.contract.evaluateTransaction('VerifyDID', 'invalid-did-format');
    console.log('Verified Invalid format:', v3.toString());

    console.log('--- 6. Testing RegisterDID (idempotent association) ---');
    const reg = await conn.contract.submitTransaction('RegisterDID', 'BEL001');
    console.log('RegisterDID BEL001:', reg.toString());

    console.log('--- 7. Re-resolving BEL001 after explicit registration ---');
    const rAfter = await conn.contract.evaluateTransaction('ResolveDID', 'did:chaincoder:BEL:BEL001');
    console.log('Resolved after RegisterDID:', rAfter.toString());
  } finally {
    conn.gateway.close();
    conn.client.close();
  }
}

test().catch(err => { console.error('Error:', err); process.exit(1); });