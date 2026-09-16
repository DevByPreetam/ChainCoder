'use strict';

const {
    mintAsset,
    getAsset,
    transferAsset,
    updateAssetDocument,
    getAssetHistory
} = require('../services/assetService');
const { isAssetDeleted, getPendingProposalForAsset } = require('../services/assetDeletionService');
const { saveUploadedFile, hashFromIpfs, retrieveFromIpfs } = require('../services/fileService');
const { recordFromRequest } = require('../services/auditLogService');
const { notifyRoles, createNotification } = require('../services/notificationService');
const {
    assertSafeId,
    canViewAsset,
    canModifyAssetDocument,
    canDownloadAsset,
    canTransferAsset
} = require('../services/authorizationService');
const { AppError, handleControllerError, sendSuccess, sendError } = require('../utils/errors');

function publicAssetView(asset) {
    return {
        assetId: asset.assetId,
        tokenId: asset.tokenId || asset.assetId,
        tokenStandard: asset.tokenStandard || 'CHAINCODER-NFT',
        name: asset.name,
        assetType: asset.assetType,
        status: asset.status,
        ownerOrganization: asset.ownerOrganization || null,
        owner: asset.owner,
        ownerDID: asset.ownerDID || (asset.owner && asset.ownerOrganization ? `did:chaincoder:${asset.ownerOrganization}:${asset.owner}` : null),
        documentHash: asset.documentHash || '',
        documentCID: asset.documentCID || '',
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt
    };
}

async function createAsset(req, res) {
    try {
        const {
            assetId,
            name,
            assetType,
            owner,
            documentHash,
            documentCID
        } = req.body;

        if (
            !assetId ||
            !name ||
            !assetType ||
            !owner ||
            !documentHash ||
            !documentCID
        ) {
            return sendError(
                res,
                400,
                'assetId, name, assetType, owner, documentHash and documentCID are required',
                'BAD_REQUEST'
            );
        }

        assertSafeId(assetId, 'assetId');

        const asset = await mintAsset(
            req.user.organization,
            assetId,
            name,
            assetType,
            owner,
            documentHash,
            documentCID
        );

        recordFromRequest(req, {
            action: 'ASSET_MINTED',
            resourceType: 'asset',
            resourceId: assetId,
            success: true
        });

        createNotification({
            userId: owner,
            organization: req.user.organization,
            type: 'ASSET_CREATED',
            title: 'Asset created',
            message: `Asset ${assetId} was minted`,
            resourceType: 'asset',
            resourceId: assetId
        });

        notifyRoles('Auditor', ['Auditor'], {
            type: 'ASSET_CREATED',
            title: 'Asset minted',
            message: `Asset ${assetId} was minted by ${req.user.userId}`,
            resourceType: 'asset',
            resourceId: assetId
        });

        return sendSuccess(res, {
            message: 'Asset minted successfully',
            asset
        }, 201);
    } catch (error) {
        console.error('Create asset error:', error);
        recordFromRequest(req, {
            action: 'ASSET_MINTED',
            resourceType: 'asset',
            resourceId: req.body?.assetId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to mint asset');
    }
}

async function fetchAsset(req, res) {
    try {
        const { assetId } = req.params;

        if (!assetId) {
            return sendError(res, 400, 'assetId is required', 'BAD_REQUEST');
        }

        assertSafeId(assetId, 'assetId');

        const asset = await getAsset(assetId, req.user.organization);

        const deleted = await isAssetDeleted(assetId);
        if (deleted) {
            asset.status = 'DELETED';
            asset.isDeleted = true;
        } else {
            const pendingProposal = await getPendingProposalForAsset(assetId);
            if (pendingProposal) {
                asset.hasPendingDeletion = true;
                asset.pendingDeletionProposal = pendingProposal;
            }
        }

        if (!(await canViewAsset(req.user, asset))) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        return sendSuccess(res, { asset });
    } catch (error) {
        console.error('Get asset error:', error);
        return handleControllerError(res, error, 'Unable to fetch asset');
    }
}

async function transferExistingAsset(req, res) {
    try {
        const { assetId } = req.params;
        const { newOwner } = req.body;

        if (!assetId) {
            return sendError(res, 400, 'assetId is required', 'BAD_REQUEST');
        }

        if (!newOwner) {
            return sendError(res, 400, 'newOwner is required', 'BAD_REQUEST');
        }

        assertSafeId(assetId, 'assetId');

        const deleted = await isAssetDeleted(assetId);
        if (deleted) {
            return sendError(res, 400, `Asset ${assetId} is decommissioned/deleted and cannot be transferred`, 'BAD_REQUEST');
        }

        const existing = await getAsset(assetId, req.user.organization);

        if (!canTransferAsset(req.user, existing)) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        const previousOwner = existing.owner;
        const asset = await transferAsset(
            assetId,
            newOwner,
            req.user.organization
        );

        recordFromRequest(req, {
            action: 'ASSET_TRANSFERRED',
            resourceType: 'asset',
            resourceId: assetId,
            success: true
        });

        createNotification({
            userId: previousOwner,
            type: 'ASSET_TRANSFERRED',
            title: 'Asset transferred',
            message: `Asset ${assetId} was transferred to ${newOwner}`,
            resourceType: 'asset',
            resourceId: assetId
        });

        createNotification({
            userId: newOwner,
            type: 'ASSET_TRANSFERRED',
            title: 'Asset received',
            message: `Asset ${assetId} was transferred to you`,
            resourceType: 'asset',
            resourceId: assetId
        });

        return sendSuccess(res, {
            message: 'Asset transferred successfully',
            asset
        });
    } catch (error) {
        console.error('Transfer asset error:', error);
        recordFromRequest(req, {
            action: 'ASSET_TRANSFERRED',
            resourceType: 'asset',
            resourceId: req.params.assetId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to transfer asset');
    }
}

async function uploadAssetDocument(req, res) {
    const { assetId } = req.params;
    let ipfsSucceeded = false;
    let fileData = null;

    try {
        assertSafeId(assetId, 'assetId');

        if (!req.file) {
            return sendError(res, 400, 'Document file is required', 'BAD_REQUEST');
        }

        if (!req.file.size) {
            return sendError(res, 400, 'Empty files are not allowed', 'BAD_REQUEST');
        }

        const asset = await getAsset(assetId, req.user.organization);

        if (!(await canModifyAssetDocument(req.user, asset))) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        if (asset.status !== 'ACTIVE') {
            return sendError(res, 409, `Asset ${assetId} is not ACTIVE`, 'CONFLICT');
        }

        fileData = await saveUploadedFile(req.file);
        ipfsSucceeded = true;

        let blockchain = {
            documentHashStored: false,
            documentCIDStored: false,
            updatedAsset: null
        };

        try {
            const updatedAsset = await updateAssetDocument(
                assetId,
                fileData.hash,
                fileData.cid,
                'BEL'
            );

            blockchain = {
                documentHashStored: true,
                documentCIDStored: true,
                updatedAsset
            };
        } catch (fabricError) {
            console.error('UpdateAssetDocument error:', fabricError);

            recordFromRequest(req, {
                action: 'ASSET_DOCUMENT_UPDATED',
                resourceType: 'asset',
                resourceId: assetId,
                success: false,
                message: fabricError.message
            });

            const unavailable = fabricError.code === 'CHAINCODE_FUNCTION_UNAVAILABLE';

            return res.status(unavailable ? 501 : 500).json({
                success: false,
                message: unavailable
                    ? 'Document uploaded to IPFS, but UpdateAssetDocument is not available on the deployed chaincode'
                    : 'Document uploaded to IPFS, but Fabric metadata update failed',
                errorCode: unavailable ? 'CHAINCODE_FUNCTION_UNAVAILABLE' : 'FABRIC_UPDATE_FAILED',
                assetId,
                ipfs: {
                    success: true,
                    cid: fileData.cid,
                    hash: fileData.hash
                },
                blockchain
            });
        }

        recordFromRequest(req, {
            action: 'ASSET_DOCUMENT_UPDATED',
            resourceType: 'asset',
            resourceId: assetId,
            success: true
        });

        return sendSuccess(res, {
            message: 'Document uploaded and asset metadata updated successfully',
            assetId,
            file: {
                hash: fileData.hash,
                cid: fileData.cid,
                size: fileData.size,
                mimeType: fileData.mimeType
            },
            blockchain
        });
    } catch (error) {
        console.error('Upload error:', error);
        recordFromRequest(req, {
            action: 'ASSET_DOCUMENT_UPDATED',
            resourceType: 'asset',
            resourceId: assetId,
            success: false,
            message: error.message
        });

        if (ipfsSucceeded) {
            return res.status(500).json({
                success: false,
                message: 'Document uploaded to IPFS, but a later step failed',
                errorCode: 'PARTIAL_SUCCESS',
                assetId,
                ipfs: {
                    success: true,
                    cid: fileData?.cid,
                    hash: fileData?.hash
                },
                blockchain: {
                    documentHashStored: false,
                    documentCIDStored: false
                }
            });
        }

        return handleControllerError(res, error, 'Unable to upload document');
    }
}

async function verifyAssetDocument(req, res) {
    try {
        const { assetId } = req.params;
        assertSafeId(assetId, 'assetId');

        const asset = await getAsset(assetId, req.user.organization);

        if (!(await canViewAsset(req.user, asset))) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        if (!asset.documentCID || !asset.documentHash) {
            return sendError(
                res,
                409,
                'Asset does not have document hash and CID metadata',
                'CONFLICT'
            );
        }

        const retrieved = await hashFromIpfs(asset.documentCID, asset.documentHash, assetId);
        const verified = retrieved.hash.toLowerCase() === asset.documentHash.toLowerCase();

        return sendSuccess(res, {
            verified,
            assetId,
            cid: asset.documentCID,
            blockchainHash: asset.documentHash,
            calculatedHash: retrieved.hash
        });
    } catch (error) {
        console.error('Verify document error:', error);
        return handleControllerError(res, error, 'Unable to verify document');
    }
}

async function downloadAssetDocument(req, res) {
    try {
        const { assetId } = req.params;
        assertSafeId(assetId, 'assetId');

        const asset = await getAsset(assetId, req.user.organization);

        if (!(await canDownloadAsset(req.user, asset))) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        if (!asset.documentCID && !asset.documentHash) {
            return sendError(res, 404, 'Asset has no document CID or hash', 'NOT_FOUND');
        }

        const buffer = await retrieveFromIpfs(asset.documentCID, asset.documentHash, assetId);

        // Detect extension and Content-Type from buffer magic bytes
        let ext = '.bin';
        let contentType = 'application/octet-stream';
        if (buffer && buffer.length >= 4) {
            if (buffer.subarray(0, 4).toString() === '%PDF') {
                ext = '.pdf';
                contentType = 'application/pdf';
            } else if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                ext = '.docx';
                contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                ext = '.png';
                contentType = 'image/png';
            } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                ext = '.jpg';
                contentType = 'image/jpeg';
            } else if (buffer.subarray(0, 5).toString().startsWith('===') || buffer.subarray(0, 5).toString().startsWith('Asset')) {
                ext = '.txt';
                contentType = 'text/plain';
            }
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${assetId}-document${ext}"`
        );
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        return res.status(200).send(buffer);
    } catch (error) {
        console.error('Download document error:', error);
        return handleControllerError(res, error, 'Unable to download document');
    }
}

async function fetchAssetHistory(req, res) {
    try {
        const { assetId } = req.params;
        assertSafeId(assetId, 'assetId');

        const asset = await getAsset(assetId, req.user.organization);

        if (!(await canViewAsset(req.user, asset))) {
            return sendError(res, 403, 'Access denied', 'FORBIDDEN');
        }

        const history = await getAssetHistory(assetId, req.user.organization);
        return sendSuccess(res, { assetId, history });
    } catch (error) {
        console.error('Asset history error:', error);
        return handleControllerError(res, error, 'Unable to fetch asset history');
    }
}

async function publicVerifyAsset(req, res) {
    try {
        const { assetId } = req.params;
        assertSafeId(assetId, 'assetId');

        const asset = await getAsset(assetId, 'BEL');
        let verified = false;
        let calculatedHash = null;

        if (asset.documentCID && asset.documentHash) {
            try {
                const retrieved = await hashFromIpfs(asset.documentCID, asset.documentHash, assetId);
                calculatedHash = retrieved.hash;
                verified = retrieved.hash.toLowerCase() === asset.documentHash.toLowerCase();
            } catch (ipfsError) {
                console.error('Public verify IPFS error:', ipfsError);
                verified = false;
            }
        }

        return sendSuccess(res, {
            asset: {
                assetId: asset.assetId,
                tokenId: asset.tokenId || asset.assetId,
                tokenStandard: asset.tokenStandard || 'CHAINCODER-NFT',
                name: asset.name,
                assetType: asset.assetType,
                status: asset.status,
                ownerOrganization: asset.ownerOrganization || null,
                owner: asset.owner,
                ownerDID: asset.ownerDID || (asset.owner && asset.ownerOrganization ? `did:chaincoder:${asset.ownerOrganization}:${asset.owner}` : null),
                documentHash: asset.documentHash || '',
                cid: asset.documentCID || '',
                createdAt: asset.createdAt,
                updatedAt: asset.updatedAt
            },
            verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED',
            verified,
            calculatedHash
        });
    } catch (error) {
        console.error('Public asset verify error:', error);
        return handleControllerError(res, error, 'Unable to verify asset');
    }
}

module.exports = {
    createAsset,
    fetchAsset,
    transferExistingAsset,
    uploadAssetDocument,
    verifyAssetDocument,
    downloadAssetDocument,
    fetchAssetHistory,
    publicVerifyAsset,
    publicAssetView
};
