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
const {
    createRevocationProposal,
    getRevocationProposals,
    getPendingRevocationProposals,
    getRevocationProposalById,
    getPendingProposalByIdentityId,
    approveRevocationProposal,
    rejectRevocationProposal
} = require('../services/revocationProposalService');
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
    // Direct revocation without Auditor approval is disabled per SIH specification:
    // RevokeIdentity requires issuing organization + Auditor co-approval.
    return sendError(
        res,
        403,
        'Direct identity revocation is disabled. RevokeIdentity requires issuing organization proposal and Auditor co-approval. Use PATCH /api/identities/:identityId/revoke-propose followed by Auditor /api/identities/:identityId/revoke-approve.',
        'REVOCATION_WORKFLOW_REQUIRED'
    );
}

async function proposeRevocation(req, res) {
    try {
        const { identityId } = req.params;
        const { reason } = req.body || {};

        if (!identityId) {
            return sendError(res, 400, 'identityId is required', 'BAD_REQUEST');
        }
        if (!reason) {
            return sendError(res, 400, 'Revocation reason is required', 'BAD_REQUEST');
        }

        assertSafeId(identityId, 'identityId');

        // Check if existing pending proposal exists
        const existingPending = await getPendingProposalByIdentityId(identityId);
        if (existingPending) {
            return sendError(res, 409, `A pending revocation proposal already exists for identity ${identityId}`, 'CONFLICT');
        }

        // Fetch identity details from ledger
        const identity = await getIdentity(identityId);
        if (!identity) {
            return sendError(res, 404, `Identity ${identityId} not found`, 'NOT_FOUND');
        }
        if (identity.status === 'REVOKED') {
            return sendError(res, 400, `Identity ${identityId} is already revoked`, 'BAD_REQUEST');
        }

        const proposal = await createRevocationProposal({
            identityId,
            organization: identity.organization,
            proposedBy: req.user.userId,
            proposedByName: req.user.name,
            reason
        });

        recordFromRequest(req, {
            action: 'IDENTITY_REVOCATION_PROPOSED',
            resourceType: 'identity',
            resourceId: identityId,
            success: true
        });

        createNotification({
            organization: 'Auditor',
            type: 'REVOCATION_PROPOSAL_CREATED',
            title: 'New Revocation Proposal Pending Co-Approval',
            message: `BEL Admin ${req.user.name} proposed revocation of ${identityId} (${identity.name}, ${identity.organization}). Reason: ${reason}`,
            resourceType: 'identity',
            resourceId: identityId
        });

        return sendSuccess(res, {
            message: 'Revocation proposal submitted successfully. Pending Auditor co-approval.',
            proposal
        }, 201);
    } catch (error) {
        console.error('Propose revocation error:', error);
        return handleControllerError(res, error, 'Unable to submit revocation proposal');
    }
}

async function approveRevocation(req, res) {
    try {
        const { identityId } = req.params;
        const { proposalId } = req.body || {};

        assertSafeId(identityId, 'identityId');

        let targetProposalId = proposalId;
        if (!targetProposalId) {
            const pending = await getPendingProposalByIdentityId(identityId);
            if (!pending) {
                return sendError(res, 404, `No pending revocation proposal found for identity ${identityId}`, 'NOT_FOUND');
            }
            targetProposalId = pending.proposalId;
        }

        const result = await approveRevocationProposal(targetProposalId, req.user.userId);

        recordFromRequest(req, {
            action: 'IDENTITY_REVOCATION_APPROVED',
            resourceType: 'identity',
            resourceId: identityId,
            success: true
        });

        createNotification({
            userId: identityId,
            type: 'IDENTITY_REVOKED',
            title: 'Identity Revoked via Co-Approval',
            message: `Identity ${identityId} was revoked following co-approval by Auditor ${req.user.name}`,
            resourceType: 'identity',
            resourceId: identityId
        });

        return sendSuccess(res, {
            message: 'Identity revocation co-approved and executed on Fabric ledger and CA',
            ...result
        });
    } catch (error) {
        console.error('Approve revocation error:', error);
        return handleControllerError(res, error, 'Unable to approve revocation proposal');
    }
}

async function rejectRevocation(req, res) {
    try {
        const { identityId } = req.params;
        const { proposalId, rejectionReason } = req.body || {};

        assertSafeId(identityId, 'identityId');

        let targetProposalId = proposalId;
        if (!targetProposalId) {
            const pending = await getPendingProposalByIdentityId(identityId);
            if (!pending) {
                return sendError(res, 404, `No pending revocation proposal found for identity ${identityId}`, 'NOT_FOUND');
            }
            targetProposalId = pending.proposalId;
        }

        const proposal = await rejectRevocationProposal(targetProposalId, req.user.userId, rejectionReason);

        recordFromRequest(req, {
            action: 'IDENTITY_REVOCATION_REJECTED',
            resourceType: 'identity',
            resourceId: identityId,
            success: true
        });

        return sendSuccess(res, {
            message: 'Revocation proposal rejected',
            proposal
        });
    } catch (error) {
        console.error('Reject revocation error:', error);
        return handleControllerError(res, error, 'Unable to reject revocation proposal');
    }
}

async function listRevocationProposals(req, res) {
    try {
        const { status } = req.query;
        let proposals;
        if (status === 'PENDING') {
            proposals = await getPendingRevocationProposals();
        } else {
            proposals = await getRevocationProposals();
        }
        return sendSuccess(res, { proposals });
    } catch (error) {
        return handleControllerError(res, error, 'Unable to fetch revocation proposals');
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
    proposeRevocation,
    approveRevocation,
    rejectRevocation,
    listRevocationProposals,
    getIdentityDID,
    checkCAHealthController
};
