'use strict';

const express = require('express');

const {
    createIdentity,
    fetchIdentity,
    revokeExistingIdentity,
    proposeRevocation,
    approveRevocation,
    rejectRevocation,
    listRevocationProposals,
    getIdentityDID,
    checkCAHealthController
} = require('../controllers/identityController');

const {
    authenticate,
    authorizeOrganization,
    authorizeOrganizationRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
    '/ca/health',
    authenticate,
    checkCAHealthController
);

router.get(
    '/revocations/proposals',
    authenticate,
    listRevocationProposals
);

router.post(
    '/',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'BEL', roles: ['Admin', 'Manager'] },
        { organization: 'Contractor', roles: ['Admin'] }
    ),
    createIdentity
);

router.get(
    '/:identityId',
    authenticate,
    fetchIdentity
);

router.get(
    '/:identityId/did',
    authenticate,
    getIdentityDID
);

// Revocation proposal by issuing organization (BEL Admin)
router.post(
    '/:identityId/revoke-propose',
    authenticate,
    authorizeOrganization('BEL', 'Admin'),
    proposeRevocation
);

router.patch(
    '/:identityId/revoke-propose',
    authenticate,
    authorizeOrganization('BEL', 'Admin'),
    proposeRevocation
);

// Revocation co-approval by Auditor
router.patch(
    '/:identityId/revoke-approve',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor', 'Admin'] }
    ),
    approveRevocation
);

// Revocation rejection by Auditor
router.patch(
    '/:identityId/revoke-reject',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor', 'Admin'] }
    ),
    rejectRevocation
);

// Direct revocation route (enforces rejection - co-approval workflow required)
router.patch(
    '/:identityId/revoke',
    authenticate,
    authorizeOrganization('BEL', 'Admin'),
    revokeExistingIdentity
);

module.exports = router;
