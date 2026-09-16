'use strict';

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool = null;
let isConnected = false;

function getPool() {
    if (!pool && process.env.DB_URL) {
        pool = new Pool({
            connectionString: process.env.DB_URL,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            max: 20
        });

        pool.on('error', (err) => {
            console.error('Unexpected error on idle PostgreSQL client', err);
        });
    }
    return pool;
}

async function query(text, params) {
    const p = getPool();
    if (!p) {
        throw new Error('Database pool not initialized. DB_URL is missing.');
    }
    return p.query(text, params);
}

function isDbConnected() {
    return isConnected;
}

async function initDb() {
    try {
        const p = getPool();
        if (!p) {
            console.warn('DB_URL not configured; running with in-memory stores.');
            return false;
        }

        const client = await p.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    user_id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    organization VARCHAR(50) NOT NULL,
                    role VARCHAR(50) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    status VARCHAR(30) DEFAULT 'ACTIVE',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );

                ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ACTIVE';
                UPDATE users SET status = 'ACTIVE' WHERE status IS NULL;

                CREATE TABLE IF NOT EXISTS access_requests (
                    request_id VARCHAR(100) PRIMARY KEY,
                    requester_id VARCHAR(50) NOT NULL,
                    requester_name VARCHAR(100),
                    organization VARCHAR(50) NOT NULL,
                    identity_id VARCHAR(50) NOT NULL,
                    asset_id VARCHAR(100) NOT NULL,
                    permission VARCHAR(20) NOT NULL,
                    reason TEXT,
                    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
                    approved_by VARCHAR(50),
                    approved_at TIMESTAMPTZ,
                    auditor_approved_by VARCHAR(50),
                    auditor_approved_at TIMESTAMPTZ,
                    rejected_by VARCHAR(50),
                    rejection_reason TEXT,
                    rejected_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );

                CREATE TABLE IF NOT EXISTS notifications (
                    id VARCHAR(100) PRIMARY KEY,
                    user_id VARCHAR(50) NOT NULL,
                    organization VARCHAR(50),
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT,
                    resource_type VARCHAR(50),
                    resource_id VARCHAR(100),
                    read BOOLEAN DEFAULT FALSE,
                    read_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id VARCHAR(100) PRIMARY KEY,
                    user_id VARCHAR(50),
                    organization VARCHAR(50),
                    role VARCHAR(50),
                    action VARCHAR(50) NOT NULL,
                    resource_type VARCHAR(50),
                    resource_id VARCHAR(100),
                    success BOOLEAN NOT NULL DEFAULT TRUE,
                    transaction_id VARCHAR(255),
                    ip_address VARCHAR(50),
                    message TEXT,
                    timestamp TIMESTAMPTZ NOT NULL
                );

                CREATE TABLE IF NOT EXISTS mint_proposals (
                    proposal_id VARCHAR(100) PRIMARY KEY,
                    proposed_by VARCHAR(50) NOT NULL,
                    proposed_by_name VARCHAR(100),
                    asset_id VARCHAR(100) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    asset_type VARCHAR(100) NOT NULL,
                    owner VARCHAR(100) NOT NULL,
                    document_hash VARCHAR(255) NOT NULL,
                    document_cid VARCHAR(255) NOT NULL,
                    reason TEXT,
                    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
                    auditor_id VARCHAR(50),
                    auditor_at TIMESTAMPTZ,
                    rejection_reason TEXT,
                    fabric_tx_id VARCHAR(255),
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );

                CREATE TABLE IF NOT EXISTS asset_deletion_proposals (
                    proposal_id VARCHAR(100) PRIMARY KEY,
                    asset_id VARCHAR(100) NOT NULL,
                    asset_name VARCHAR(255),
                    asset_type VARCHAR(100),
                    owner VARCHAR(100),
                    proposed_by VARCHAR(50) NOT NULL,
                    proposed_by_name VARCHAR(100),
                    reason TEXT NOT NULL,
                    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
                    auditor_id VARCHAR(50),
                    auditor_at TIMESTAMPTZ,
                    rejection_reason TEXT,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );
            `);

            const userCountRes = await client.query('SELECT COUNT(*) FROM users');
            if (parseInt(userCountRes.rows[0].count, 10) === 0) {
                console.log('Seeding default users in PostgreSQL...');
                const defaultUsers = [
                    {
                        userId: 'BEL001',
                        name: 'BEL Admin',
                        organization: 'BEL',
                        role: 'Admin',
                        passwordHash: bcrypt.hashSync('BelAdmin@123', 10)
                    },
                    {
                        userId: 'BEL002',
                        name: 'BEL Manager',
                        organization: 'BEL',
                        role: 'Manager',
                        passwordHash: bcrypt.hashSync('BelManager@123', 10)
                    },
                    {
                        userId: 'BEL003',
                        name: 'BEL Employee',
                        organization: 'BEL',
                        role: 'Employee',
                        passwordHash: bcrypt.hashSync('BelEmployee@123', 10)
                    },
                    {
                        userId: 'AUD001',
                        name: 'Auditor',
                        organization: 'Auditor',
                        role: 'Auditor',
                        passwordHash: bcrypt.hashSync('Auditor@123', 10)
                    },
                    {
                        userId: 'CON001',
                        name: 'Contractor Admin',
                        organization: 'Contractor',
                        role: 'Admin',
                        passwordHash: bcrypt.hashSync('ContractorAdmin@123', 10)
                    },
                    {
                        userId: 'CON002',
                        name: 'Contractor User',
                        organization: 'Contractor',
                        role: 'User',
                        passwordHash: bcrypt.hashSync('Contractor@123', 10)
                    }
                ];

                for (const u of defaultUsers) {
                    await client.query(
                        `INSERT INTO users (user_id, name, organization, role, password_hash)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (user_id) DO NOTHING`,
                        [u.userId, u.name, u.organization, u.role, u.passwordHash]
                    );
                }
                console.log('✓ Default users seeded in PostgreSQL');
            }

            isConnected = true;
            console.log('✓ PostgreSQL connected and schema verified');
            return true;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('PostgreSQL initialization failed:', err.message);
        isConnected = false;
        return false;
    }
}

module.exports = {
    getPool,
    query,
    isDbConnected,
    initDb
};
