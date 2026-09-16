'use strict';

const {
    createMintProposal,
    getMintProposals,
    getPendingMintProposals,
    getProposalById,
    approveProposal,
    rejectProposal
} = require('../services/mintProposalService');
const { recordFromRequest } = require('../services/auditLogService');
const { notifyRoles, createNotification } = require('../services/notificationService');
const { assertSafeId } = require('../services/authorizationService');
const { sendSuccess, sendError, handleControllerError } = require('../utils/errors');

/**
 * POST /api/assets/propose
 * BEL Admin / Manager submits a mint proposal (does NOT write to Fabric yet)
 */
async function proposeMint(req, res) {
    try {
        const { assetId, name, assetType, owner, documentHash, documentCID, reason } = req.body;

        if (!assetId || !name || !assetType || !owner || !documentHash || !documentCID) {
            return sendError(res, 400, 'assetId, name, assetType, owner, documentHash and documentCID are required', 'BAD_REQUEST');
        }

        assertSafeId(assetId, 'assetId');

        const proposal = await createMintProposal({
            proposedBy: req.user.userId,
            proposedByName: req.user.name || req.user.userId,
            assetId,
            name,
            assetType,
            owner,
            documentHash,
            documentCID,
            reason
        });

        recordFromRequest(req, {
            action: 'MINT_PROPOSED',
            resourceType: 'mint_proposal',
            resourceId: proposal.proposalId,
            success: true
        });

        // Notify Auditor org
        notifyRoles('Auditor', ['Auditor'], {
            type: 'MINT_PROPOSAL_PENDING',
            title: 'New Mint Proposal Awaiting Co-Approval',
            message: `BEL Admin ${req.user.userId} proposed minting asset "${name}" (${assetId}). Co-approval required.`,
            resourceType: 'mint_proposal',
            resourceId: proposal.proposalId
        });

        return sendSuccess(res, {
            message: 'Mint proposal submitted — awaiting Auditor co-approval before asset is written to Fabric',
            proposal
        }, 201);
    } catch (error) {
        console.error('Propose mint error:', error);
        recordFromRequest(req, {
            action: 'MINT_PROPOSED',
            resourceType: 'mint_proposal',
            resourceId: req.body?.assetId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to submit mint proposal');
    }
}

/**
 * GET /api/assets/proposals
 * BEL Admin / Manager views all proposals
 */
async function listMintProposals(req, res) {
    try {
        const proposals = await getMintProposals();
        return sendSuccess(res, { proposals });
    } catch (error) {
        console.error('List mint proposals error:', error);
        return handleControllerError(res, error, 'Unable to fetch mint proposals');
    }
}

/**
 * GET /api/assets/proposals/pending
 * Auditor views pending proposals
 */
async function listPendingMintProposals(req, res) {
    try {
        const proposals = await getPendingMintProposals();
        return sendSuccess(res, { proposals });
    } catch (error) {
        console.error('Pending mint proposals error:', error);
        return handleControllerError(res, error, 'Unable to fetch pending mint proposals');
    }
}

/**
 * POST /api/assets/proposals/:proposalId/approve
 * Auditor co-approves: calls Fabric MintAsset, then marks APPROVED
 */
async function auditorApproveMint(req, res) {
    try {
        const { proposalId } = req.params;
        const { proposal, asset } = await approveProposal(proposalId, req.user.userId);

        recordFromRequest(req, {
            action: 'MINT_APPROVED',
            resourceType: 'mint_proposal',
            resourceId: proposalId,
            success: true
        });

        // Notify BEL org
        notifyRoles('BEL', ['Admin', 'Manager'], {
            type: 'MINT_APPROVED',
            title: 'Mint Proposal Co-Approved',
            message: `Auditor ${req.user.userId} co-approved mint proposal for asset "${proposal.assetId}". Asset is now ACTIVE on Fabric.`,
            resourceType: 'asset',
            resourceId: proposal.assetId
        });

        // Notify the asset owner
        createNotification({
            userId: proposal.owner,
            type: 'ASSET_CREATED',
            title: 'Asset minted and now ACTIVE',
            message: `Asset ${proposal.assetId} was minted on-chain after Auditor co-approval.`,
            resourceType: 'asset',
            resourceId: proposal.assetId
        });

        return sendSuccess(res, {
            message: `Mint proposal co-approved. Asset ${proposal.assetId} is now ACTIVE on Hyperledger Fabric.`,
            proposal,
            asset
        });
    } catch (error) {
        console.error('Auditor approve mint error:', error);
        recordFromRequest(req, {
            action: 'MINT_APPROVED',
            resourceType: 'mint_proposal',
            resourceId: req.params.proposalId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to approve mint proposal');
    }
}

/**
 * POST /api/assets/proposals/:proposalId/reject
 * Auditor rejects — no Fabric call
 */
async function auditorRejectMint(req, res) {
    try {
        const { proposalId } = req.params;
        const { reason } = req.body;

        const proposal = await rejectProposal(proposalId, req.user.userId, reason);

        recordFromRequest(req, {
            action: 'MINT_REJECTED',
            resourceType: 'mint_proposal',
            resourceId: proposalId,
            success: true
        });

        notifyRoles('BEL', ['Admin', 'Manager'], {
            type: 'MINT_REJECTED',
            title: 'Mint Proposal Rejected',
            message: `Auditor ${req.user.userId} rejected mint proposal for asset "${proposal.assetId}". Reason: ${reason || 'None provided'}.`,
            resourceType: 'mint_proposal',
            resourceId: proposalId
        });

        return sendSuccess(res, {
            message: `Mint proposal ${proposalId} rejected. Asset will NOT be minted on Fabric.`,
            proposal
        });
    } catch (error) {
        console.error('Auditor reject mint error:', error);
        return handleControllerError(res, error, 'Unable to reject mint proposal');
    }
}

module.exports = {
    proposeMint,
    listMintProposals,
    listPendingMintProposals,
    auditorApproveMint,
    auditorRejectMint
};