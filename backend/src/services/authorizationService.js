'use strict';

const { checkAccess } = require('./accessService');
const { AppError } = require('../utils/errors');

function isBelPrivileged(user) {
    return user?.organization === 'BEL' && ['Admin', 'Manager'].includes(user.role);
}

function isBelAdmin(user) {
    return user?.organization === 'BEL' && user.role === 'Admin';
}

function isAuditor(user) {
    return user?.organization === 'Auditor' && user.role === 'Auditor';
}

function assertSafeId(value, fieldName) {
    if (!value || typeof value !== 'string') {
        throw new AppError(`${fieldName} is required`, 400, 'BAD_REQUEST');
    }

    if (value.includes('..') || value.includes('/') || value.includes('\\') || value.includes('\0')) {
        throw new AppError(`Invalid ${fieldName}`, 400, 'BAD_REQUEST');
    }

    return value;
}

async function canViewAsset(user, asset) {
    if (!user || !asset) {
        return false;
    }

    if (isAuditor(user) || isBelPrivileged(user)) {
        return true;
    }

    if (asset.owner === user.userId) {
        return true;
    }

    const access = await checkAccess(user.userId, asset.assetId);
    return Boolean(access?.hasAccess);
}

async function canModifyAssetDocument(user, asset) {
    if (!asset || asset.status !== 'ACTIVE') {
        return false;
    }

    return isBelPrivileged(user);
}

async function canDownloadAsset(user, asset) {
    return canViewAsset(user, asset);
}

function canTransferAsset(user, asset) {
    if (!user || !asset || asset.status !== 'ACTIVE') {
        return false;
    }

    if (isBelAdmin(user)) {
        return true;
    }

    if (user.organization === 'Contractor' && ['Admin', 'User'].includes(user.role)) {
        return asset.owner === user.userId;
    }

    if (user.organization === 'Auditor' && ['Auditor', 'Admin'].includes(user.role)) {
        return asset.owner === user.userId;
    }

    return false;
}

function canViewIdentity(user, identity) {
    if (!user || !identity) {
        return false;
    }

    if (isAuditor(user) || isBelPrivileged(user)) {
        return true;
    }

    if (identity.identityId === user.userId) {
        return true;
    }

    if (user.organization === 'Contractor' && user.role === 'Admin') {
        return identity.organization === 'Contractor';
    }

    return false;
}

function canCheckAccessRecord(user, identityId) {
    if (!user) {
        return false;
    }

    if (isAuditor(user) || isBelPrivileged(user)) {
        return true;
    }

    return user.userId === identityId;
}

module.exports = {
    isBelPrivileged,
    isBelAdmin,
    isAuditor,
    assertSafeId,
    canViewAsset,
    canModifyAssetDocument,
    canDownloadAsset,
    canTransferAsset,
    canViewIdentity,
    canCheckAccessRecord
};
