'use strict';

const crypto = require('crypto');
const { query, isDbConnected } = require('../config/db');
const { getAuditLogs } = require('../services/auditLogService');
const fabricService = require('../services/fabricService');

function sha256(data) {
    return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

// In-memory array of dynamically simulated blocks
const simulatedExtraBlocks = [];

/**
 * Builds the canonical cryptographic block sequence from Genesis up to latest transaction
 */
async function buildBlockchain() {
    const blocks = [];

    // -------------------------------------------------------------------------
    // BLOCK 0: GENESIS BLOCK
    // -------------------------------------------------------------------------
    const b0Timestamp = '2026-09-15T12:00:00.000Z';
    const b0Txs = [
        {
            txId: 'TX-0000-GENESIS-CONFIG-CHANNEL-SIH',
            type: 'CONFIG',
            function: 'CreateChannel',
            channelId: 'sihchannel',
            creatorMSP: 'OrdererMSP',
            creatorId: 'orderer1.sih26125.local',
            payload: {
                channel: 'sihchannel',
                consortium: 'DefenseSupplyConsortium',
                organizations: [
                    { mspId: 'BELMSP', name: 'Bharat Electronics Limited', role: 'Anchor & Lead Peer' },
                    { mspId: 'AuditorMSP', name: 'Defense Audit Authority', role: 'Endorsing Co-Signer & Auditor' },
                    { mspId: 'ContractorMSP', name: 'Authorized Defense Suppliers', role: 'Client Org' }
                ],
                consensus: 'etcdraft (3-Node Raft Cluster)',
                ordererNodes: [
                    'orderer1.sih26125.local:7050',
                    'orderer2.sih26125.local:7050',
                    'orderer3.sih26125.local:7050'
                ],
                batchSize: { maxMessageCount: 10, absoluteMaxBytes: '10 MB', preferredMaxBytes: '2 MB' },
                batchTimeout: '2.0s'
            },
            readWriteSet: {
                reads: [],
                writes: [
                    { key: 'CHANNEL_CONFIG_sihchannel', value: 'ACTIVE' },
                    { key: 'MSP_BELMSP', value: 'VERIFIED' },
                    { key: 'MSP_AuditorMSP', value: 'VERIFIED' },
                    { key: 'MSP_ContractorMSP', value: 'VERIFIED' }
                ]
            },
            endorsingPeers: ['orderer1.sih26125.local:7050 (OrdererMSP)'],
            validationCode: 'VALID'
        }
    ];

    const b0DataHash = sha256(b0Txs);
    const b0PrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const b0Hash = sha256(`0:${b0PrevHash}:${b0DataHash}:${b0Timestamp}`);

    blocks.push({
        blockNumber: 0,
        type: 'GENESIS_BLOCK',
        channel: 'sihchannel',
        timestamp: b0Timestamp,
        txCount: b0Txs.length,
        prevHash: b0PrevHash,
        dataHash: b0DataHash,
        blockHash: b0Hash,
        transactions: b0Txs
    });

    // -------------------------------------------------------------------------
    // BLOCK 1: CHAINCODE DEFINITION COMMIT (sih-contract v3.2)
    // -------------------------------------------------------------------------
    let prevHash = b0Hash;
    const b1Timestamp = '2026-09-15T12:05:00.000Z';
    const b1Txs = [
        {
            txId: 'TX-0001-LIFECYCLE-COMMIT-SIH-CONTRACT',
            type: 'CHAINCODE_LIFECYCLE',
            function: 'CommitChaincodeDefinition',
            channelId: 'sihchannel',
            creatorMSP: 'BELMSP',
            creatorId: 'admin@bel.sih26125.local',
            payload: {
                chaincode: 'sih-contract',
                version: '3.2',
                sequence: 1,
                endorsementPlugin: 'escc',
                validationPlugin: 'vscc',
                endorsementPolicy: 'MAJORITY(BELMSP, AuditorMSP, ContractorMSP)',
                methods: [
                    'RegisterIdentity', 'RevokeIdentity', 'GetIdentity',
                    'MintAsset', 'TransferAsset', 'GetAsset', 'UpdateAssetDocument',
                    'GrantAccess', 'CheckAccess', 'RevokeAccess', 'GetAssetHistory'
                ]
            },
            readWriteSet: {
                reads: [{ key: 'LIFECYCLE_NAMESPACES/sih-contract', version: '1.0' }],
                writes: [{ key: 'LIFECYCLE_NAMESPACES/sih-contract', value: 'sih-contract:3.2' }]
            },
            endorsingPeers: [
                'peer0.bel.sih26125.local:7051 (BELMSP)',
                'peer0.auditor.sih26125.local:8051 (AuditorMSP)'
            ],
            validationCode: 'VALID'
        }
    ];

    const b1DataHash = sha256(b1Txs);
    const b1Hash = sha256(`1:${prevHash}:${b1DataHash}:${b1Timestamp}`);

    blocks.push({
        blockNumber: 1,
        type: 'CONFIG_BLOCK',
        channel: 'sihchannel',
        timestamp: b1Timestamp,
        txCount: b1Txs.length,
        prevHash: prevHash,
        dataHash: b1DataHash,
        blockHash: b1Hash,
        transactions: b1Txs
    });
    prevHash = b1Hash;

    // -------------------------------------------------------------------------
    // BLOCKS 2..N: LOAD TRANSACTIONS FROM AUDIT LOGS, MINT PROPOSALS & GRANTS
    // -------------------------------------------------------------------------
    let txPool = [];

    // Pull events from audit_logs
    if (isDbConnected()) {
        try {
            const res = await query(`
                SELECT id, user_id AS "userId", organization, role, action,
                       resource_type AS "resourceType", resource_id AS "resourceId",
                       success, transaction_id AS "transactionId", message, timestamp
                FROM audit_logs
                WHERE success = true AND action NOT IN ('LOGIN_SUCCESS', 'LOGIN_FAILED')
                ORDER BY timestamp ASC
            `);
            txPool = res.rows;
        } catch (err) {
            console.warn('Blockchain controller DB fetch error:', err.message);
        }
    }

    if (txPool.length === 0) {
        txPool = getAuditLogs().filter(l => l.success && l.action !== 'LOGIN_SUCCESS');
    }

    // Default seeded events if empty
    if (txPool.length === 0) {
        txPool = [
            {
                id: 'AUD-SEED-1',
                action: 'IDENTITY_REGISTERED',
                userId: 'BEL001',
                organization: 'BEL',
                resourceType: 'identity',
                resourceId: 'BEL006',
                message: 'Identity BEL006 registered on Fabric',
                timestamp: '2026-09-16T14:50:58.141Z'
            },
            {
                id: 'AUD-SEED-2',
                action: 'MINT_APPROVED',
                userId: 'AUD001',
                organization: 'Auditor',
                resourceType: 'asset',
                resourceId: 'AST-20',
                message: 'Asset AST-20 minted on ledger',
                timestamp: '2026-09-16T20:38:46.001Z'
            },
            {
                id: 'AUD-SEED-3',
                action: 'ACCESS_GRANTED',
                userId: 'AUD001',
                organization: 'Auditor',
                resourceType: 'access',
                resourceId: 'BEL006::AST-20',
                message: 'Access granted to BEL006 for AST-20',
                timestamp: '2026-09-16T20:43:56.213Z'
            }
        ];
    }

    // Map each audit entry into a rich Fabric transaction
    const mappedTransactions = txPool.map((entry, idx) => {
        const txId = entry.transactionId && entry.transactionId.length > 10
            ? entry.transactionId
            : `TX-${sha256(entry.id || idx.toString()).substring(0, 32).toUpperCase()}`;

        let funcName = 'ExecuteTransaction';
        let rw = { reads: [], writes: [] };
        let payload = { resourceType: entry.resourceType, resourceId: entry.resourceId, details: entry.message };

        if (entry.action.includes('IDENTITY')) {
            funcName = 'RegisterIdentity';
            const identityId = entry.resourceId || entry.userId || 'ID-001';
            rw.writes.push({ key: `IDENTITY_${identityId}`, value: 'ACTIVE' });
            rw.writes.push({ key: `DID_did:chaincoder:${entry.organization || 'BEL'}:${identityId}`, value: identityId });
            payload = {
                identityId,
                name: entry.message?.split(' ')[1] || 'Registered User',
                organization: entry.organization || 'BEL',
                did: `did:chaincoder:${entry.organization || 'BEL'}:${identityId}`,
                cryptographicReference: `fabric-ca::${entry.organization || 'BEL'}MSP::${identityId}`
            };
        } else if (entry.action.includes('MINT') || entry.action.includes('ASSET')) {
            funcName = 'MintAsset';
            const assetId = entry.resourceId || 'AST-001';
            rw.writes.push({ key: `ASSET_${assetId}`, value: 'ACTIVE' });
            rw.writes.push({ key: `ASSET_HISTORY_${assetId}`, value: 'TX_RECORDED' });
            payload = {
                assetId,
                tokenStandard: 'CHAINCODER-DEFENSE-NFT',
                owner: entry.userId || 'BEL001',
                ownerOrganization: 'BEL',
                status: 'ACTIVE',
                hash: sha256(assetId).substring(0, 64),
                coApprovedBy: 'AUD001 (AuditorMSP)'
            };
        } else if (entry.action.includes('ACCESS')) {
            funcName = 'GrantAccess';
            const resId = entry.resourceId || 'ACC-001';
            rw.writes.push({ key: `ACCESS_${resId.replace('::', '_')}`, value: 'ACTIVE' });
            payload = {
                accessId: resId,
                permission: 'READ',
                status: 'ACTIVE',
                endorsedBy: ['BELMSP', 'AuditorMSP'],
                coApprovedAt: entry.timestamp
            };
        }

        const endorsers = entry.organization === 'Auditor' || entry.action.includes('APPROVED') || entry.action.includes('GRANTED')
            ? ['peer0.bel.sih26125.local:7051 (BELMSP)', 'peer0.auditor.sih26125.local:8051 (AuditorMSP)']
            : ['peer0.bel.sih26125.local:7051 (BELMSP)'];

        return {
            txId,
            type: 'ENDORSER_TRANSACTION',
            function: funcName,
            channelId: 'sihchannel',
            creatorMSP: `${entry.organization || 'BEL'}MSP`,
            creatorId: entry.userId || 'BEL001',
            payload,
            readWriteSet: rw,
            endorsingPeers: endorsers,
            validationCode: 'VALID',
            timestamp: entry.timestamp || new Date().toISOString()
        };
    });

    // Bundle transactions into blocks (1-2 txs per block)
    let currentBlockNumber = 2;
    for (let i = 0; i < mappedTransactions.length; i += 2) {
        const chunk = mappedTransactions.slice(i, i + 2);
        const bTimestamp = chunk[chunk.length - 1].timestamp;
        const bDataHash = sha256(chunk);
        const bHash = sha256(`${currentBlockNumber}:${prevHash}:${bDataHash}:${bTimestamp}`);

        blocks.push({
            blockNumber: currentBlockNumber,
            type: 'TRANSACTION_BLOCK',
            channel: 'sihchannel',
            timestamp: bTimestamp,
            txCount: chunk.length,
            prevHash: prevHash,
            dataHash: bDataHash,
            blockHash: bHash,
            transactions: chunk
        });

        prevHash = bHash;
        currentBlockNumber++;
    }

    // Append any simulated extra blocks created in this runtime
    for (const simBlock of simulatedExtraBlocks) {
        simBlock.blockNumber = currentBlockNumber;
        simBlock.prevHash = prevHash;
        simBlock.dataHash = sha256(simBlock.transactions);
        simBlock.blockHash = sha256(`${currentBlockNumber}:${prevHash}:${simBlock.dataHash}:${simBlock.timestamp}`);
        blocks.push(simBlock);
        prevHash = simBlock.blockHash;
        currentBlockNumber++;
    }

    return blocks;
}

/**
 * GET /api/public/blockchain/blocks
 */
async function getBlockchainBlocks(req, res) {
    try {
        const blocks = await buildBlockchain();

        const totalTransactions = blocks.reduce((acc, b) => acc + (b.txCount || 0), 0);
        const latestBlock = blocks[blocks.length - 1];

        return res.status(200).json({
            success: true,
            network: {
                channel: 'sihchannel',
                status: 'ONLINE',
                chaincodeVersion: '3.2',
                consensus: 'Raft (Crash Fault Tolerant)',
                orderer: 'orderer1.sih26125.local:7050',
                blockHeight: blocks.length,
                totalTransactions,
                latestBlockHash: latestBlock.blockHash,
                endorsingPeers: [
                    { id: 'peer0.bel', endpoint: 'localhost:7051', msp: 'BELMSP', role: 'Committer & Lead Endorser' },
                    { id: 'peer0.auditor', endpoint: 'localhost:8051', msp: 'AuditorMSP', role: 'Auditor & Co-Endorser' },
                    { id: 'peer0.contractor', endpoint: 'localhost:9051', msp: 'ContractorMSP', role: 'Supplier Client Peer' }
                ]
            },
            blocks
        });
    } catch (error) {
        console.error('getBlockchainBlocks error:', error);
        return res.status(500).json({
            success: false,
            message: 'Unable to build blockchain simulation',
            error: error.message
        });
    }
}

/**
 * POST /api/public/blockchain/simulate
 * Simulates a new defense ledger transaction block in real time
 */
async function simulateNewBlock(req, res) {
    try {
        const { functionType, assetId, identityId, actionDescription } = req.body || {};

        const now = new Date().toISOString();
        const randId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const txId = `SIM-TX-${Date.now()}-${randId}`;

        const simulatedTx = {
            txId,
            type: 'ENDORSER_TRANSACTION',
            function: functionType || 'TelemetryAuditSignature',
            channelId: 'sihchannel',
            creatorMSP: 'AuditorMSP',
            creatorId: 'AUD001',
            payload: {
                action: actionDescription || 'Automated Cryptographic State Verification & Co-Sign',
                targetAsset: assetId || `AST-SIM-${randId}`,
                targetIdentity: identityId || 'BEL006',
                cryptographicProof: sha256(now + txId),
                multiPartyEndorsement: {
                    belMspSignature: `0x${sha256('BEL' + txId).substring(0, 48)}...`,
                    auditorMspSignature: `0x${sha256('AUD' + txId).substring(0, 48)}...`
                },
                ledgerStatus: 'COMMITTED'
            },
            readWriteSet: {
                reads: [{ key: `ASSET_STATE_${assetId || 'AST-SIM'}`, version: '1.0' }],
                writes: [{ key: `DEFENSE_AUDIT_${Date.now()}`, value: 'VERIFIED_ACTIVE' }]
            },
            endorsingPeers: [
                'peer0.bel.sih26125.local:7051 (BELMSP)',
                'peer0.auditor.sih26125.local:8051 (AuditorMSP)'
            ],
            validationCode: 'VALID',
            timestamp: now
        };

        const newBlock = {
            type: 'SIMULATED_TRANSACTION_BLOCK',
            channel: 'sihchannel',
            timestamp: now,
            txCount: 1,
            transactions: [simulatedTx]
        };

        simulatedExtraBlocks.push(newBlock);

        // Rebuild chain with new block
        const blocks = await buildBlockchain();
        const createdBlock = blocks[blocks.length - 1];

        return res.status(201).json({
            success: true,
            message: `Block #${createdBlock.blockNumber} forged, endorsed, and committed to Hyperledger Fabric sihchannel`,
            block: createdBlock
        });
    } catch (error) {
        console.error('simulateNewBlock error:', error);
        return res.status(500).json({
            success: false,
            message: 'Unable to simulate block',
            error: error.message
        });
    }
}

async function getTransactionByTxId(req, res) {
    try {
        const { txId } = req.params;
        if (!txId) {
            return res.status(400).json({ success: false, message: 'Transaction ID is required' });
        }
        const txDetails = await fabricService.getTransactionDetails(txId, 'BEL');
        if (!txDetails || txDetails.status === 'UNAVAILABLE') {
            return res.status(404).json({
                success: false,
                message: 'Blockchain transaction details are currently unavailable for this record',
                txId
            });
        }
        return res.status(200).json({
            success: true,
            transaction: txDetails
        });
    } catch (error) {
        console.error('getTransactionByTxId error:', error);
        return res.status(500).json({
            success: false,
            message: 'Unable to query blockchain transaction details',
            error: error.message
        });
    }
}

module.exports = {
    getBlockchainBlocks,
    simulateNewBlock,
    getTransactionByTxId
};