'use strict';

const crypto = require('crypto');
const { AppError } = require('../utils/errors');
const { query, isDbConnected } = require('../config/db');

const requests = [];

// Load existing requests from PostgreSQL if available
async function loadRequestsFromDb() {
    if (!isDbConnected()) return;
    try {
        const res = await query(`
            SELECT 
                request_id AS "requestId",
                requester_id AS "requesterId",
                requester_name AS "requesterName",
                organization,
                identity_id AS "identityId",
                asset_id AS "assetId",
                permission,
                reason,
                status,
                approved_by AS "approvedBy",
                approved_at AS "approvedAt",
                auditor_approved_by AS "auditorApprovedBy",
                auditor_approved_at AS "auditorApprovedAt",
                rejected_by AS "rejectedBy",
                rejection_reason AS "rejectionReason",
                rejected_at AS "rejectedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM access_requests
            ORDER BY created_at DESC
        `);

        for (const row of res.rows) {
            const idx = requests.findIndex(r => r.requestId === row.requestId);
            if (idx >= 0) {
                requests[idx] = row;
            } else {
                requests.push(row);
            }
        }
    } catch (err) {
        console.warn('Failed to load access requests from DB:', err.message);
    }
}

// Attempt initial load on next tick
setTimeout(loadRequestsFromDb, 1500);

async function createAccessRequest({
    requesterId,
    requesterName,
    organization,
    identityId,
    assetId,
    permission,
    reason
}) {
    if (
        !requesterId ||
        !organization ||
        !identityId ||
        !assetId ||
        !permission
    ) {
        throw new AppError(
            'requesterId, organization, identityId, assetId and permission are required',
            400,
            'BAD_REQUEST'
        );
    }

    if (organization !== 'Contractor' && organization !== 'BEL') {
        throw new AppError(
            'Only Contractor or BEL users can create access requests',
            403,
            'FORBIDDEN'
        );
    }

    const allowedPermissions = ['READ', 'WRITE', 'READ_WRITE', 'ADMIN'];

    if (!allowedPermissions.includes(permission)) {
        throw new AppError(
            'Invalid permission. Use READ, WRITE, READ_WRITE, or ADMIN',
            400,
            'BAD_REQUEST'
        );
    }

    const existingRequest = requests.find(
        (request) =>
            request.requesterId === requesterId &&
            request.assetId === assetId &&
            request.permission === permission &&
            (request.status === 'PENDING' || request.status === 'BEL_APPROVED')
    );

    if (existingRequest) {
        throw new AppError(
            'A pending request already exists for this asset',
            409,
            'CONFLICT'
        );
    }

    const now = new Date().toISOString();
    const request = {
        requestId: `REQ-${crypto.randomUUID()}`,
        requesterId,
        requesterName: requesterName || null,
        organization,
        identityId,
        assetId,
        permission,
        reason: reason || null,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now
    };

    requests.push(request);

    if (isDbConnected()) {
        try {
            await query(
                `INSERT INTO access_requests (
                    request_id, requester_id, requester_name, organization, identity_id,
                    asset_id, permission, reason, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    request.requestId,
                    request.requesterId,
                    request.requesterName,
                    request.organization,
                    request.identityId,
                    request.assetId,
                    request.permission,
                    request.reason,
                    request.status,
                    request.createdAt,
                    request.updatedAt
                ]
            );
        } catch (err) {
            console.error('Failed to persist access request to DB:', err.message);
        }
    }

    return request;
}

async function getRequests(filters = {}) {
    if (isDbConnected()) {
        try {
            let sql = `
                SELECT 
                    request_id AS "requestId",
                    requester_id AS "requesterId",
                    requester_name AS "requesterName",
                    organization,
                    identity_id AS "identityId",
                    asset_id AS "assetId",
                    permission,
                    reason,
                    status,
                    approved_by AS "approvedBy",
                    approved_at AS "approvedAt",
                    auditor_approved_by AS "auditorApprovedBy",
                    auditor_approved_at AS "auditorApprovedAt",
                    rejected_by AS "rejectedBy",
                    rejection_reason AS "rejectionReason",
                    rejected_at AS "rejectedAt",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                FROM access_requests
            `;
            const conditions = [];
            const params = [];

            if (filters.status) {
                params.push(filters.status);
                conditions.push(`status = $${params.length}`);
            }
            if (filters.requesterId) {
                params.push(filters.requesterId);
                conditions.push(`requester_id = $${params.length}`);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }
            sql += ' ORDER BY created_at DESC';

            const res = await query(sql, params);
            for (const row of res.rows) {
                const idx = requests.findIndex(r => r.requestId === row.requestId);
                if (idx >= 0) requests[idx] = row;
                else requests.push(row);
            }
            return res.rows;
        } catch (err) {
            console.warn('Failed to fetch requests from DB:', err.message);
        }
    }

    return requests.filter((request) => {
        if (filters.status && request.status !== filters.status) {
            return false;
        }

        if (filters.requesterId && request.requesterId !== filters.requesterId) {
            return false;
        }

        return true;
    });
}

async function getPendingRequests() {
    return getRequests({ status: 'PENDING' });
}

async function getRequestById(requestId) {
    if (isDbConnected()) {
        try {
            const res = await query(`
                SELECT 
                    request_id AS "requestId",
                    requester_id AS "requesterId",
                    requester_name AS "requesterName",
                    organization,
                    identity_id AS "identityId",
                    asset_id AS "assetId",
                    permission,
                    reason,
                    status,
                    approved_by AS "approvedBy",
                    approved_at AS "approvedAt",
                    auditor_approved_by AS "auditorApprovedBy",
                    auditor_approved_at AS "auditorApprovedAt",
                    rejected_by AS "rejectedBy",
                    rejection_reason AS "rejectionReason",
                    rejected_at AS "rejectedAt",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                FROM access_requests
                WHERE request_id = $1
            `, [requestId]);
            if (res.rows && res.rows.length > 0) {
                const idx = requests.findIndex(r => r.requestId === requestId);
                if (idx >= 0) {
                    requests[idx] = res.rows[0];
                } else {
                    requests.push(res.rows[0]);
                }
                return res.rows[0];
            }
        } catch (err) {
            console.warn('Failed to fetch request from DB:', err.message);
        }
    }
    return requests.find(
        (request) => request.requestId === requestId
    );
}

function assertNotSelfAction(request, actorId, action) {
    if (request.requesterId === actorId) {
        throw new AppError(
            `You cannot ${action} your own access request`,
            403,
            'FORBIDDEN'
        );
    }
}

async function approveRequest(requestId, approvedBy) {
    const request = requests.find(
        (item) => item.requestId === requestId
    );

    if (!request) {
        throw new AppError('Access request not found', 404, 'NOT_FOUND');
    }

    assertNotSelfAction(request, approvedBy, 'approve');

    if (request.status !== 'PENDING') {
        throw new AppError(
            `Request cannot be approved because its status is ${request.status}`,
            409,
            'CONFLICT'
        );
    }

    const now = new Date().toISOString();
    request.status = 'BEL_APPROVED';
    request.approvedBy = approvedBy;
    request.approvedAt = now;
    request.updatedAt = now;

    if (isDbConnected()) {
        try {
            await query(
                `UPDATE access_requests 
                 SET status = $1, approved_by = $2, approved_at = $3, updated_at = $4 
                 WHERE request_id = $5`,
                [request.status, request.approvedBy, request.approvedAt, request.updatedAt, requestId]
            );
        } catch (err) {
            console.error('Failed to update access request in DB:', err.message);
        }
    }

    return request;
}

async function rejectRequest(requestId, rejectedBy, reason) {
    const request = requests.find(
        (item) => item.requestId === requestId
    );

    if (!request) {
        throw new AppError('Access request not found', 404, 'NOT_FOUND');
    }

    assertNotSelfAction(request, rejectedBy, 'reject');

    if (request.status !== 'PENDING' && request.status !== 'BEL_APPROVED') {
        throw new AppError(
            `Request cannot be rejected because its status is ${request.status}`,
            409,
            'CONFLICT'
        );
    }

    const now = new Date().toISOString();
    request.status = 'REJECTED';
    request.rejectedBy = rejectedBy;
    request.rejectionReason = reason || null;
    request.rejectedAt = now;
    request.updatedAt = now;

    if (isDbConnected()) {
        try {
            await query(
                `UPDATE access_requests 
                 SET status = $1, rejected_by = $2, rejection_reason = $3, rejected_at = $4, updated_at = $5 
                 WHERE request_id = $6`,
                [request.status, request.rejectedBy, request.rejectionReason, request.rejectedAt, request.updatedAt, requestId]
            );
        } catch (err) {
            console.error('Failed to update access request in DB:', err.message);
        }
    }

    return request;
}

async function auditorApproveRequest(requestId, auditorId) {
    const request = requests.find(
        (item) => item.requestId === requestId
    );

    if (!request) {
        throw new AppError('Access request not found', 404, 'NOT_FOUND');
    }

    assertNotSelfAction(request, auditorId, 'approve');

    if (request.status !== 'BEL_APPROVED') {
        throw new AppError(
            `Request must be BEL_APPROVED before Auditor approval. Current status: ${request.status}`,
            409,
            'CONFLICT'
        );
    }

    const now = new Date().toISOString();
    request.status = 'ACTIVE';
    request.auditorApprovedBy = auditorId;
    request.auditorApprovedAt = now;
    request.updatedAt = now;

    if (isDbConnected()) {
        try {
            await query(
                `UPDATE access_requests 
                 SET status = $1, auditor_approved_by = $2, auditor_approved_at = $3, updated_at = $4 
                 WHERE request_id = $5`,
                [request.status, request.auditorApprovedBy, request.auditorApprovedAt, request.updatedAt, requestId]
            );
        } catch (err) {
            console.error('Failed to update access request in DB:', err.message);
        }
    }

    return request;
}

async function getRequestsByRequester(requesterId) {
    if (!requesterId) {
        return [];
    }

    return getRequests({ requesterId });
}

async function createAdminGrantProposal({
    accessId,
    identityId,
    assetId,
    grantedTo,
    permission,
    adminUserId,
    adminUserName
}) {
    if (!identityId || !assetId || !permission) {
        throw new AppError(
            'identityId, assetId and permission are required',
            400,
            'BAD_REQUEST'
        );
    }

    const requestId = accessId || `ACC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const requesterId = grantedTo || identityId;
    const organization = identityId.startsWith('CON') ? 'Contractor' : 'BEL';
    const now = new Date().toISOString();

    const existingRequest = requests.find(
        (request) =>
            request.identityId === identityId &&
            request.assetId === assetId &&
            request.permission === permission &&
            (request.status === 'PENDING' || request.status === 'BEL_APPROVED')
    );

    if (existingRequest) {
        throw new AppError(
            `An access proposal (${existingRequest.requestId}) for this asset is already awaiting Auditor co-approval`,
            409,
            'CONFLICT'
        );
    }

    const request = {
        requestId,
        requesterId,
        requesterName: adminUserName || requesterId,
        organization,
        identityId,
        assetId,
        permission,
        reason: `Administrative grant by BEL Admin (${adminUserId})`,
        status: 'BEL_APPROVED',
        approvedBy: adminUserId,
        approvedAt: now,
        auditorApprovedBy: null,
        auditorApprovedAt: null,
        rejectedBy: null,
        rejectionReason: null,
        rejectedAt: null,
        createdAt: now,
        updatedAt: now
    };

    requests.push(request);

    if (isDbConnected()) {
        try {
            await query(
                `INSERT INTO access_requests (
                    request_id, requester_id, requester_name, organization, identity_id,
                    asset_id, permission, reason, status, approved_by, approved_at,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BEL_APPROVED', $9, $10, $10, $10)
                ON CONFLICT (request_id) DO UPDATE SET
                    status = 'BEL_APPROVED',
                    approved_by = EXCLUDED.approved_by,
                    approved_at = EXCLUDED.approved_at,
                    updated_at = EXCLUDED.updated_at`,
                [
                    requestId,
                    requesterId,
                    request.requesterName,
                    organization,
                    identityId,
                    assetId,
                    permission,
                    request.reason,
                    adminUserId,
                    now
                ]
            );
        } catch (err) {
            console.error('Failed to persist admin grant proposal to DB:', err.message);
        }
    }

    return request;
}

module.exports = {
    createAccessRequest,
    createAdminGrantProposal,
    getRequests,
    getPendingRequests,
    getRequestById,
    getRequestsByRequester,
    approveRequest,
    rejectRequest,
    auditorApproveRequest,
    loadRequestsFromDb
};

