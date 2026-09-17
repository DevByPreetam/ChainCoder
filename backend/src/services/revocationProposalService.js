'use strict';

const crypto = require('crypto');
const { query, isDbConnected } = require('../config/db');
const { revokeIdentity } = require('./fabricService');
const { revokeIdentityInCA } = require('./caService');
const { updateUserStatus } = require('./authService');
const { createNotification } = require('./notificationService');

let memProposals = [];

function rowToProposal(row) {
    return {
        proposalId: row.proposal_id,
        identityId: row.identity_id,
        organization: row.organization,
        proposedBy: row.proposed_by,
        proposedByName: row.proposed_by_name,
        reason: row.reason,
        status: row.status,
        auditorId: row.auditor_id,
        auditorAt: row.auditor_at,
        rejectionReason: row.rejection_reason,
        fabricTxId: row.fabric_tx_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function createRevocationProposal({ identityId, organization, proposedBy, proposedByName, reason }) {
    const proposalId = 'REV-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const now = new Date().toISOString();

    if (isDbConnected()) {
        const result = await query(
            `INSERT INTO revocation_proposals
                (proposal_id, identity_id, organization, proposed_by, proposed_by_name, reason, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $7)
             RETURNING *`,
            [proposalId, identityId, organization || null, proposedBy, proposedByName || null, reason, now]
        );
        return rowToProposal(result.rows[0]);
    }

    const proposal = {
        proposalId,
        identityId,
        organization: organization || null,
        proposedBy,
        proposedByName: proposedByName || null,
        reason,
        status: 'PENDING',
        auditorId: null,
        auditorAt: null,
        rejectionReason: null,
        fabricTxId: null,
        createdAt: now,
        updatedAt: now
    };
    memProposals.push(proposal);
    return proposal;
}

async function getRevocationProposals() {
    if (isDbConnected()) {
        const result = await query('SELECT * FROM revocation_proposals ORDER BY created_at DESC');
        return result.rows.map(rowToProposal);
    }
    return [...memProposals].reverse();
}

async function getPendingRevocationProposals() {
    if (isDbConnected()) {
        const result = await query("SELECT * FROM revocation_proposals WHERE status = 'PENDING' ORDER BY created_at ASC");
        return result.rows.map(rowToProposal);
    }
    return memProposals.filter(p => p.status === 'PENDING');
}

async function getRevocationProposalById(proposalId) {
    if (isDbConnected()) {
        const result = await query('SELECT * FROM revocation_proposals WHERE proposal_id = $1', [proposalId]);
        return result.rows.length ? rowToProposal(result.rows[0]) : null;
    }
    return memProposals.find(p => p.proposalId === proposalId) || null;
}

async function getPendingProposalByIdentityId(identityId) {
    if (isDbConnected()) {
        const result = await query("SELECT * FROM revocation_proposals WHERE identity_id = $1 AND status = 'PENDING'", [identityId]);
        return result.rows.length ? rowToProposal(result.rows[0]) : null;
    }
    return memProposals.find(p => p.identityId === identityId && p.status === 'PENDING') || null;
}

async function approveRevocationProposal(proposalId, auditorId) {
    const proposal = await getRevocationProposalById(proposalId);
    if (!proposal) throw new Error('Revocation proposal ' + proposalId + ' not found');
    if (proposal.status !== 'PENDING') {
        throw new Error('Proposal ' + proposalId + ' is not PENDING (current: ' + proposal.status + ')');
    }

    // 1. Submit RevokeIdentity transaction to Fabric
    // Submits from BEL identity, enforced with endorsingOrganizations: ['BELMSP', 'AuditorMSP']
    const identityResult = await revokeIdentity(proposal.identityId, 'BEL');

    // 2. Revoke in Fabric CA
    let caRevocation = null;
    try {
        caRevocation = await revokeIdentityInCA({
            organization: proposal.organization || 'BEL',
            identityId: proposal.identityId,
            reason: 'cessationofoperation'
        });
    } catch (caErr) {
        console.warn('Fabric CA revocation notice:', caErr.message);
    }

    // 3. Update application user status
    await updateUserStatus(proposal.identityId, 'REVOKED');

    const now = new Date().toISOString();
    const fabricTxId = (identityResult && (identityResult.txId || identityResult.transactionId)) || null;

    if (isDbConnected()) {
        const result = await query(
            `UPDATE revocation_proposals
             SET status='APPROVED', auditor_id=$1, auditor_at=$2, fabric_tx_id=$3, updated_at=$2
             WHERE proposal_id=$4
             RETURNING *`,
            [auditorId, now, fabricTxId, proposalId]
        );
        return { proposal: rowToProposal(result.rows[0]), identity: identityResult, ca: caRevocation };
    }

    const idx = memProposals.findIndex(p => p.proposalId === proposalId);
    if (idx !== -1) {
        memProposals[idx] = {
            ...memProposals[idx],
            status: 'APPROVED',
            auditorId,
            auditorAt: now,
            fabricTxId,
            updatedAt: now
        };
    }
    return { proposal: memProposals[idx], identity: identityResult, ca: caRevocation };
}

async function rejectRevocationProposal(proposalId, auditorId, rejectionReason) {
    const proposal = await getRevocationProposalById(proposalId);
    if (!proposal) throw new Error('Revocation proposal ' + proposalId + ' not found');
    if (proposal.status !== 'PENDING') {
        throw new Error('Proposal ' + proposalId + ' is not PENDING (current: ' + proposal.status + ')');
    }

    const now = new Date().toISOString();

    if (isDbConnected()) {
        const result = await query(
            `UPDATE revocation_proposals
             SET status='REJECTED', auditor_id=$1, auditor_at=$2, rejection_reason=$3, updated_at=$2
             WHERE proposal_id=$4
             RETURNING *`,
            [auditorId, now, rejectionReason || null, proposalId]
        );
        return rowToProposal(result.rows[0]);
    }

    const idx = memProposals.findIndex(p => p.proposalId === proposalId);
    if (idx !== -1) {
        memProposals[idx] = {
            ...memProposals[idx],
            status: 'REJECTED',
            auditorId,
            auditorAt: now,
            rejectionReason: rejectionReason || null,
            updatedAt: now
        };
    }
    return memProposals[idx];
}

module.exports = {
    createRevocationProposal,
    getRevocationProposals,
    getPendingRevocationProposals,
    getRevocationProposalById,
    getPendingProposalByIdentityId,
    approveRevocationProposal,
    rejectRevocationProposal
};
