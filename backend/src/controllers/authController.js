'use strict';

const { login, enrollUser } = require('../services/authService');
const { recordFromRequest } = require('../services/auditLogService');
const { handleControllerError, sendError, sendSuccess } = require('../utils/errors');

async function loginUser(req, res) {
    try {
        const { userId, password } = req.body;

        if (!userId || !password) {
            return sendError(res, 400, 'userId and password are required', 'BAD_REQUEST');
        }

        const result = await login(userId, password);

        recordFromRequest(req, {
            userId: result.user.userId,
            organization: result.user.organization,
            role: result.user.role,
            action: 'LOGIN',
            resourceType: 'auth',
            resourceId: result.user.userId,
            success: true
        });

        return sendSuccess(res, {
            message: 'Login successful',
            ...result
        });
    } catch (error) {
        console.error('Login error:', error);
        recordFromRequest(req, {
            userId: req.body?.userId,
            action: 'LOGIN',
            resourceType: 'auth',
            resourceId: req.body?.userId,
            success: false,
            message: 'Invalid credentials'
        });

        return sendError(res, 401, 'Invalid user ID or password', 'UNAUTHENTICATED');
    }
}

async function enrollNewUser(req, res) {
    try {
        const { userId, name, organization, role, password } = req.body;

        if (!userId || !name || !organization || !role || !password) {
            return sendError(
                res,
                400,
                'userId, name, organization, role and password are required',
                'BAD_REQUEST'
            );
        }

        const actor = req.user;

        const allowed =
            (actor.organization === 'BEL' && actor.role === 'Admin') ||
            (actor.organization === 'BEL' && actor.role === 'Manager' && organization === 'BEL') ||
            (actor.organization === 'Contractor' && actor.role === 'Admin' && organization === 'Contractor');

        if (!allowed) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        const { registerIdentityInCA } = require('../services/caService');
        const { registerIdentity } = require('../services/fabricService');

        let caResult = null;
        try {
            caResult = await registerIdentityInCA({ organization, identityId: userId, role });
        } catch (caErr) {
            console.warn('Fabric CA enrollment notice:', caErr.message);
        }

        let ledgerIdentity = null;
        try {
            ledgerIdentity = await registerIdentity('BEL', userId, name, organization, role);
        } catch (fabErr) {
            console.warn('Fabric ledger enrollment notice:', fabErr.message);
        }

        const user = await enrollUser({ userId, name, organization, role, password });

        recordFromRequest(req, {
            action: 'USER_ENROLLED',
            resourceType: 'auth',
            resourceId: userId,
            success: true
        });

        return sendSuccess(res, {
            message: 'User enrolled successfully',
            user,
            identity: ledgerIdentity,
            ca: caResult
        }, 201);
    } catch (error) {
        console.error('Enroll error:', error);
        return handleControllerError(res, error, 'Unable to enroll user');
    }
}

module.exports = {
    loginUser,
    enrollNewUser
};
