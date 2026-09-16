'use strict';

const express = require('express');

const {
    createIdentity,
    fetchIdentity,
    revokeExistingIdentity,
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

router.patch(
    '/:identityId/revoke',
    authenticate,
    authorizeOrganization('BEL', 'Admin'),
    revokeExistingIdentity
);

module.exports = router;
