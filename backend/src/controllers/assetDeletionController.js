'use strict';

const {
    createDeletionProposal,
    getDeletionProposals,
    getPendingDeletionProposals,
    approveDeletionProposal,
    rejectDeletionProposal
} = require('../services/assetDeletionService');
const { getAsset } = require('../services/assetService');
const { recordFromRequest } = require('../services/auditLogService');
const { notifyRoles, createNotification } = require('../services/notificationService');
const { assertSafeId } = require('../services/authorizationService');
const { sendSuccess, sendError, handleControllerError } = require('../utils/errors');

/**
 * POST /api/assets/:assetId/propose-delete
 * BEL Admin/Manager submits asset deletion proposal (requires Auditor co-approval)
 */
async function proposeAssetDeletion(req, res) {
    try {
        const { assetId } = req.params;
        const { reason } = req.body;

        if (!assetId) {
            return sendError(res, 400, 'assetId is required', 'BAD_REQUEST');
        }

        if (!reason || !reason.trim()) {
            return sendError(res, 400, 'A clear reason for asset deletion is required', 'BAD_REQUEST');
        }

        assertSafeId(assetId, 'assetId');

        // Fetch current asset details if available to capture metadata
        let assetName = assetId;
        let assetType = 'DEFENSE_ASSET';
        let owner = req.user.userId;

        try {
            const currentAsset = await getAsset(assetId, req.user.organization || 'BEL');
            if (currentAsset) {
                assetName = currentAsset.name || assetName;
                assetType = currentAsset.assetType || assetType;
                owner = currentAsset.owner || owner;
            }
        } catch {
            // Proceed with defaults if ledger lookup is partial
        }

        const proposal = await createDeletionProposal({
            proposedBy: req.user.userId,
            proposedByName: req.user.name || req.user.userId,
            assetId,
            assetName,
            assetType,
            owner,
            reason
        });

        recordFromRequest(req, {
            action: 'ASSET_DELETION_PROPOSED',
            resourceType: 'asset',
            resourceId: assetId,
            success: true,
            message: `Deletion proposal created: ${reason}`
        });

        // Notify Auditor organization for co-approval
        notifyRoles('Auditor', ['Auditor'], {
            type: 'ASSET_DELETION_PENDING',
            title: 'Asset Deletion Awaiting Co-Approval',
            message: `BEL Admin ${req.user.userId} requested deletion of asset "${assetName}" (${assetId}). Mandatory co-approval required.`,
            resourceType: 'asset_deletion_proposal',
            resourceId: proposal.proposalId
        });

        return sendSuccess(res, {
            message: `Deletion proposal submitted for ${assetId}. Awaiting Auditor co-approval.`,
            proposal
        }, 201);
    } catch (error) {
        console.error('Propose asset deletion error:', error);
        recordFromRequest(req, {
            action: 'ASSET_DELETION_PROPOSED',
            resourceType: 'asset',
            resourceId: req.params?.assetId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to submit deletion proposal');
    }
}

/**
 * GET /api/assets/deletion-proposals
 * Fetch all deletion proposals
 */
async function listDeletionProposals(req, res) {
    try {
        const proposals = await getDeletionProposals();
        return sendSuccess(res, { proposals });
    } catch (error) {
        console.error('List deletion proposals error:', error);
        return handleControllerError(res, error, 'Unable to fetch deletion proposals');
    }
}

/**
 * GET /api/assets/deletion-proposals/pending
 * Auditor fetches pending deletion proposals
 */
async function listPendingDeletionProposals(req, res) {
    try {
        const proposals = await getPendingDeletionProposals();
        return sendSuccess(res, { proposals });
    } catch (error) {
        console.error('List pending deletion proposals error:', error);
        return handleControllerError(res, error, 'Unable to fetch pending deletion proposals');
    }
}

/**
 * POST /api/assets/deletion-proposals/:proposalId/approve
 * Auditor co-approves deletion -> updates asset state to DELETED
 */
async function auditorApproveDeletion(req, res) {
    try {
        const { proposalId } = req.params;
        const proposal = await approveDeletionProposal(proposalId, req.user.userId);

        recordFromRequest(req, {
            action: 'ASSET_DELETED',
            resourceType: 'asset',
            resourceId: proposal.assetId,
            success: true,
            message: `Asset deletion co-approved by Auditor ${req.user.userId}`
        });

        // Notify BEL Administrators
        notifyRoles('BEL', ['Admin', 'Manager'], {
            type: 'ASSET_DELETED',
            title: 'Asset Deletion Co-Approved',
            message: `Auditor ${req.user.userId} co-approved deletion of asset "${proposal.assetName}" (${proposal.assetId}). Asset is now DECOMMISSIONED/DELETED.`,
            resourceType: 'asset',
            resourceId: proposal.assetId
        });

        // Notify Asset Owner
        if (proposal.owner) {
            createNotification({
                userId: proposal.owner,
                type: 'ASSET_DELETED',
                title: 'Asset Decommissioned',
                message: `Asset ${proposal.assetId} has been co-approved for deletion and decommissioned.`,
                resourceType: 'asset',
                resourceId: proposal.assetId
            });
        }

        return sendSuccess(res, {
            message: `Asset ${proposal.assetId} deletion co-approved and decommissioned.`,
            proposal
        });
    } catch (error) {
        console.error('Auditor approve deletion error:', error);
        recordFromRequest(req, {
            action: 'ASSET_DELETION_APPROVED',
            resourceType: 'asset_deletion_proposal',
            resourceId: req.params?.proposalId,
            success: false,
            message: error.message
        });
        return handleControllerError(res, error, 'Unable to approve deletion proposal');
    }
}

/**
 * POST /api/assets/deletion-proposals/:proposalId/reject
 * Auditor rejects deletion -> asset remains active
 */
async function auditorRejectDeletion(req, res) {
    try {
        const { proposalId } = req.params;
        const { reason } = req.body;

        const proposal = await rejectDeletionProposal(proposalId, req.user.userId, reason);

        recordFromRequest(req, {
            action: 'ASSET_DELETION_REJECTED',
            resourceType: 'asset_deletion_proposal',
            resourceId: proposalId,
            success: true,
            message: `Deletion proposal rejected by Auditor: ${reason || 'No reason specified'}`
        });

        notifyRoles('BEL', ['Admin', 'Manager'], {
            type: 'ASSET_DELETION_REJECTED',
            title: 'Asset Deletion Rejected',
            message: `Auditor ${req.user.userId} rejected deletion of asset ${proposal.assetId}. Reason: ${reason || 'None provided'}. Asset remains active.`,
            resourceType: 'asset',
            resourceId: proposal.assetId
        });

        return sendSuccess(res, {
            message: `Asset deletion proposal rejected. Asset ${proposal.assetId} remains active.`,
            proposal
        });
    } catch (error) {
        console.error('Auditor reject deletion error:', error);
        return handleControllerError(res, error, 'Unable to reject deletion proposal');
    }
}

module.exports = {
    proposeAssetDeletion,
    listDeletionProposals,
    listPendingDeletionProposals,
    auditorApproveDeletion,
    auditorRejectDeletion
};
