'use strict';

const {
    registerIdentity,
    getIdentity,
    revokeIdentity
} = require('../services/fabricService');
const { recordFromRequest } = require('../services/auditLogService');
const { createNotification } = require('../services/notificationService');
const { canViewIdentity, assertSafeId } = require('../services/authorizationService');
const { AppError, handleControllerError, sendError, sendSuccess } = require('../utils/errors');

const BEL_STAFF_ROLES = ['Admin', 'Manager', 'Employee'];
const CONTRACTOR_ROLES = ['Admin', 'User'];

function assertCanRegister(user, organization, role) {
    if (user.organization === 'BEL' && user.role === 'Admin') {
        return;
    }

    if (user.organization === 'BEL' && user.role === 'Manager') {
        if (organization !== 'BEL' || !BEL_STAFF_ROLES.includes(role)) {
            throw new AppError(
                'BEL Manager can only register BEL staff',
                403,
                'FORBIDDEN'
            );
        }
        return;
    }

    if (user.organization === 'Contractor' && user.role === 'Admin') {
        if (organization !== 'Contractor' || !CONTRACTOR_ROLES.includes(role)) {
            throw new AppError(
                'Contractor Admin can only register Contractor users',
                403,
                'FORBIDDEN'
            );
        }
        return;
    }

    throw new AppError('Access denied', 403, 'FORBIDDEN');
}

async function createIdentity(req, res) {
    try {
        const { identityId, name, organization, role } = req.body;

        if (!identityId || !name || !organization || !role) {
            return sendError(
                res,
                400,
                'identityId, name, organization and role are required',
                'BAD_REQUEST'
            );
        }

        assertSafeId(identityId, 'identityId');
        assertCanRegister(req.user, organization, role);

        // Deployed RegisterIdentity currently requires BELMSP.
        const identity = await registerIdentity(
            'BEL',
            identityId,
            name,
            organization,
            role
        );

        recordFromRequest(req, {
            action: 'IDENTITY_REGISTERED',
            resourceType: 'identity',
            resourceId: identityId,
            success: true
        });

        return sendSuccess(res, {
            message: 'Identity registered successfully',
            identity
        }, 201);
    } catch (error) {
        console.error('Create identity error:', error);
        recordFromRequest(req, {
            action: 'IDENTITY_REGISTERED',
            resourceType: 'identity',
            resourceId: req.body?.identityId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to register identity');
    }
}

async function fetchIdentity(req, res) {
    try {
        const { identityId } = req.params;

        if (!identityId) {
            return sendError(res, 400, 'identityId is required', 'BAD_REQUEST');
        }

        assertSafeId(identityId, 'identityId');

        const identity = await getIdentity(identityId);

        if (!canViewIdentity(req.user, identity)) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        return sendSuccess(res, { identity });
    } catch (error) {
        console.error('Get identity error:', error);
        return handleControllerError(res, error, 'Unable to fetch identity');
    }
}

async function revokeExistingIdentity(req, res) {
    try {
        const { identityId } = req.params;

        if (!identityId) {
            return sendError(res, 400, 'identityId is required', 'BAD_REQUEST');
        }

        assertSafeId(identityId, 'identityId');

        const identity = await revokeIdentity(identityId, 'BEL');

        recordFromRequest(req, {
            action: 'IDENTITY_REVOKED',
            resourceType: 'identity',
            resourceId: identityId,
            success: true
        });

        createNotification({
            userId: identityId,
            type: 'IDENTITY_REVOKED',
            title: 'Identity revoked',
            message: `Identity ${identityId} was revoked`,
            resourceType: 'identity',
            resourceId: identityId
        });

        return sendSuccess(res, {
            message: 'Identity revoked successfully',
            identity
        });
    } catch (error) {
        console.error('Revoke identity error:', error);
        recordFromRequest(req, {
            action: 'IDENTITY_REVOKED',
            resourceType: 'identity',
            resourceId: req.params.identityId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to revoke identity');
    }
}

async function getIdentityDID(req, res) {
    try {
        const { identityId } = req.params;

        if (!identityId) {
            return sendError(res, 400, 'identityId is required', 'BAD_REQUEST');
        }

        assertSafeId(identityId, 'identityId');

        const identity = await getIdentity(identityId);

        if (!canViewIdentity(req.user, identity)) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        const did = identity.did || `did:chaincoder:${identity.organization}:${identity.identityId}`;
        const cryptographicReference = identity.cryptographicReference || `fabric-ca::${identity.organization}MSP::${identity.identityId}`;

        return sendSuccess(res, {
            did,
            identityId: identity.identityId,
            organization: identity.organization,
            role: identity.role,
            status: identity.status,
            cryptographicReference
        });
    } catch (error) {
        console.error('Get identity DID error:', error);
        return handleControllerError(res, error, 'Unable to fetch identity DID');
    }
}

module.exports = {
    createIdentity,
    fetchIdentity,
    revokeExistingIdentity,
    getIdentityDID
};
