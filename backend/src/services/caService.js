'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const FABRIC_CA_CLIENT = path.join(
    PROJECT_ROOT,
    'blockchain/fabric-samples/bin/fabric-ca-client.exe'
);
const SIH_NETWORK_DIR = path.join(
    PROJECT_ROOT,
    'blockchain/sih-network'
);

const CA_CONFIGS = {
    BEL: {
        caName: 'BELCA',
        url: 'https://localhost:7054',
        tlsCert: path.join(SIH_NETWORK_DIR, 'organizations/fabric-ca/bel/tls-cert.pem'),
        adminHome: path.join(SIH_NETWORK_DIR, '.ca-admin/bel')
    },
    Auditor: {
        caName: 'AuditorCA',
        url: 'https://localhost:8054',
        tlsCert: path.join(SIH_NETWORK_DIR, 'organizations/fabric-ca/auditor/tls-cert.pem'),
        adminHome: path.join(SIH_NETWORK_DIR, '.ca-admin/auditor')
    },
    Contractor: {
        caName: 'ContractorCA',
        url: 'https://localhost:9054',
        tlsCert: path.join(SIH_NETWORK_DIR, 'organizations/fabric-ca/contractor/tls-cert.pem'),
        adminHome: path.join(SIH_NETWORK_DIR, '.ca-admin/contractor')
    }
};

function getCaConfig(organization = 'BEL') {
    const config = CA_CONFIGS[organization];
    if (!config) {
        throw new Error(`Unsupported organization for Fabric CA: ${organization}`);
    }
    return config;
}

/**
 * Register an identity with the organization's Fabric Certificate Authority.
 */
async function registerIdentityInCA({ organization = 'BEL', identityId, role, secret }) {
    const config = getCaConfig(organization);
    const idSecret = secret || `sec_${identityId}_${Date.now()}`;
    const idType = (role && role.toLowerCase().includes('admin')) ? 'admin' : 'client';
    const attrs = `role=${role || 'User'},organization=${organization}`;

    const args = [
        'register',
        '--caname', config.caName,
        '--id.name', identityId,
        '--id.secret', idSecret,
        '--id.type', idType,
        '--id.attrs', attrs,
        '--tls.certfiles', config.tlsCert
    ];

    try {
        const { stdout, stderr } = await execFileAsync(FABRIC_CA_CLIENT, args, {
            env: {
                ...process.env,
                FABRIC_CA_CLIENT_HOME: config.adminHome
            },
            timeout: 10000
        });

        return {
            success: true,
            identityId,
            organization,
            role,
            type: idType,
            caName: config.caName,
            enrolledViaCA: true
        };
    } catch (error) {
        const output = (error.stdout || '') + (error.stderr || '') + (error.message || '');
        if (output.includes('is already registered')) {
            return {
                success: true,
                identityId,
                organization,
                alreadyRegistered: true,
                caName: config.caName
            };
        }
        console.error(`Fabric CA registration failed for ${identityId} in ${config.caName}:`, output);
        throw new Error(`Fabric CA registration error: ${error.message}`);
    }
}

/**
 * Revoke an identity with the organization's Fabric Certificate Authority and generate a fresh CRL.
 */
async function revokeIdentityInCA({ organization = 'BEL', identityId, reason = 'cessationofoperation' }) {
    const config = getCaConfig(organization);

    const args = [
        'revoke',
        '--caname', config.caName,
        '-e', identityId,
        '-r', reason,
        '--tls.certfiles', config.tlsCert,
        '--gencrl'
    ];

    try {
        const { stdout, stderr } = await execFileAsync(FABRIC_CA_CLIENT, args, {
            env: {
                ...process.env,
                FABRIC_CA_CLIENT_HOME: config.adminHome
            },
            timeout: 10000
        });

        return {
            success: true,
            identityId,
            organization,
            caName: config.caName,
            revoked: true,
            crlGenerated: true
        };
    } catch (error) {
        console.error(`Fabric CA revocation failed for ${identityId} in ${config.caName}:`, error.message);
        throw new Error(`Fabric CA revocation error: ${error.message}`);
    }
}

/**
 * Check if the CA for a given organization is healthy and responsive.
 */
async function getCAHealth(organization = 'BEL') {
    const config = getCaConfig(organization);
    try {
        const { stdout } = await execFileAsync(
            FABRIC_CA_CLIENT,
            ['identity', 'list', '--caname', config.caName, '--tls.certfiles', config.tlsCert],
            {
                env: {
                    ...process.env,
                    FABRIC_CA_CLIENT_HOME: config.adminHome
                },
                timeout: 8000
            }
        );
        return {
            organization,
            caName: config.caName,
            status: 'HEALTHY',
            accessible: true
        };
    } catch (err) {
        return {
            organization,
            caName: config.caName,
            status: 'UNAVAILABLE',
            accessible: false,
            error: err.message
        };
    }
}

module.exports = {
    getCaConfig,
    registerIdentityInCA,
    revokeIdentityInCA,
    getCAHealth
};
