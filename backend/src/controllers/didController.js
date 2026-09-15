'use strict';

const { resolveDID, verifyDID } = require('../services/fabricService');
const { handleControllerError, sendError, sendSuccess } = require('../utils/errors');

function sanitizeDIDParam(rawDid) {
    if (!rawDid || typeof rawDid !== 'string') {
        return '';
    }
    return decodeURIComponent(rawDid).trim();
}

async function handleResolveDID(req, res) {
    try {
        const did = sanitizeDIDParam(req.params.did);

        if (!did) {
            return sendError(res, 400, 'did parameter is required', 'BAD_REQUEST');
        }

        const didDocument = await resolveDID(did, 'BEL');

        return sendSuccess(res, { didDocument });
    } catch (error) {
        console.error('Resolve DID error:', error);
        return handleControllerError(res, error, 'Unable to resolve DID');
    }
}

async function handleVerifyDID(req, res) {
    try {
        const did = sanitizeDIDParam(req.params.did);

        if (!did) {
            return sendError(res, 400, 'did parameter is required', 'BAD_REQUEST');
        }

        const verification = await verifyDID(did, 'BEL');

        return sendSuccess(res, { verification });
    } catch (error) {
        console.error('Verify DID error:', error);
        return handleControllerError(res, error, 'Unable to verify DID');
    }
}

module.exports = {
    handleResolveDID,
    handleVerifyDID
};