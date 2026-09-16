'use strict';

const crypto = require('crypto');
const { query, isDbConnected } = require('../config/db');

let memDeletionProposals = [];

function rowToProposal(row) {
    return {
        proposalId: row.proposal_id,
        assetId: row.asset_id,
        assetName: row.asset_name,
        assetType: row.asset_type,
        owner: row.owner,
        proposedBy: row.proposed_by,
        proposedByName: row.proposed_by_name,
        reason: row.reason,
        status: row.status,
        auditorId: row.auditor_id,
        auditorAt: row.auditor_at,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function getPendingProposalForAsset(assetId) {
    if (isDbConnected()) {
        const result = await query(
            "SELECT * FROM asset_deletion_proposals WHERE asset_id = $1 AND status = 'PENDING' LIMIT 1",
            [assetId]
        );
        if (result.rows.length > 0) {
            return rowToProposal(result.rows[0]);
        }
        return null;
    }
    return memDeletionProposals.find(p => p.assetId === assetId && p.status === 'PENDING') || null;
}

async function isAssetDeleted(assetId) {
    if (isDbConnected()) {
        const result = await query(
            "SELECT * FROM asset_deletion_proposals WHERE asset_id = $1 AND status = 'APPROVED' LIMIT 1",
            [assetId]
        );
        return result.rows.length > 0;
    }
    return memDeletionProposals.some(p => p.assetId === assetId && p.status === 'APPROVED');
}

async function createDeletionProposal({ proposedBy, proposedByName, assetId, assetName, assetType, owner, reason }) {
    if (!reason || !reason.trim()) {
        throw new Error('A valid reason for deletion is mandatory.');
    }

    const alreadyPending = await getPendingProposalForAsset(assetId);
    if (alreadyPending) {
        throw new Error(`A deletion proposal (${alreadyPending.proposalId}) is already pending Auditor co-approval for asset ${assetId}.`);
    }

    const alreadyDeleted = await isAssetDeleted(assetId);
    if (alreadyDeleted) {
        throw new Error(`Asset ${assetId} has already been decommissioned and deleted.`);
    }

    const proposalId = 'DEL-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const now = new Date().toISOString();

    if (isDbConnected()) {
        const result = await query(
            `INSERT INTO asset_deletion_proposals
                (proposal_id, asset_id, asset_name, asset_type, owner, proposed_by, proposed_by_name, reason, status, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$9)
             RETURNING *`,
            [proposalId, assetId, assetName || assetId, assetType || 'DEFENSE_ASSET', owner || 'BEL', proposedBy, proposedByName || proposedBy, reason.trim(), now]
        );
        return rowToProposal(result.rows[0]);
    }

    const proposal = {
        proposalId,
        assetId,
        assetName: assetName || assetId,
        assetType: assetType || 'DEFENSE_ASSET',
        owner: owner || 'BEL',
        proposedBy,
        proposedByName: proposedByName || proposedBy,
        reason: reason.trim(),
        status: 'PENDING',
        auditorId: null,
        auditorAt: null,
        rejectionReason: null,
        createdAt: now,
        updatedAt: now
    };
    memDeletionProposals.push(proposal);
    return proposal;
}

async function getDeletionProposals() {
    if (isDbConnected()) {
        const result = await query('SELECT * FROM asset_deletion_proposals ORDER BY created_at DESC');
        return result.rows.map(rowToProposal);
    }
    return [...memDeletionProposals].reverse();
}

async function getPendingDeletionProposals() {
    if (isDbConnected()) {
        const result = await query("SELECT * FROM asset_deletion_proposals WHERE status = 'PENDING' ORDER BY created_at ASC");
        return result.rows.map(rowToProposal);
    }
    return memDeletionProposals.filter(p => p.status === 'PENDING');
}

async function getDeletionProposalById(proposalId) {
    if (isDbConnected()) {
        const result = await query('SELECT * FROM asset_deletion_proposals WHERE proposal_id = $1', [proposalId]);
        if (result.rows.length === 0) return null;
        return rowToProposal(result.rows[0]);
    }
    return memDeletionProposals.find(p => p.proposalId === proposalId) || null;
}

async function approveDeletionProposal(proposalId, auditorId) {
    const proposal = await getDeletionProposalById(proposalId);
    if (!proposal) throw new Error(`Deletion proposal ${proposalId} not found`);
    if (proposal.status !== 'PENDING') {
        throw new Error(`Deletion proposal ${proposalId} is not PENDING (current status: ${proposal.status})`);
    }

    const now = new Date().toISOString();

    if (isDbConnected()) {
        const result = await query(
            `UPDATE asset_deletion_proposals
             SET status = 'APPROVED', auditor_id = $1, auditor_at = $2, updated_at = $2
             WHERE proposal_id = $3
             RETURNING *`,
            [auditorId, now, proposalId]
        );

        // Mark in mint_proposals if present
        await query(
            `UPDATE mint_proposals
             SET status = 'DELETED', updated_at = $1
             WHERE asset_id = $2`,
            [now, proposal.assetId]
        );

        return rowToProposal(result.rows[0]);
    }

    const idx = memDeletionProposals.findIndex(p => p.proposalId === proposalId);
    if (idx !== -1) {
        memDeletionProposals[idx] = {
            ...memDeletionProposals[idx],
            status: 'APPROVED',
            auditorId,
            auditorAt: now,
            updatedAt: now
        };
        return memDeletionProposals[idx];
    }
    return proposal;
}

async function rejectDeletionProposal(proposalId, auditorId, rejectionReason) {
    const proposal = await getDeletionProposalById(proposalId);
    if (!proposal) throw new Error(`Deletion proposal ${proposalId} not found`);
    if (proposal.status !== 'PENDING') {
        throw new Error(`Deletion proposal ${proposalId} is not PENDING (current status: ${proposal.status})`);
    }

    const now = new Date().toISOString();

    if (isDbConnected()) {
        const result = await query(
            `UPDATE asset_deletion_proposals
             SET status = 'REJECTED', auditor_id = $1, auditor_at = $2, rejection_reason = $3, updated_at = $2
             WHERE proposal_id = $4
             RETURNING *`,
            [auditorId, now, rejectionReason || null, proposalId]
        );
        return rowToProposal(result.rows[0]);
    }

    const idx = memDeletionProposals.findIndex(p => p.proposalId === proposalId);
    if (idx !== -1) {
        memDeletionProposals[idx] = {
            ...memDeletionProposals[idx],
            status: 'REJECTED',
            auditorId,
            auditorAt: now,
            rejectionReason: rejectionReason || null,
            updatedAt: now
        };
        return memDeletionProposals[idx];
    }
    return proposal;
}

module.exports = {
    createDeletionProposal,
    getDeletionProposals,
    getPendingDeletionProposals,
    getDeletionProposalById,
    getPendingProposalForAsset,
    isAssetDeleted,
    approveDeletionProposal,
    rejectDeletionProposal
};
