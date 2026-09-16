const { connectToFabric } = require('../backend/src/config/fabric');

function parse(buf) {
  return JSON.parse(Buffer.from(buf).toString('utf8'));
}

async function test() {
  const conn = connectToFabric('BEL');
  try {
    const r1 = parse(await conn.contract.evaluateTransaction('ResolveDID', 'did:chaincoder:BEL:BEL001'));
    console.log('1. ResolveDID BEL001 ->', JSON.stringify(r1, null, 2));

    const v1 = parse(await conn.contract.evaluateTransaction('VerifyDID', 'did:chaincoder:BEL:BEL001'));
    console.log('2. VerifyDID BEL001 ->', JSON.stringify(v1, null, 2));

    const v2 = parse(await conn.contract.evaluateTransaction('VerifyDID', 'did:chaincoder:BEL:NONEXISTENT'));
    console.log('3. VerifyDID Nonexistent ->', JSON.stringify(v2, null, 2));

    const v3 = parse(await conn.contract.evaluateTransaction('VerifyDID', 'invalid-did'));
    console.log('4. VerifyDID Invalid format ->', JSON.stringify(v3, null, 2));
  } finally {
    conn.gateway.close();
    conn.client.close();
  }
}

test().catch(err => { console.error(err); process.exit(1); });