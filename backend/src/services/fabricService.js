'use strict';

const { connectToFabric } = require('../config/fabric');
const { isChaincodeFunctionMissing } = require('../utils/errors');

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

async function submitTransaction(organization, functionName, ...args) {
    return withContract(organization, async (contract) => {
        try {
            const result = await contract.submitTransaction(functionName, ...args);
            const parsed = parseResult(result);
            console.log(`${functionName} result:`, parsed);
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

async function submitTransactionWithOptions(organization, functionName, options) {
    return withContract(organization, async (contract) => {
        try {
            const result = await contract.submit(functionName, options);
            const parsed = parseResult(result);
            console.log(`${functionName} result:`, parsed);
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
    endorseTransaction
};
