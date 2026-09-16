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
            if (!requests.some(r => r.requestId === row.requestId)) {
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

    if (organization !== 'Contractor') {
        throw new AppError(
            'Only Contractor users can create access requests',
            403,
            'FORBIDDEN'
        );
    }

    const allowedPermissions = ['READ', 'WRITE'];

    if (!allowedPermissions.includes(permission)) {
        throw new AppError(
            'Invalid permission. Use READ or WRITE',
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

function getRequests(filters = {}) {
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

function getPendingRequests() {
    return getRequests({ status: 'PENDING' });
}

function getRequestById(requestId) {
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

function getRequestsByRequester(requesterId) {
    if (!requesterId) {
        return [];
    }

    return requests.filter(
        (request) => request.requesterId === requesterId
    );
}

module.exports = {
    createAccessRequest,
    getRequests,
    getPendingRequests,
    getRequestById,
    getRequestsByRequester,
    approveRequest,
    rejectRequest,
    auditorApproveRequest,
    loadRequestsFromDb
};
