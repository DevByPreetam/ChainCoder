'use strict';

const crypto = require('crypto');
const { query, isDbConnected } = require('../config/db');

const logs = [];
const identityIds = new Set();
const assetIds = new Set();
const accessKeys = new Set();

function rememberResource({ resourceType, resourceId }) {
    if (!resourceType || !resourceId) {
        return;
    }

    if (resourceType === 'identity') {
        identityIds.add(resourceId);
    }

    if (resourceType === 'asset') {
        assetIds.add(resourceId);
    }

    if (resourceType === 'access') {
        accessKeys.add(resourceId);
    }
}

async function loadAuditLogsFromDb() {
    if (!isDbConnected()) return;
    try {
        const res = await query(`
            SELECT 
                id,
                user_id AS "userId",
                organization,
                role,
                action,
                resource_type AS "resourceType",
                resource_id AS "resourceId",
                success,
                transaction_id AS "transactionId",
                ip_address AS "ipAddress",
                message,
                timestamp
            FROM audit_logs
            ORDER BY timestamp DESC
            LIMIT 1000
        `);

        for (const row of res.rows) {
            if (!logs.some(l => l.id === row.id)) {
                logs.push(row);
                rememberResource(row);
            }
        }
    } catch (err) {
        console.warn('Failed to load audit logs from DB:', err.message);
    }
}

setTimeout(loadAuditLogsFromDb, 1500);

function recordAuditLog({
    userId,
    organization,
    role,
    action,
    resourceType,
    resourceId,
    success,
    transactionId,
    ipAddress,
    message
}) {
    const entry = {
        id: `AUD-${crypto.randomUUID()}`,
        userId: userId || null,
        organization: organization || null,
        role: role || null,
        action,
        resourceType: resourceType || null,
        resourceId: resourceId || null,
        success: Boolean(success),
        transactionId: transactionId || null,
        ipAddress: ipAddress || null,
        message: message || null,
        timestamp: new Date().toISOString()
    };

    logs.push(entry);
    rememberResource(entry);

    if (isDbConnected()) {
        query(
            `INSERT INTO audit_logs (
                id, user_id, organization, role, action, resource_type,
                resource_id, success, transaction_id, ip_address, message, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                entry.id,
                entry.userId,
                entry.organization,
                entry.role,
                entry.action,
                entry.resourceType,
                entry.resourceId,
                entry.success,
                entry.transactionId,
                entry.ipAddress,
                entry.message,
                entry.timestamp
            ]
        ).catch(err => console.error('Failed to persist audit log to DB:', err.message));
    }

    return entry;
}

function recordFromRequest(req, details) {
    return recordAuditLog({
        userId: req.user?.userId,
        organization: req.user?.organization,
        role: req.user?.role,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
        ...details
    });
}

function getAuditLogs(filters = {}) {
    return logs.filter((entry) => {
        if (filters.action && entry.action !== filters.action) {
            return false;
        }

        if (filters.resourceType && entry.resourceType !== filters.resourceType) {
            return false;
        }

        if (filters.organization && entry.organization !== filters.organization) {
            return false;
        }

        return true;
    });
}

function getKnownIdentityIds() {
    return Array.from(identityIds);
}

function getKnownAssetIds() {
    return Array.from(assetIds);
}

function getKnownAccessKeys() {
    return Array.from(accessKeys);
}

function accessResourceId(identityId, assetId) {
    return `${identityId}:${assetId}`;
}

function escapeCsvField(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);

    if (
        stringValue.includes(',') ||
        stringValue.includes('"') ||
        stringValue.includes('\n')
    ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

function toCsv(entries) {
    const headers = [
        'id',
        'timestamp',
        'userId',
        'organization',
        'role',
        'action',
        'resourceType',
        'resourceId',
        'success',
        'transactionId',
        'ipAddress',
        'message'
    ];

    const rows = entries.map((entry) =>
        headers.map((header) => escapeCsvField(entry[header])).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
}

module.exports = {
    recordAuditLog,
    recordFromRequest,
    getAuditLogs,
    getKnownIdentityIds,
    getKnownAssetIds,
    getKnownAccessKeys,
    accessResourceId,
    toCsv,
    loadAuditLogsFromDb
};
