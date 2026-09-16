'use strict';

const crypto = require('crypto');
const { query, isDbConnected } = require('../config/db');
const { mintAsset } = require('./assetService');

let memProposals = [];

function rowToProposal(row) {
    return {
        proposalId: row.proposal_id,
        proposedBy: row.proposed_by,
        proposedByName: row.proposed_by_name,
        assetId: row.asset_id,
        name: row.name,
        assetType: row.asset_type,
        owner: row.owner,
        documentHash: row.document_hash,
        documentCID: row.document_cid,
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

async function createMintProposal({ proposedBy, proposedByName, assetId, name, assetType, owner, documentHash, documentCID, reason }) {
    const proposalId = 'MINT-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const now = new Date().toISOString();

    if (isDbConnected()) {
        const result = await query(
            `INSERT INTO mint_proposals
                (proposal_id, proposed_by, proposed_by_name, asset_id, name, asset_type, owner, document_hash, document_cid, reason, status, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$11,$11)
             RETURNING *`,
            [proposalId, proposedBy, proposedByName, assetId, name, assetType, owner, documentHash, documentCID, reason || null, now]
        );
        return rowToProposal(result.rows[0]);
    }

    const proposal = {
        proposalId, proposedBy, proposedByName, assetId, name, assetType, owner,
        documentHash, documentCID, reason: reason || null,
        status: 'PENDING', auditorId: null, auditorAt: null,
        rejectionReason: null, fabricTxId: null,
        createdAt: now, updatedAt: now
    };
    memProposals.push(proposal);
    return proposal;
}

async function getMintProposals() {
    if (isDbConnected()) {
        const result = await query('SELECT * FROM mint_proposals ORDER BY created_at DESC');
        return result.rows.map(rowToProposal);
    }
    return [...memProposals].reverse();
}

async function getPendingMintProposals() {
    if (isDbConnected()) {
        const result = await query("SELECT * FROM mint_proposals WHERE status = 'PENDING' ORDER BY created_at ASC");
        return result.rows.map(rowToProposal);
    }
    return memProposals.filter(p => p.status === 'PENDING');
}

async function getProposalById(proposalId) {
    if (isDbConnected()) {
        const result = await query('SELECT * FROM mint_proposals WHERE proposal_id = $1', [proposalId]);
        if (result.rows.length === 0) return null;
        return rowToProposal(result.rows[0]);
    }
    return memProposals.find(p => p.proposalId === proposalId) || null;
}

async function approveProposal(proposalId, auditorId) {
    const proposal = await getProposalById(proposalId);
    if (!proposal) throw new Error('Mint proposal ' + proposalId + ' not found');
    if (proposal.status !== 'PENDING') {
        throw new Error('Proposal ' + proposalId + ' is not PENDING (current: ' + proposal.status + ')');
    }

    let finalCID = proposal.documentCID;
    if (!finalCID || finalCID.includes('pending')) {
        try {
            const { ensureIpfsPinForHash } = require('./fileService');
            const resolvedCid = await ensureIpfsPinForHash(proposal.documentHash);
            if (resolvedCid) {
                finalCID = resolvedCid;
            }
        } catch (pinErr) {
            console.warn('Could not auto-pin CID for proposal:', pinErr.message);
        }
    }

    const asset = await mintAsset(
        'BEL',
        proposal.assetId,
        proposal.name,
        proposal.assetType,
        proposal.owner,
        proposal.documentHash,
        finalCID || 'pending-ipfs-upload'
    );

    const now = new Date().toISOString();
    const fabricTxId = (asset && (asset.txId || asset.transactionId)) || null;

    if (isDbConnected()) {
        const result = await query(
            `UPDATE mint_proposals
             SET status='APPROVED', auditor_id=$1, auditor_at=$2, fabric_tx_id=$3, updated_at=$2
             WHERE proposal_id=$4
             RETURNING *`,
            [auditorId, now, fabricTxId, proposalId]
        );
        return { proposal: rowToProposal(result.rows[0]), asset };
    }

    const idx = memProposals.findIndex(p => p.proposalId === proposalId);
    if (idx !== -1) {
        memProposals[idx] = { ...memProposals[idx], status: 'APPROVED', auditorId, auditorAt: now, fabricTxId, updatedAt: now };
    }
    return { proposal: memProposals[idx], asset };
}

async function rejectProposal(proposalId, auditorId, rejectionReason) {
    const proposal = await getProposalById(proposalId);
    if (!proposal) throw new Error('Mint proposal ' + proposalId + ' not found');
    if (proposal.status !== 'PENDING') {
        throw new Error('Proposal ' + proposalId + ' is not PENDING (current: ' + proposal.status + ')');
    }

    const now = new Date().toISOString();

    if (isDbConnected()) {
        const result = await query(
            `UPDATE mint_proposals
             SET status='REJECTED', auditor_id=$1, auditor_at=$2, rejection_reason=$3, updated_at=$2
             WHERE proposal_id=$4
             RETURNING *`,
            [auditorId, now, rejectionReason || null, proposalId]
        );
        return rowToProposal(result.rows[0]);
    }

    const idx = memProposals.findIndex(p => p.proposalId === proposalId);
    if (idx !== -1) {
        memProposals[idx] = { ...memProposals[idx], status: 'REJECTED', auditorId, auditorAt: now, rejectionReason: rejectionReason || null, updatedAt: now };
    }
    return memProposals[idx];
}

module.exports = {
    createMintProposal,
    getMintProposals,
    getPendingMintProposals,
    getProposalById,
    approveProposal,
    rejectProposal
};