'use strict';

const {
    grantAccess,
    checkAccess,
    revokeAccess
} = require('../services/accessService');
const { getAsset } = require('../services/assetService');
const { getIdentity } = require('../services/fabricService');
const { createAdminGrantProposal } = require('../services/accessRequestService');
const { recordFromRequest, accessResourceId, getAuditLogs } = require('../services/auditLogService');
const { createNotification, notifyRoles } = require('../services/notificationService');
const { canCheckAccessRecord, assertSafeId } = require('../services/authorizationService');
const { handleControllerError, sendError, sendSuccess } = require('../utils/errors');

async function createAccess(req, res) {
    try {
        const {
            accessId,
            identityId,
            assetId,
            grantedTo,
            permission
        } = req.body;

        if (
            !accessId ||
            !identityId ||
            !assetId ||
            !grantedTo ||
            !permission
        ) {
            return sendError(
                res,
                400,
                'accessId, identityId, assetId, grantedTo and permission are required',
                'BAD_REQUEST'
            );
        }

        assertSafeId(identityId, 'identityId');
        assertSafeId(assetId, 'assetId');

        // Check if target asset exists on Fabric ledger
        try {
            const asset = await getAsset(assetId, 'BEL');
            if (!asset || asset.status !== 'ACTIVE') {
                return sendError(
                    res,
                    404,
                    `Asset ${assetId} does not exist or is not ACTIVE on Hyperledger Fabric. Please verify the asset ID or mint the asset first.`,
                    'NOT_FOUND'
                );
            }
        } catch (assetErr) {
            return sendError(
                res,
                404,
                `Asset ${assetId} does not exist on Hyperledger Fabric. Please verify the asset ID or mint the asset first.`,
                'NOT_FOUND'
            );
        }

        // Check if target identity exists on Fabric ledger
        try {
            const identity = await getIdentity(identityId, 'BEL');
            if (!identity || identity.status !== 'ACTIVE') {
                return sendError(
                    res,
                    404,
                    `Identity ${identityId} does not exist or is not ACTIVE on Hyperledger Fabric.`,
                    'NOT_FOUND'
                );
            }
        } catch (idErr) {
            return sendError(
                res,
                404,
                `Identity ${identityId} does not exist on Hyperledger Fabric.`,
                'NOT_FOUND'
            );
        }

        // Check if access is already active on Fabric ledger
        try {
            const check = await checkAccess(identityId, assetId, 'BEL');
            if (check && check.hasAccess) {
                return sendError(
                    res,
                    409,
                    `Identity ${identityId} already has active ${check.permission || ''} access to asset ${assetId} on the ledger`,
                    'CONFLICT'
                );
            }
        } catch (checkErr) {
            // Non-blocking if CheckAccess throws
        }

        // Create proposal in access requests queue with BEL_APPROVED status (awaiting Auditor)
        const request = await createAdminGrantProposal({
            accessId,
            identityId,
            assetId,
            grantedTo,
            permission,
            adminUserId: req.user.userId,
            adminUserName: req.user.name || req.user.userId
        });

        recordFromRequest(req, {
            action: 'ACCESS_GRANT_PROPOSED',
            resourceType: 'accessRequest',
            resourceId: request.requestId,
            success: true
        });

        // Notify Auditor for co-approval
        notifyRoles('Auditor', ['Auditor'], {
            type: 'ACCESS_REQUEST_APPROVED',
            title: 'Admin Access Grant Awaiting Auditor Co-Approval',
            message: `BEL Admin ${req.user.userId} granted ${permission} access on ${assetId} to ${identityId}. Auditor co-approval required before commitment to Fabric ledger.`,
            resourceType: 'accessRequest',
            resourceId: request.requestId
        });

        // Notify Grantee
        createNotification({
            userId: grantedTo,
            type: 'ACCESS_REQUEST_APPROVED',
            title: 'Access Grant Proposed',
            message: `BEL Admin ${req.user.userId} granted ${permission} access to ${assetId}. Awaiting Auditor co-approval.`,
            resourceType: 'access',
            resourceId: assetId
        });

        return sendSuccess(res, {
            message: 'Access grant proposal submitted — awaiting Auditor co-approval before commitment to Fabric ledger',
            access: {
                accessId: request.requestId,
                identityId: request.identityId,
                assetId: request.assetId,
                grantedTo: request.requesterId,
                permission: request.permission,
                status: 'BEL_APPROVED'
            },
            request
        }, 201);
    } catch (error) {
        console.error('Grant access proposal error:', error);
        recordFromRequest(req, {
            action: 'ACCESS_GRANT_PROPOSED',
            resourceType: 'access',
            resourceId: req.body?.assetId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to submit access grant proposal');
    }
}

async function checkExistingAccess(req, res) {
    try {
        const {
            identityId,
            assetId
        } = req.params;

        if (!identityId || !assetId) {
            return sendError(res, 400, 'identityId and assetId are required', 'BAD_REQUEST');
        }

        if (!canCheckAccessRecord(req.user, identityId)) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        const access = await checkAccess(
            identityId,
            assetId,
            req.user.organization === 'Contractor' ? 'Contractor' : 'BEL'
        );

        return sendSuccess(res, { access });
    } catch (error) {
        console.error('Check access error:', error);
        return handleControllerError(res, error, 'Unable to check access');
    }
}

async function revokeExistingAccess(req, res) {
    try {
        const {
            identityId,
            assetId
        } = req.params;

        if (!identityId || !assetId) {
            return sendError(res, 400, 'identityId and assetId are required', 'BAD_REQUEST');
        }

        const access = await revokeAccess(identityId, assetId, 'BEL');

        recordFromRequest(req, {
            action: 'ACCESS_REVOKED',
            resourceType: 'access',
            resourceId: accessResourceId(identityId, assetId),
            success: true
        });

        createNotification({
            userId: access.grantedTo || identityId,
            type: 'ACCESS_REVOKED',
            title: 'Access revoked',
            message: `Access to ${assetId} was revoked`,
            resourceType: 'access',
            resourceId: assetId
        });

        return sendSuccess(res, {
            message: 'Access revoked successfully',
            access
        });
    } catch (error) {
        console.error('Revoke access error:', error);
        recordFromRequest(req, {
            action: 'ACCESS_REVOKED',
            resourceType: 'access',
            resourceId: req.params.assetId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to revoke access');
    }
}

async function listAccessHistory(req, res) {
    try {
        const history = getAuditLogs({ resourceType: 'access' });
        return sendSuccess(res, { history });
    } catch (error) {
        console.error('Access history error:', error);
        return handleControllerError(res, error, 'Unable to fetch access history');
    }
}

module.exports = {
    createAccess,
    checkExistingAccess,
    revokeExistingAccess,
    listAccessHistory
};
