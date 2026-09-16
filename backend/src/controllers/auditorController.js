'use strict';

const { getIdentity } = require('../services/fabricService');
const { getAsset, getAssetHistory } = require('../services/assetService');
const { checkAccess } = require('../services/accessService');
const { getRequests } = require('../services/accessRequestService');
const {
    getAuditLogs,
    getKnownIdentityIds,
    getKnownAssetIds,
    getKnownAccessKeys,
    toCsv
} = require('../services/auditLogService');
const { handleControllerError, sendSuccess } = require('../utils/errors');

function stripSensitive(record) {
    if (!record || typeof record !== 'object') {
        return record;
    }

    const clone = { ...record };
    delete clone.password;
    delete clone.passwordHash;
    delete clone.privateKey;
    delete clone.token;
    delete clone.kyc;
    return clone;
}

async function fetchAuditorIdentity(req, res) {
    try {
        const { identityId } = req.params;

        if (!identityId) {
            return res.status(400).json({
                success: false,
                message: 'identityId is required',
                errorCode: 'BAD_REQUEST'
            });
        }

        const identity = await getIdentity(identityId);
        return sendSuccess(res, { identity: stripSensitive(identity) });
    } catch (error) {
        console.error('Auditor identity lookup error:', error);
        return handleControllerError(res, error, 'Unable to fetch identity');
    }
}

async function listAuditIdentities(req, res) {
    try {
        const ids = getKnownIdentityIds();
        const identities = [];

        for (const identityId of ids) {
            try {
                identities.push(stripSensitive(await getIdentity(identityId)));
            } catch (error) {
                identities.push({
                    identityId,
                    error: 'Unable to load from Fabric'
                });
            }
        }

        return sendSuccess(res, {
            identities,
            events: getAuditLogs({ resourceType: 'identity' })
        });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to list identities');
    }
}

async function listAuditAccess(req, res) {
    try {
        const keys = getKnownAccessKeys();
        const access = [];

        for (const item of keys) {
            try {
                access.push(await checkAccess(item.identityId, item.assetId));
            } catch (error) {
                access.push({
                    identityId: item.identityId,
                    assetId: item.assetId,
                    error: 'Unable to load from Fabric'
                });
            }
        }

        return sendSuccess(res, {
            access,
            events: getAuditLogs({ resourceType: 'access' })
        });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to list access records');
    }
}

async function listAuditAssets(req, res) {
    try {
        const ids = getKnownAssetIds();
        const assets = [];

        for (const assetId of ids) {
            try {
                const asset = await getAsset(assetId, 'BEL');
                assets.push({
                    assetId: asset.assetId,
                    name: asset.name,
                    assetType: asset.assetType,
                    status: asset.status,
                    owner: asset.owner,
                    documentHash: asset.documentHash,
                    documentCID: asset.documentCID,
                    createdAt: asset.createdAt,
                    updatedAt: asset.updatedAt
                });
            } catch (error) {
                assets.push({
                    assetId,
                    error: 'Unable to load from Fabric'
                });
            }
        }

        return sendSuccess(res, {
            assets,
            events: getAuditLogs({ resourceType: 'asset' })
        });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to list assets');
    }
}

async function listAuditAccessRequests(req, res) {
    try {
        const requests = await getRequests();
        return sendSuccess(res, {
            requests,
            events: getAuditLogs({ resourceType: 'accessRequest' })
        });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to list access requests');
    }
}

async function listAuditTransactions(req, res) {
    try {
        return sendSuccess(res, {
            transactions: getAuditLogs()
        });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to list transactions');
    }
}

async function exportAuditLog(req, res) {
    try {
        const logs = getAuditLogs();
        const csv = toCsv(logs);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="chaincoder-audit.csv"');
        return res.status(200).send(csv);
    } catch (error) {
        return handleControllerError(res, error, 'Unable to export audit log');
    }
}

async function fetchAuditorAssetHistory(req, res) {
    try {
        const { assetId } = req.params;
        const history = await getAssetHistory(assetId, 'BEL');
        return sendSuccess(res, { assetId, history });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to fetch asset history');
    }
}

let cachedBlockchainActivities = null;
let lastActivitiesCacheTime = 0;
const CACHE_TTL_MS = 10000;

async function getRecentBlockchainActivities() {
    const now = Date.now();
    if (cachedBlockchainActivities && now - lastActivitiesCacheTime < CACHE_TTL_MS) {
        return cachedBlockchainActivities;
    }

    const defaultAssets = [
        'AST-FINAL-AUDIT-01',
        'AST-NFT-99',
        'AST-001',
        'AST-002',
        'ASSET001',
        'ASSET002',
        'ASSET003'
    ];

    const knownIds = getKnownAssetIds();
    const allAssetIds = Array.from(new Set([...defaultAssets, ...knownIds]));
    const events = [];

    for (const astId of allAssetIds) {
        try {
            const history = await getAssetHistory(astId, 'BEL');
            if (Array.isArray(history) && history.length > 0) {
                for (let i = history.length - 1; i >= 0; i--) {
                    const rec = history[i];
                    const val = rec.value || {};
                    let action = 'Asset Transaction';
                    let resource = astId;

                    if (i === history.length - 1) {
                        action = val.tokenStandard ? 'NFT Minted' : 'Asset Minted';
                        resource = val.name ? `${val.name} (${astId})` : astId;
                    } else {
                        const prev = history[i + 1]?.value || {};
                        if (val.owner && prev.owner && val.owner !== prev.owner) {
                            action = 'Asset Transferred';
                            resource = `${astId} ➔ ${val.owner}`;
                        } else if (val.documentCID && val.documentCID !== prev.documentCID) {
                            action = 'Document Stored (IPFS)';
                            resource = astId;
                        } else {
                            action = 'Asset Updated';
                            resource = astId;
                        }
                    }

                    events.push({
                        id: rec.txId || `tx-${astId}-${i}`,
                        action,
                        resource,
                        status: val.status === 'ACTIVE' ? 'SUCCESS' : (val.status || 'SUCCESS'),
                        timestamp: rec.timestamp || new Date().toISOString(),
                        txId: rec.txId || null,
                        actor: val.owner || 'BEL',
                        organization: val.ownerOrganization || 'BEL',
                        type: 'BLOCKCHAIN'
                    });
                }
            }
        } catch (_) {
            // Silently ignore individual asset errors
        }
    }

    cachedBlockchainActivities = events;
    lastActivitiesCacheTime = now;
    return events;
}

async function fetchRecentActivities(req, res) {
    try {
        const blockchainEvents = await getRecentBlockchainActivities();
        const auditLogs = getAuditLogs();

        const sessionEvents = auditLogs.map((log) => ({
            id: log.id,
            action: log.action === 'LOGIN' ? 'Identity Login' : (log.action ? log.action.replace(/_/g, ' ') : 'Activity Logged'),
            resource: log.resourceId || log.resourceType || 'System',
            status: log.success ? 'SUCCESS' : 'FAILED',
            timestamp: log.timestamp,
            txId: log.transactionId || null,
            actor: log.userId || log.organization,
            organization: log.organization,
            type: 'AUDIT'
        }));

        const combined = [...sessionEvents, ...blockchainEvents];

        const seenTx = new Set();
        const uniqueEvents = [];
        for (const ev of combined) {
            if (ev.txId) {
                if (seenTx.has(ev.txId)) {
                    continue;
                }
                seenTx.add(ev.txId);
            }
            uniqueEvents.push(ev);
        }

        uniqueEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const activities = uniqueEvents.slice(0, 15);
        return sendSuccess(res, { activities });
    } catch (error) {
        console.error('Fetch recent activities error:', error);
        return handleControllerError(res, error, 'Unable to fetch recent activities');
    }
}

module.exports = {
    fetchAuditorIdentity,
    listAuditIdentities,
    listAuditAccess,
    listAuditAssets,
    listAuditAccessRequests,
    listAuditTransactions,
    exportAuditLog,
    fetchAuditorAssetHistory,
    fetchRecentActivities
};
