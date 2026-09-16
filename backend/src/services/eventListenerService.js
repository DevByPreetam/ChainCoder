'use strict';

const { connectToFabric } = require('../config/fabric');
const { recordAuditLog } = require('./auditLogService');
const { createNotification } = require('./notificationService');
const { query, isDbConnected } = require('../config/db');

let isListening = false;
let stopRequested = false;

async function processChaincodeEvent(event) {
    try {
        const eventName = event.eventName;
        const rawPayload = Buffer.from(event.payload).toString('utf8');
        const payload = rawPayload ? JSON.parse(rawPayload) : {};
        const txId = event.transactionId || 'FABRIC-TX';

        console.log(`[Fabric Event] ${eventName} (Tx: ${txId}):`, payload);

        switch (eventName) {
            case 'IdentityRegistered':
                recordAuditLog({
                    action: 'IDENTITY_REGISTERED_EVENT',
                    userId: payload.identityId,
                    organization: payload.organization,
                    role: payload.role,
                    message: `Identity ${payload.identityId} (${payload.role}) registered on ledger`,
                    resourceId: payload.identityId,
                    resourceType: 'identity',
                    transactionId: txId,
                    success: true
                });
                break;

            case 'IdentityRevoked':
                recordAuditLog({
                    action: 'IDENTITY_REVOKED_EVENT',
                    userId: payload.identityId,
                    organization: payload.organization || 'BEL',
                    role: 'System',
                    message: `Identity ${payload.identityId} revoked on ledger`,
                    resourceId: payload.identityId,
                    resourceType: 'identity',
                    transactionId: txId,
                    success: true
                });

                if (isDbConnected()) {
                    try {
                        await query(
                            'UPDATE users SET status = $1, updated_at = NOW() WHERE user_id = $2',
                            ['REVOKED', payload.identityId]
                        );
                    } catch (dbErr) {
                        console.warn('Could not update user status in DB:', dbErr.message);
                    }
                }

                createNotification({
                    userId: payload.identityId,
                    title: 'Identity Revoked',
                    message: 'Your identity certificate and access has been revoked on the Fabric ledger',
                    type: 'WARNING'
                });
                break;

            case 'AssetMinted':
                recordAuditLog({
                    action: 'ASSET_MINTED_EVENT',
                    userId: payload.owner,
                    organization: 'BEL',
                    role: 'Admin',
                    message: `Asset ${payload.assetId} (${payload.name}) minted on ledger`,
                    resourceId: payload.assetId,
                    resourceType: 'asset',
                    transactionId: txId,
                    success: true
                });

                createNotification({
                    userId: payload.owner,
                    title: 'Asset Minted',
                    message: `Asset ${payload.assetId} (${payload.name}) has been minted and anchored to your identity`,
                    type: 'SUCCESS'
                });
                break;

            case 'AssetTransferred':
                recordAuditLog({
                    action: 'ASSET_TRANSFERRED_EVENT',
                    userId: payload.newOwner,
                    organization: 'BEL',
                    role: 'Manager',
                    message: `Asset ${payload.assetId} transferred from ${payload.previousOwner} to ${payload.newOwner}`,
                    resourceId: payload.assetId,
                    resourceType: 'asset',
                    transactionId: txId,
                    success: true
                });

                createNotification({
                    userId: payload.newOwner,
                    title: 'Asset Received',
                    message: `Asset ${payload.assetId} has been transferred to your ownership`,
                    type: 'INFO'
                });
                break;

            case 'AssetDocumentUpdated':
                recordAuditLog({
                    action: 'ASSET_DOCUMENT_UPDATED_EVENT',
                    userId: 'System',
                    organization: 'BEL',
                    role: 'Admin',
                    message: `Asset ${payload.assetId} document hash updated to ${payload.documentHash}`,
                    resourceId: payload.assetId,
                    resourceType: 'asset',
                    transactionId: txId,
                    success: true
                });
                break;

            case 'AccessGranted':
                recordAuditLog({
                    action: 'ACCESS_GRANTED_EVENT',
                    userId: payload.grantedTo,
                    organization: 'BEL',
                    role: 'Employee',
                    message: `Access ${payload.accessId} granted on asset ${payload.assetId} to ${payload.grantedTo}`,
                    resourceId: payload.assetId,
                    resourceType: 'access',
                    transactionId: txId,
                    success: true
                });

                createNotification({
                    userId: payload.grantedTo,
                    title: 'Access Granted',
                    message: `You have been granted ${payload.permission} access to asset ${payload.assetId}`,
                    type: 'SUCCESS'
                });
                break;

            case 'AccessRevoked':
                recordAuditLog({
                    action: 'ACCESS_REVOKED_EVENT',
                    userId: payload.identityId,
                    organization: 'BEL',
                    role: 'Employee',
                    message: `Access on asset ${payload.assetId} revoked for ${payload.identityId}`,
                    resourceId: payload.assetId,
                    resourceType: 'access',
                    transactionId: txId,
                    success: true
                });
                break;

            case 'TransactionEndorsed':
                recordAuditLog({
                    action: 'TRANSACTION_ENDORSED_EVENT',
                    userId: 'Auditor',
                    organization: payload.endorserMSP || 'AuditorMSP',
                    role: 'Auditor',
                    message: `Multi-party endorsement confirmed for ${payload.txType} on target ${payload.targetId}`,
                    resourceId: payload.targetId,
                    resourceType: 'transaction',
                    transactionId: txId,
                    success: true
                });
                break;

            default:
                console.log(`[Fabric Event] Unhandled event type: ${eventName}`);
        }
    } catch (err) {
        console.error('Error processing Fabric chaincode event:', err);
    }
}

async function startEventListener() {
    if (isListening) return;
    isListening = true;
    stopRequested = false;

    console.log('Starting Fabric chaincode event listener...');

    while (!stopRequested) {
        let connection = null;
        try {
            connection = connectToFabric('BEL');
            const events = await connection.network.getChaincodeEvents('sih-contract');
            console.log('✓ Fabric chaincode event stream established on sihchannel');

            for await (const event of events) {
                if (stopRequested) break;
                await processChaincodeEvent(event);
            }
        } catch (err) {
            if (stopRequested) break;
            console.warn('Fabric event listener disconnected, reconnecting in 5s:', err.message);
            await new Promise(r => setTimeout(r, 5000));
        } finally {
            if (connection) {
                try {
                    connection.gateway.close();
                    connection.client.close();
                } catch (_) {}
            }
        }
    }

    isListening = false;
}

function stopEventListener() {
    stopRequested = true;
}

module.exports = {
    startEventListener,
    stopEventListener,
    processChaincodeEvent
};
