'use strict';

const express = require('express');

const {
    createAccess,
    checkExistingAccess,
    revokeExistingAccess,
    listAccessHistory
} = require('../controllers/accessController');

const {
    requestAccess,
    listAccessRequests,
    listPendingAccessRequests,
    listMyAccessRequests,
    getAccessRequest,
    approveAccessRequest,
    rejectAccessRequest,
    auditorApproveAccessRequest
} = require('../controllers/accessRequestController');

const {
    authenticate,
    authorizeOrganization,
    authorizeOrganizationRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

router.post(
    '/request',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Contractor', roles: ['Admin', 'User'] },
        { organization: 'BEL', roles: ['Employee', 'Admin', 'Manager'] }
    ),
    requestAccess
);

router.post(
    '/requests',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Contractor', roles: ['Admin', 'User'] },
        { organization: 'BEL', roles: ['Employee', 'Admin', 'Manager'] }
    ),
    requestAccess
);

router.get(
    '/requests/my',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Contractor', roles: ['Admin', 'User'] },
        { organization: 'BEL', roles: ['Employee', 'Admin', 'Manager'] }
    ),
    listMyAccessRequests
);

router.get(
    '/requests/pending',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    listPendingAccessRequests
);

router.get(
    '/requests',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    listAccessRequests
);

router.get(
    '/requests/:requestId',
    authenticate,
    getAccessRequest
);

router.post(
    '/requests/:requestId/approve',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    approveAccessRequest
);

router.patch(
    '/requests/:requestId/approve',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    approveAccessRequest
);

router.post(
    '/requests/:requestId/reject',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'BEL', roles: ['Admin', 'Manager'] },
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    rejectAccessRequest
);

router.patch(
    '/requests/:requestId/reject',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'BEL', roles: ['Admin', 'Manager'] },
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    rejectAccessRequest
);

router.post(
    '/requests/:requestId/auditor-approve',
    authenticate,
    authorizeOrganization('Auditor', 'Auditor'),
    auditorApproveAccessRequest
);

router.get(
    '/history',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    listAccessHistory
);

router.post(
    '/',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    createAccess
);

router.get(
    '/:identityId/:assetId',
    authenticate,
    checkExistingAccess
);

router.patch(
    '/:identityId/:assetId/revoke',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    revokeExistingAccess
);

module.exports = router;
