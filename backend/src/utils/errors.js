'use strict';

class AppError extends Error {
    constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
    }
}

function sendError(res, statusCode, message, errorCode) {
    return res.status(statusCode).json({
        success: false,
        message,
        errorCode
    });
}

function sendSuccess(res, payload, statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        ...payload
    });
}

function sanitizeClientMessage(message) {
    if (!message || typeof message !== 'string') {
        return 'An unexpected error occurred';
    }

    const lowered = message.toLowerCase();

    if (
        lowered.includes('private key') ||
        lowered.includes('jwt') ||
        lowered.includes('stack') ||
        lowered.includes('enoent')
    ) {
        return 'An unexpected error occurred';
    }

    return message.replace(/\r?\n/g, ' ').slice(0, 500);
}

function isChaincodeFunctionMissing(error) {
    if (error?.code === 'CHAINCODE_FUNCTION_UNAVAILABLE') {
        return true;
    }

    const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
    return (
        message.includes('unknown function') ||
        (message.includes('function name') && message.includes('not found')) ||
        message.includes('no such function') ||
        message.includes('has not been registered') ||
        message.includes('undefined function') ||
        message.includes('updateassetdocument is not available')
    );
}

function mapFabricError(error, fallbackMessage = 'An unexpected error occurred') {
    // EndorseError from Fabric Gateway buries the real chaincode message in details[]
    let raw = error?.message || fallbackMessage;
    if (Array.isArray(error?.details) && error.details.length > 0) {
        // e.g. "chaincode response 500, Asset AST-007 already exists"
        const detailMsg = error.details[0]?.message || '';
        const ccMatch = detailMsg.match(/chaincode response \d+,\s*(.+)/i);
        if (ccMatch) {
            raw = ccMatch[1].trim();
        } else if (detailMsg) {
            raw = detailMsg;
        }
    }
    const message = sanitizeClientMessage(raw);

    if (isChaincodeFunctionMissing(error)) {
        return {
            statusCode: 501,
            errorCode: 'CHAINCODE_FUNCTION_UNAVAILABLE',
            message:
                'Required chaincode function is not available on the deployed contract. Off-chain work was not treated as a blockchain update.'
        };
    }

    if (/already exists/i.test(message)) {
        return { statusCode: 409, errorCode: 'CONFLICT', message };
    }

    if (/does not exist|not found/i.test(message)) {
        return { statusCode: 404, errorCode: 'NOT_FOUND', message };
    }

    if (/not authorized|access denied|not active|cannot/i.test(message)) {
        return { statusCode: 403, errorCode: 'FORBIDDEN', message };
    }

    if (/required|invalid/i.test(message)) {
        return { statusCode: 400, errorCode: 'BAD_REQUEST', message };
    }

    return {
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        message: fallbackMessage
    };
}

function handleControllerError(res, error, fallbackMessage) {
    if (error instanceof AppError) {
        return sendError(res, error.statusCode, error.message, error.errorCode);
    }

    if (error?.code === 'CHAINCODE_FUNCTION_UNAVAILABLE' || isChaincodeFunctionMissing(error)) {
        return sendError(
            res,
            501,
            error.message || 'Required chaincode function is not available on the deployed contract',
            'CHAINCODE_FUNCTION_UNAVAILABLE'
        );
    }

    if (error?.statusCode) {
        return sendError(
            res,
            error.statusCode,
            sanitizeClientMessage(error.message),
            error.errorCode || 'ERROR'
        );
    }

    console.error('Controller error:', error);
    const mapped = mapFabricError(error, fallbackMessage);
    return sendError(res, mapped.statusCode, mapped.message, mapped.errorCode);
}

module.exports = {
    AppError,
    sendError,
    sendSuccess,
    sanitizeClientMessage,
    isChaincodeFunctionMissing,
    mapFabricError,
    handleControllerError
};
