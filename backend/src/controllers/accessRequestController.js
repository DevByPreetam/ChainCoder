'use strict';

const {
    createAccessRequest,
    getRequests,
    getPendingRequests,
    getRequestById,
    getRequestsByRequester,
    approveRequest,
    rejectRequest,
    auditorApproveRequest
} = require('../services/accessRequestService');
const { grantAccess } = require('../services/fabricService');
const { getAsset } = require('../services/assetService');
const { getIdentity } = require('../services/fabricService');
const { recordFromRequest, accessResourceId } = require('../services/auditLogService');
const { notifyRoles, createNotification } = require('../services/notificationService');
const { handleControllerError, sendError, sendSuccess } = require('../utils/errors');

async function requestAccess(req, res) {
    try {
        const {
            identityId,
            assetId,
            permission,
            reason
        } = req.body;

        if (!identityId || !assetId || !permission) {
            return sendError(
                res,
                400,
                'identityId, assetId and permission are required',
                'BAD_REQUEST'
            );
        }

        if (identityId !== req.user.userId && req.user.role !== 'Admin') {
            return sendError(
                res,
                403,
                'Users may only request access for their own identity',
                'FORBIDDEN'
            );
        }

        await getAsset(assetId, 'BEL');
        await getIdentity(identityId);

        const request = await createAccessRequest({
            requesterId: req.user.userId,
            requesterName: req.user.name,
            organization: req.user.organization,
            identityId,
            assetId,
            permission,
            reason
        });

        recordFromRequest(req, {
            action: 'ACCESS_REQUEST_CREATED',
            resourceType: 'accessRequest',
            resourceId: request.requestId,
            success: true
        });

        notifyRoles('BEL', ['Admin', 'Manager'], {
            type: 'ACCESS_REQUEST_CREATED',
            title: 'Access request submitted',
            message: `${req.user.userId} requested ${permission} on ${assetId}`,
            resourceType: 'accessRequest',
            resourceId: request.requestId
        });

        return sendSuccess(res, {
            message: 'Access request submitted successfully',
            request
        }, 201);
    } catch (error) {
        console.error('Access request error:', error);
        return handleControllerError(res, error, 'Unable to create access request');
    }
}

async function listAccessRequests(req, res) {
    try {
        const status = req.query.status;
        const requests = await getRequests(status ? { status } : {});
        return sendSuccess(res, { requests });
    } catch (error) {
        console.error('List access requests error:', error);
        return handleControllerError(res, error, 'Unable to list access requests');
    }
}

async function listPendingAccessRequests(req, res) {
    try {
        const requests = await getPendingRequests();
        return sendSuccess(res, { requests });
    } catch (error) {
        console.error('List pending access requests error:', error);
        return handleControllerError(res, error, 'Unable to list pending requests');
    }
}

async function getAccessRequest(req, res) {
    try {
        const { requestId } = req.params;
        const request = await getRequestById(requestId);

        if (!request) {
            return sendError(res, 404, 'Access request not found', 'NOT_FOUND');
        }

        const privileged =
            (req.user.organization === 'BEL' && ['Admin', 'Manager'].includes(req.user.role)) ||
            (req.user.organization === 'Auditor' && req.user.role === 'Auditor');

        if (!privileged && request.requesterId !== req.user.userId) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        return sendSuccess(res, { request });
    } catch (error) {
        console.error('Get access request error:', error);
        return handleControllerError(res, error, 'Unable to fetch access request');
    }
}

async function approveAccessRequest(req, res) {
    try {
        const { requestId } = req.params;
        const request = await approveRequest(requestId, req.user.userId);

        recordFromRequest(req, {
            action: 'ACCESS_REQUEST_APPROVED',
            resourceType: 'accessRequest',
            resourceId: requestId,
            success: true
        });

        createNotification({
            userId: request.requesterId,
            type: 'ACCESS_REQUEST_APPROVED',
            title: 'Access request approved by BEL',
            message: `Request ${requestId} was approved and awaits auditor co-sign`,
            resourceType: 'accessRequest',
            resourceId: requestId
        });

        notifyRoles('Auditor', ['Auditor'], {
            type: 'ACCESS_REQUEST_APPROVED',
            title: 'Request awaiting auditor co-sign',
            message: `Request ${requestId} is BEL_APPROVED`,
            resourceType: 'accessRequest',
            resourceId: requestId
        });

        return sendSuccess(res, {
            message: 'Access request approved by BEL',
            request
        });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to approve access request');
    }
}

async function rejectAccessRequest(req, res) {
    try {
        const { requestId } = req.params;
        const { reason } = req.body || {};

        const request = await rejectRequest(
            requestId,
            req.user.userId,
            reason
        );

        recordFromRequest(req, {
            action: 'ACCESS_REQUEST_REJECTED',
            resourceType: 'accessRequest',
            resourceId: requestId,
            success: true
        });

        createNotification({
            userId: request.requesterId,
            type: 'ACCESS_REQUEST_REJECTED',
            title: 'Access request rejected',
            message: reason || `Request ${requestId} was rejected`,
            resourceType: 'accessRequest',
            resourceId: requestId
        });

        return sendSuccess(res, {
            message: 'Access request rejected',
            request
        });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to reject access request');
    }
}

async function auditorApproveAccessRequest(req, res) {
    try {
        const { requestId } = req.params;
        const request = await getRequestById(requestId);

        if (!request) {
            return sendError(res, 404, 'Access request not found', 'NOT_FOUND');
        }

        if (request.status !== 'BEL_APPROVED') {
            return sendError(
                res,
                409,
                'Request must be BEL_APPROVED before Auditor approval',
                'CONFLICT'
            );
        }

        const fabricResult = await grantAccess(
            'BEL',
            request.requestId,
            request.identityId,
            request.assetId,
            request.requesterId,
            request.permission
        );

        const approvedRequest = await auditorApproveRequest(
            requestId,
            req.user.userId
        );

        recordFromRequest(req, {
            action: 'ACCESS_GRANTED',
            resourceType: 'access',
            resourceId: accessResourceId(request.identityId, request.assetId),
            success: true
        });

        createNotification({
            userId: request.requesterId,
            type: 'ACCESS_REQUEST_APPROVED',
            title: 'Access recorded on Fabric',
            message: `Access to ${request.assetId} is now active`,
            resourceType: 'access',
            resourceId: request.assetId
        });

        return sendSuccess(res, {
            message: 'Access approved and recorded on Fabric',
            request: approvedRequest,
            fabric: fabricResult
        });
    } catch (error) {
        console.error('Fabric GrantAccess error:', error);
        return handleControllerError(res, error, 'Unable to complete auditor approval');
    }
}

async function listMyAccessRequests(req, res) {
    try {
        const requests = await getRequestsByRequester(req.user.userId);
        return sendSuccess(res, { requests });
    } catch (error) {
        console.error('List my access requests error:', error);
        return handleControllerError(res, error, 'Unable to list your access requests');
    }
}

module.exports = {
    requestAccess,
    listAccessRequests,
    listPendingAccessRequests,
    listMyAccessRequests,
    getAccessRequest,
    approveAccessRequest,
    rejectAccessRequest,
    auditorApproveAccessRequest
};
