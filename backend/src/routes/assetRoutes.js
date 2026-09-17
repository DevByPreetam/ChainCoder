'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { ALLOWED_MIME_TYPES, saveUploadedFile } = require('../services/fileService');

const {
    createAsset,
    fetchAsset,
    transferExistingAsset,
    uploadAssetDocument,
    verifyAssetDocument,
    downloadAssetDocument,
    fetchAssetHistory
} = require('../controllers/assetController');

const {
    proposeMint,
    listMintProposals,
    listPendingMintProposals,
    auditorApproveMint,
    auditorRejectMint
} = require('../controllers/mintProposalController');

const {
    proposeAssetDeletion,
    listDeletionProposals,
    listPendingDeletionProposals,
    auditorApproveDeletion,
    auditorRejectDeletion
} = require('../controllers/assetDeletionController');

const {
    authenticate,
    authorizeOrganization,
    authorizeOrganizationRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const safeExtension = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.doc', '.docx'].includes(extension)
            ? extension
            : '';
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExtension}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.originalname && (file.originalname.includes('..') || file.originalname.includes('\0'))) {
            cb(new Error('Invalid file name'));
            return;
        }

        if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(new Error('Unsupported file type'));
            return;
        }

        cb(null, true);
    }
});

// POST /api/assets — now submits a mint proposal (Auditor must co-approve before Fabric write)
router.post(
    '/',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    proposeMint
);

// POST /api/assets/ipfs/upload — Upload document to IPFS prior to minting
router.post(
    '/ipfs/upload',
    authenticate,
    (req, res, next) => {
        upload.single('document')(req, res, (error) => {
            if (!error) return next();
            res.status(400).json({ success: false, message: error.message || 'Upload failed' });
        });
    },
    async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, message: 'Document file is required' });
            const fileData = await saveUploadedFile(req.file);
            return res.status(200).json({
                success: true,
                message: 'Document successfully pinned to IPFS',
                data: {
                    cid: fileData.cid,
                    hash: fileData.hash,
                    size: fileData.size,
                    mimeType: fileData.mimeType,
                    fileName: fileData.originalName || fileData.fileName
                }
            });
        } catch (error) {
            console.error('IPFS upload error:', error);
            return res.status(500).json({ success: false, message: error.message || 'IPFS upload failed' });
        }
    }
);

// GET /api/assets/proposals — BEL Admin/Manager views all proposals
router.get(
    '/proposals',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    listMintProposals
);

// GET /api/assets/proposals/pending — Auditor views pending proposals
router.get(
    '/proposals/pending',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    listPendingMintProposals
);

// POST /api/assets/proposals/:proposalId/approve — Auditor co-approves (triggers Fabric MintAsset)
router.post(
    '/proposals/:proposalId/approve',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    auditorApproveMint
);

// POST /api/assets/proposals/:proposalId/reject — Auditor rejects (no Fabric call)
router.post(
    '/proposals/:proposalId/reject',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    auditorRejectMint
);

// ─── Asset Deletion Proposals (Auditor Co-Approval) ─────────────────────────

// GET /api/assets/deletion-proposals — List all deletion proposals (BEL & Auditor)
router.get(
    '/deletion-proposals',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'BEL', roles: ['Admin', 'Manager'] },
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    listDeletionProposals
);

// GET /api/assets/deletion-proposals/pending — Auditor pending deletion proposals
router.get(
    '/deletion-proposals/pending',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    listPendingDeletionProposals
);

// POST /api/assets/deletion-proposals/:proposalId/approve — Auditor co-approves deletion
router.post(
    '/deletion-proposals/:proposalId/approve',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    auditorApproveDeletion
);

// POST /api/assets/deletion-proposals/:proposalId/reject — Auditor rejects deletion
router.post(
    '/deletion-proposals/:proposalId/reject',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'Auditor', roles: ['Auditor'] }
    ),
    auditorRejectDeletion
);

// POST /api/assets/:assetId/propose-delete — BEL Admin/Manager proposes deletion
router.post(
    '/:assetId/propose-delete',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    proposeAssetDeletion
);

router.post(
    '/:assetId/upload',
    authenticate,
    authorizeOrganization('BEL', 'Admin', 'Manager'),
    (req, res, next) => {
        upload.single('document')(req, res, (error) => {
            if (!error) {
                next();
                return;
            }

            const message = error.message || 'Upload failed';
            const status = message.includes('File too large') ? 400 : 400;
            res.status(status).json({
                success: false,
                message,
                errorCode: 'BAD_REQUEST'
            });
        });
    },
    uploadAssetDocument
);

router.get(
    '/:assetId/verify',
    authenticate,
    verifyAssetDocument
);

router.get(
    '/:assetId/document',
    authenticate,
    downloadAssetDocument
);

router.get(
    '/:assetId/history',
    authenticate,
    fetchAssetHistory
);

router.get(
    '/:assetId',
    authenticate,
    fetchAsset
);

router.patch(
    '/:assetId/transfer',
    authenticate,
    authorizeOrganizationRoles(
        { organization: 'BEL', roles: ['Admin'] },
        { organization: 'Contractor', roles: ['Admin', 'User'] },
        { organization: 'Auditor', roles: ['Auditor', 'Admin'] }
    ),
    transferExistingAsset
);

module.exports = router;
