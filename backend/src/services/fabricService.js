'use strict';

const { common, peer, msp } = require('@hyperledger/fabric-protos');
const { connectToFabric } = require('../config/fabric');
const { isChaincodeFunctionMissing } = require('../utils/errors');

const StatusNames = {
    0: 'VALID',
    1: 'NIL_ENVELOPE',
    2: 'BAD_PAYLOAD',
    3: 'BAD_COMMON_HEADER',
    4: 'BAD_CREATOR_SIGNATURE',
    5: 'INVALID_ENDORSER_TRANSACTION',
    6: 'INVALID_CONFIG_TRANSACTION',
    7: 'UNSUPPORTED_TX_PAYLOAD',
    8: 'BAD_PROPOSAL_TXID',
    9: 'DUPLICATE_TXID',
    10: 'ENDORSEMENT_POLICY_FAILURE',
    11: 'MVCC_READ_CONFLICT',
    12: 'PHANTOM_READ_CONFLICT',
    13: 'UNKNOWN_TX_TYPE',
    14: 'TARGET_CHAIN_NOT_FOUND',
    15: 'MARSHAL_TX_ERROR',
    16: 'NIL_TXACTION',
    17: 'EXPIRED_CHAINCODE',
    18: 'CHAINCODE_VERSION_CONFLICT',
    19: 'BAD_HEADER_EXTENSION',
    20: 'BAD_CHANNEL_HEADER',
    21: 'BAD_RESPONSE_PAYLOAD',
    22: 'BAD_RWSET',
    23: 'ILLEGAL_WRITESET',
    24: 'INVALID_WRITESET',
    25: 'INVALID_CHAINCODE',
    254: 'NOT_VALIDATED',
    255: 'INVALID_OTHER_REASON'
};

const txDetailsCache = new Map();

async function withContract(organization, callback) {
    let connection;

    try {
        connection = connectToFabric(organization || 'BEL');
        return await callback(connection.contract);
    } finally {
        if (connection) {
            connection.gateway.close();
            connection.client.close();
        }
    }
}

function parseResult(result) {
    const rawResult = Buffer.from(result).toString('utf8');

    if (!rawResult) {
        return null;
    }

    return JSON.parse(rawResult);
}

async function submitTransactionWithOptions(organization, functionName, options) {
    return withContract(organization, async (contract) => {
        try {
            const commit = await contract.submitAsync(functionName, options);
            const rawResult = commit.getResult();
            const txId = commit.getTransactionId();
            const status = await commit.getStatus();
            const parsed = parseResult(rawResult);
            console.log(`${functionName} result:`, parsed);

            const validationStatus = StatusNames[status.code] || (status.successful ? 'VALID' : 'INVALID');
            const blockNum = Number(status.blockNumber);

            if (parsed && typeof parsed === 'object') {
                parsed.txId = txId;
                parsed.transactionId = txId;
                parsed.blockNumber = blockNum;
                parsed.validationStatus = validationStatus;
            }

            if (txId) {
                txDetailsCache.set(txId, {
                    transactionId: txId,
                    blockNumber: blockNum,
                    status: validationStatus,
                    validationCode: status.code,
                    channelId: process.env.FABRIC_CHANNEL || 'sihchannel',
                    chaincode: process.env.FABRIC_CHAINCODE || 'sih-contract',
                    function: functionName,
                    creatorMSP: `${organization || 'BEL'}MSP`,
                    timestamp: new Date().toISOString()
                });
            }

            return parsed;
        } catch (error) {
            if (functionName === 'UpdateAssetDocument' && isChaincodeFunctionMissing(error)) {
                const unavailable = new Error(
                    'UpdateAssetDocument is not available on the deployed chaincode'
                );
                unavailable.code = 'CHAINCODE_FUNCTION_UNAVAILABLE';
                unavailable.cause = error;
                throw unavailable;
            }

            throw error;
        }
    });
}

async function submitTransaction(organization, functionName, ...args) {
    return submitTransactionWithOptions(organization, functionName, {
        arguments: args
    });
}

async function getTransactionDetails(txId, organization = 'BEL') {
    if (!txId || txId === '—' || typeof txId !== 'string') {
        return null;
    }

    if (txDetailsCache.has(txId)) {
        return txDetailsCache.get(txId);
    }

    let connection;
    try {
        connection = connectToFabric(organization || 'BEL');
        const channelId = process.env.FABRIC_CHANNEL || 'sihchannel';
        const qscc = connection.network.getContract('qscc');

        let blockNumber = null;
        let dataHash = null;
        let previousHash = null;

        try {
            const blockBytes = await qscc.evaluateTransaction('GetBlockByTxID', channelId, txId);
            if (blockBytes && blockBytes.length > 0) {
                const block = common.Block.deserializeBinary(blockBytes);
                const header = block.getHeader();
                blockNumber = Number(header.getNumber());
                dataHash = Buffer.from(header.getDataHash()).toString('hex');
                previousHash = Buffer.from(header.getPreviousHash()).toString('hex');
            }
        } catch (bErr) {
            console.warn(`[Fabric QSCC] GetBlockByTxID warning for ${txId}:`, bErr.message);
        }

        let validationCode = 0;
        let status = 'VALID';
        let channelName = channelId;
        let chaincodeName = process.env.FABRIC_CHAINCODE || 'sih-contract';
        let functionName = null;
        let args = [];
        let creatorMSP = `${organization || 'BEL'}MSP`;
        let endorsingMSPs = [];
        let timestamp = null;

        try {
            const procTxBytes = await qscc.evaluateTransaction('GetTransactionByID', channelId, txId);
            if (procTxBytes && procTxBytes.length > 0) {
                const procTx = peer.ProcessedTransaction.deserializeBinary(procTxBytes);
                validationCode = procTx.getValidationcode();
                status = StatusNames[validationCode] || (validationCode === 0 ? 'VALID' : 'INVALID');

                const env = procTx.getTransactionenvelope();
                const payload = common.Payload.deserializeBinary(env.getPayload());
                const chHeader = common.ChannelHeader.deserializeBinary(payload.getHeader().getChannelHeader());
                channelName = chHeader.getChannelId() || channelId;

                if (chHeader.getTimestamp()) {
                    timestamp = new Date(chHeader.getTimestamp().getSeconds() * 1000).toISOString();
                }

                try {
                    const sigHeader = common.SignatureHeader.deserializeBinary(payload.getHeader().getSignatureHeader());
                    const creator = msp.SerializedIdentity.deserializeBinary(sigHeader.getCreator());
                    creatorMSP = creator.getMspid() || creatorMSP;
                } catch (_) {}

                if (chHeader.getType() === 3) { // ENDORSER_TRANSACTION
                    const tx = peer.Transaction.deserializeBinary(payload.getData());
                    const actions = tx.getActionsList();
                    if (actions.length > 0) {
                        const ccActPayload = peer.ChaincodeActionPayload.deserializeBinary(actions[0].getPayload());
                        const propPayload = peer.ChaincodeProposalPayload.deserializeBinary(ccActPayload.getChaincodeProposalPayload());
                        const cis = peer.ChaincodeInvocationSpec.deserializeBinary(propPayload.getInput());
                        const cSpec = cis.getChaincodeSpec();
                        if (cSpec.getChaincodeId() && cSpec.getChaincodeId().getName()) {
                            chaincodeName = cSpec.getChaincodeId().getName();
                        }
                        const input = cSpec.getInput();
                        const rawArgs = input.getArgsList().map(b => Buffer.from(b).toString('utf8'));
                        functionName = rawArgs[0] || null;
                        args = rawArgs.slice(1);

                        const endorsedAction = ccActPayload.getAction();
                        if (endorsedAction) {
                            endorsingMSPs = endorsedAction.getEndorsementsList().map(e => {
                                try {
                                    const endorserId = msp.SerializedIdentity.deserializeBinary(e.getEndorser());
                                    return endorserId.getMspid();
                                } catch (_) {
                                    return null;
                                }
                            }).filter(Boolean);
                        }
                    }
                }
            }
        } catch (txErr) {
            console.warn(`[Fabric QSCC] GetTransactionByID warning for ${txId}:`, txErr.message);
        }

        const details = {
            transactionId: txId,
            blockNumber,
            status,
            validationCode,
            channelId: channelName,
            chaincode: chaincodeName,
            function: functionName,
            args,
            creatorMSP,
            endorsingMSPs,
            dataHash,
            previousHash,
            timestamp: timestamp || new Date().toISOString()
        };

        if (blockNumber !== null) {
            txDetailsCache.set(txId, details);
        }

        return details;
    } catch (error) {
        console.error(`Error querying transaction details for ${txId}:`, error.message);
        return {
            transactionId: txId,
            status: 'UNAVAILABLE',
            message: 'Blockchain transaction details are currently unavailable for this record'
        };
    } finally {
        if (connection) {
            connection.gateway.close();
            connection.client.close();
        }
    }
}

async function evaluateTransaction(organization, functionName, ...args) {
    return withContract(organization, async (contract) => {
        try {
            const result = await contract.evaluateTransaction(functionName, ...args);
            const parsed = parseResult(result);
            console.log(`${functionName} result:`, parsed);
            return parsed;
        } catch (error) {
            if (isChaincodeFunctionMissing(error)) {
                const unavailable = new Error(
                    `${functionName} is not available on the deployed chaincode`
                );
                unavailable.code = 'CHAINCODE_FUNCTION_UNAVAILABLE';
                unavailable.cause = error;
                throw unavailable;
            }

            throw error;
        }
    });
}

async function registerIdentity(
    organization,
    identityId,
    name,
    identityOrganization,
    role
) {
    return submitTransaction(
        organization,
        'RegisterIdentity',
        identityId,
        name,
        identityOrganization,
        role
    );
}

async function getIdentity(identityId, organization = 'BEL') {
    return evaluateTransaction(organization, 'GetIdentity', identityId);
}

async function revokeIdentity(identityId, organization = 'BEL') {
    return submitTransactionWithOptions(
        organization,
        'RevokeIdentity',
        {
            arguments: [identityId],
            endorsingOrganizations: ['BELMSP', 'AuditorMSP']
        }
    );
}

async function grantAccess(
    organization,
    accessId,
    identityId,
    assetId,
    grantedTo,
    permission
) {
    return submitTransactionWithOptions(
        organization,
        'GrantAccess',
        {
            arguments: [
                accessId,
                identityId,
                assetId,
                grantedTo,
                permission
            ],
            endorsingOrganizations: ['BELMSP', 'AuditorMSP']
        }
    );
}

async function checkAccess(identityId, assetId, organization = 'BEL') {
    return evaluateTransaction(organization, 'CheckAccess', identityId, assetId);
}

async function revokeAccess(identityId, assetId, organization = 'BEL') {
    return submitTransaction(organization, 'RevokeAccess', identityId, assetId);
}

async function mintAsset(
    organization,
    assetId,
    name,
    assetType,
    owner,
    documentHash,
    documentCID
) {
    return submitTransactionWithOptions(
        organization,
        'MintAsset',
        {
            arguments: [
                assetId,
                name,
                assetType,
                owner,
                documentHash || '',
                documentCID || ''
            ],
            endorsingOrganizations: ['BELMSP', 'AuditorMSP']
        }
    );
}

async function getAsset(assetId, organization = 'BEL') {
    return evaluateTransaction(organization, 'GetAsset', assetId);
}

async function transferAsset(assetId, newOwner, organization = 'BEL') {
    return submitTransaction(organization, 'TransferAsset', assetId, newOwner);
}

async function updateAssetDocument(assetId, documentHash, documentCID, organization = 'BEL') {
    return submitTransaction(
        organization,
        'UpdateAssetDocument',
        assetId,
        documentHash,
        documentCID
    );
}

async function getAssetHistory(assetId, organization = 'BEL') {
    return evaluateTransaction(organization, 'GetAssetHistory', assetId);
}

async function resolveDID(did, organization = 'BEL') {
    return evaluateTransaction(organization, 'ResolveDID', did);
}

async function verifyDID(did, organization = 'BEL') {
    return evaluateTransaction(organization, 'VerifyDID', did);
}

async function putIdentityKycDetails(organization, identityId, kycData) {
    const payload = typeof kycData === 'string' ? kycData : JSON.stringify(kycData);
    return submitTransaction(organization || 'BEL', 'PutIdentityKycDetails', identityId, payload);
}

async function getIdentityKycDetails(identityId, organization = 'BEL') {
    return evaluateTransaction(organization, 'GetIdentityKycDetails', identityId);
}

async function putAssetPrivateDetails(organization, assetId, details) {
    const payload = typeof details === 'string' ? details : JSON.stringify(details);
    return submitTransaction(organization || 'BEL', 'PutAssetPrivateDetails', assetId, payload);
}

async function getAssetPrivateDetails(assetId, organization = 'BEL') {
    return evaluateTransaction(organization, 'GetAssetPrivateDetails', assetId);
}

async function endorseTransaction(organization, txType, targetId) {
    return submitTransaction(organization || 'Auditor', 'EndorseTransaction', txType, targetId);
}

module.exports = {
    registerIdentity,
    getIdentity,
    revokeIdentity,
    grantAccess,
    checkAccess,
    revokeAccess,
    mintAsset,
    getAsset,
    transferAsset,
    updateAssetDocument,
    getAssetHistory,
    resolveDID,
    verifyDID,
    putIdentityKycDetails,
    getIdentityKycDetails,
    putAssetPrivateDetails,
    getAssetPrivateDetails,
    endorseTransaction,
    getTransactionDetails
};
