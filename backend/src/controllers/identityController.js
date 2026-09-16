'use strict';

const {
    registerIdentity,
    getIdentity,
    revokeIdentity
} = require('../services/fabricService');
const {
    registerIdentityInCA,
    revokeIdentityInCA,
    getCAHealth
} = require('../services/caService');
const { enrollUser, updateUserStatus } = require('../services/authService');
const { query, isDbConnected } = require('../config/db');
const { recordFromRequest } = require('../services/auditLogService');
const { createNotification } = require('../services/notificationService');
const { canViewIdentity, assertSafeId } = require('../services/authorizationService');
const { AppError, handleControllerError, sendError, sendSuccess } = require('../utils/errors');

function assertCanRegister(user, organization, role) {
    if (!['BEL', 'Contractor', 'Auditor'].includes(organization)) {
        throw new AppError(`Invalid organization '${organization}'`, 400, 'BAD_REQUEST');
    }

    if (user.organization === 'BEL' && user.role === 'Admin') {
        return;
    }

    if (user.organization === 'BEL' && user.role === 'Manager') {
        if (organization !== 'BEL') {
            throw new AppError(
                'BEL Manager can only register BEL staff',
                403,
                'FORBIDDEN'
            );
        }
        return;
    }

    if (user.organization === 'Contractor' && user.role === 'Admin') {
        if (organization !== 'Contractor' || !['Admin', 'User'].includes(role)) {
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
        const { identityId, name, organization, role, password } = req.body;

        if (!identityId || !name || !organization || !role) {
            return sendError(
                res,
                400,
                'identityId, name, organization and role are required',
                'BAD_REQUEST'
            );
        }

        if (password !== undefined && (typeof password !== 'string' || password.length < 6)) {
            return sendError(
                res,
                400,
                'Password must be at least 6 characters',
                'BAD_REQUEST'
            );
        }

        const effectivePassword = password || `${organization}@123`;

        assertSafeId(identityId, 'identityId');
        assertCanRegister(req.user, organization, role);

        // Pre-check for duplicate identity in PostgreSQL
        if (isDbConnected()) {
            const dbExisting = await query('SELECT user_id FROM users WHERE user_id = $1', [identityId]);
            if (dbExisting.rows && dbExisting.rows.length > 0) {
                return sendError(res, 409, 'An identity or user with this ID already exists', 'CONFLICT');
            }
        }

        // 1. Register identity with organization's Fabric CA
        let caResult = null;
        try {
            caResult = await registerIdentityInCA({
                organization,
                identityId,
                role
            });
        } catch (caErr) {
            console.warn('Fabric CA registration notice:', caErr.message);
        }

        // 2. Register identity on Hyperledger Fabric ledger
        const identity = await registerIdentity(
            'BEL',
            identityId,
            name,
            organization,
            role
        );

        // 3. Register user account in application database (PostgreSQL + memory) with bcrypt password
        const enrolledUser = await enrollUser({
            userId: identityId,
            name,
            organization,
            role,
            password: effectivePassword
        });

        recordFromRequest(req, {
            action: 'IDENTITY_REGISTERED',
            resourceType: 'identity',
            resourceId: identityId,
            success: true
        });

        createNotification({
            userId: identityId,
            organization,
            type: 'IDENTITY_REGISTERED',
            title: 'Identity and Account Provisioned',
            message: `New identity ${identityId} (${role}) registered on Fabric ledger and CA. Application login account created.`,
            resourceType: 'identity',
            resourceId: identityId
        });

        return sendSuccess(res, {
            message: 'Identity and login account registered successfully on Fabric ledger, Fabric CA, and application directory',
            identity,
            user: enrolledUser,
            ca: caResult
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

        // 1. Revoke identity on Hyperledger Fabric ledger
        const identity = await revokeIdentity(identityId, 'BEL');

        // 2. Revoke certificate on Fabric CA and generate CRL
        let caRevocation = null;
        try {
            caRevocation = await revokeIdentityInCA({
                organization: identity.organization || 'BEL',
                identityId,
                reason: 'cessationofoperation'
            });
        } catch (caErr) {
            console.warn('Fabric CA revocation notice:', caErr.message);
        }

        // 3. Synchronize application user status in database
        await updateUserStatus(identityId, 'REVOKED');

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
            message: `Identity ${identityId} was revoked on blockchain and CA`,
            resourceType: 'identity',
            resourceId: identityId
        });

        return sendSuccess(res, {
            message: 'Identity revoked successfully on blockchain and Fabric CA',
            identity,
            ca: caRevocation
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

async function checkCAHealthController(req, res) {
    try {
        const orgs = ['BEL', 'Auditor', 'Contractor'];
        const health = {};
        for (const org of orgs) {
            health[org] = await getCAHealth(org);
        }
        return sendSuccess(res, { health });
    } catch (error) {
        console.error('Check CA health error:', error);
        return handleControllerError(res, error, 'Unable to query Fabric CA health');
    }
}

module.exports = {
    createIdentity,
    fetchIdentity,
    revokeExistingIdentity,
    getIdentityDID,
    checkCAHealthController
};
