'use strict';

const { Contract } = require('fabric-contract-api');

module.exports = class SIHContract extends Contract {

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    getIdentityKey(identityId) {
        return `IDENTITY_${identityId}`;
    }

    getAssetKey(assetId) {
        return `ASSET_${assetId}`;
    }

    getAccessKey(identityId, assetId) {
        return `ACCESS_${identityId}_${assetId}`;
    }

    getDIDKey(did) {
        return `DID_${did}`;
    }

    async identityExists(ctx, identityId) {
        const key = this.getIdentityKey(identityId);
        const data = await ctx.stub.getState(key);
        return data && data.length > 0;
    }

    async assetExists(ctx, assetId) {
        const key = this.getAssetKey(assetId);
        const data = await ctx.stub.getState(key);
        return data && data.length > 0;
    }

    async accessExists(ctx, identityId, assetId) {
        const key = this.getAccessKey(identityId, assetId);
        const data = await ctx.stub.getState(key);
        return data && data.length > 0;
    }

    requireOrganization(ctx, allowedOrganizations) {
        const mspId = ctx.clientIdentity.getMSPID();

        if (!allowedOrganizations.includes(mspId)) {
            throw new Error(
                `Access denied. Organization ${mspId} is not authorized`
            );
        }

        return mspId;
    }

    // Returns a deterministic ISO timestamp from the tx proposal — identical
    // across all endorsing peers for the same transaction.
    getTxISOTimestamp(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        return new Date(
            ts.seconds.low * 1000 + Math.round(ts.nanos / 1e6)
        ).toISOString();
    }

    // ============================================================
    // TEST
    // ============================================================

    async test(ctx) {
        return JSON.stringify({
            message: 'SIH26125 chaincode is working',
            timestamp: this.getTxISOTimestamp(ctx)
        });
    }

    // ============================================================
    // IDENTITY MANAGEMENT
    // ============================================================

    async RegisterIdentity(
        ctx,
        identityId,
        name,
        organization,
        role
    ) {

        // Only BEL can register identities
        this.requireOrganization(ctx, ['BELMSP']);

        if (!identityId || !name || !organization || !role) {
            throw new Error(
                'identityId, name, organization and role are required'
            );
        }

        const exists = await this.identityExists(ctx, identityId);

        if (exists) {
            throw new Error(
                `Identity ${identityId} already exists`
            );
        }

        const timestamp = this.getTxISOTimestamp(ctx);
        const did = `did:chaincoder:${organization}:${identityId}`;
        const cryptographicReference = `fabric-ca::${organization}MSP::${identityId}`;

        const identity = {
            identityId,
            did,
            name,
            organization,
            role,
            status: 'ACTIVE',
            cryptographicReference,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        const key = this.getIdentityKey(identityId);

        await ctx.stub.putState(
            key,
            Buffer.from(JSON.stringify(identity))
        );

        // Map DID key to identityId for direct O(1) resolution
        const didKey = this.getDIDKey(did);
        await ctx.stub.putState(
            didKey,
            Buffer.from(identityId)
        );

        // Emit Fabric Transaction Event
        ctx.stub.setEvent('IdentityRegistered', Buffer.from(JSON.stringify({
            identityId,
            organization,
            role,
            did,
            timestamp
        })));

        return JSON.stringify(identity);
    }

    // ============================================================
    // GET IDENTITY
    // ============================================================

    async GetIdentity(ctx, identityId) {

        if (!identityId) {
            throw new Error('identityId is required');
        }

        const key = this.getIdentityKey(identityId);

        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            throw new Error(
                `Identity ${identityId} does not exist`
            );
        }

        const identity = JSON.parse(data.toString());

        // Backward compatibility: ensure legacy records expose deterministic DID & reference
        if (!identity.did && identity.organization && identity.identityId) {
            identity.did = `did:chaincoder:${identity.organization}:${identity.identityId}`;
        }
        if (!identity.cryptographicReference && identity.organization && identity.identityId) {
            identity.cryptographicReference = `fabric-ca::${identity.organization}MSP::${identity.identityId}`;
        }

        return JSON.stringify(identity);
    }

    // ============================================================
    // DID OPERATIONS
    // ============================================================

    // ------------------------------------------------------------
    // REGISTER / ASSOCIATE DID (Idempotent)
    // ------------------------------------------------------------

    async RegisterDID(ctx, identityId) {
        if (!identityId) {
            throw new Error('identityId is required');
        }

        const key = this.getIdentityKey(identityId);
        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            throw new Error(`Identity ${identityId} does not exist`);
        }

        const identity = JSON.parse(data.toString());

        // Check authority: caller MSP must match identity organization MSP or be BELMSP
        const callerMSP = ctx.clientIdentity.getMSPID();
        const expectedMSP = `${identity.organization}MSP`;

        if (callerMSP !== expectedMSP && callerMSP !== 'BELMSP') {
            throw new Error(`Access denied. Organization ${callerMSP} is not authorized to register DID for ${identity.organization}`);
        }

        const did = `did:chaincoder:${identity.organization}:${identity.identityId}`;
        const cryptographicReference = `fabric-ca::${identity.organization}MSP::${identity.identityId}`;

        // Idempotent: if already registered, return existing
        if (identity.did === did && identity.cryptographicReference) {
            // Ensure DID index exists
            const didKey = this.getDIDKey(did);
            const didData = await ctx.stub.getState(didKey);
            if (!didData || didData.length === 0) {
                await ctx.stub.putState(didKey, Buffer.from(identityId));
            }
            return JSON.stringify(identity);
        }

        identity.did = did;
        identity.cryptographicReference = cryptographicReference;
        identity.updatedAt = this.getTxISOTimestamp(ctx);

        await ctx.stub.putState(
            key,
            Buffer.from(JSON.stringify(identity))
        );

        const didKey = this.getDIDKey(did);
        await ctx.stub.putState(
            didKey,
            Buffer.from(identityId)
        );

        return JSON.stringify(identity);
    }

    // ------------------------------------------------------------
    // RESOLVE DID
    // ------------------------------------------------------------

    async ResolveDID(ctx, did) {
        if (!did) {
            throw new Error('did is required');
        }

        // Validate DID format
        const didParts = did.split(':');
        if (didParts.length !== 4 || didParts[0] !== 'did' || didParts[1] !== 'chaincoder') {
            throw new Error(`Invalid DID format: ${did}. Expected did:chaincoder:<organization>:<identityId>`);
        }

        const orgFromDid = didParts[2];
        const identityIdFromDid = didParts[3];

        // 1. Try direct DID index key
        const didKey = this.getDIDKey(did);
        let identityId = null;
        const didData = await ctx.stub.getState(didKey);

        if (didData && didData.length > 0) {
            identityId = didData.toString();
        } else {
            identityId = identityIdFromDid;
        }

        // 2. Fetch canonical identity record
        const identityKey = this.getIdentityKey(identityId);
        const data = await ctx.stub.getState(identityKey);

        if (!data || data.length === 0) {
            throw new Error(`DID ${did} does not resolve to any existing identity`);
        }

        const identity = JSON.parse(data.toString());

        // Validate organization match
        if (identity.organization !== orgFromDid) {
            throw new Error(`DID organization ${orgFromDid} does not match ledger identity organization ${identity.organization}`);
        }

        const didDocument = {
            id: did,
            identityId: identity.identityId,
            name: identity.name,
            organization: identity.organization,
            role: identity.role,
            status: identity.status,
            cryptographicReference: identity.cryptographicReference || `fabric-ca::${identity.organization}MSP::${identity.identityId}`,
            createdAt: identity.createdAt,
            updatedAt: identity.updatedAt
        };

        return JSON.stringify(didDocument);
    }

    // ------------------------------------------------------------
    // VERIFY DID
    // ------------------------------------------------------------

    async VerifyDID(ctx, did) {
        if (!did) {
            return JSON.stringify({
                verified: false,
                reason: 'DID is required'
            });
        }

        try {
            const resolvedStr = await this.ResolveDID(ctx, did);
            const doc = JSON.parse(resolvedStr);

            if (doc.status !== 'ACTIVE') {
                return JSON.stringify({
                    verified: false,
                    did,
                    identityId: doc.identityId,
                    organization: doc.organization,
                    role: doc.role,
                    status: doc.status,
                    reason: `Identity is ${doc.status}`
                });
            }

            return JSON.stringify({
                verified: true,
                did,
                identityId: doc.identityId,
                organization: doc.organization,
                role: doc.role,
                status: doc.status,
                cryptographicReference: doc.cryptographicReference
            });
        } catch (error) {
            return JSON.stringify({
                verified: false,
                did,
                reason: error.message
            });
        }
    }

    // ============================================================
    // REVOKE IDENTITY
    // ============================================================

    async RevokeIdentity(ctx, identityId) {

        this.requireOrganization(
            ctx,
            ['BELMSP', 'AuditorMSP']
        );

        if (!identityId) {
            throw new Error('identityId is required');
        }

        const key = this.getIdentityKey(identityId);

        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            throw new Error(
                `Identity ${identityId} does not exist`
            );
        }

        const identity = JSON.parse(data.toString());

        if (identity.status === 'REVOKED') {
            throw new Error(
                `Identity ${identityId} is already revoked`
            );
        }

        identity.status = 'REVOKED';
        identity.updatedAt = this.getTxISOTimestamp(ctx);

        await ctx.stub.putState(
            key,
            Buffer.from(JSON.stringify(identity))
        );

        // Emit Fabric Transaction Event
        ctx.stub.setEvent('IdentityRevoked', Buffer.from(JSON.stringify({
            identityId,
            organization: identity.organization,
            status: 'REVOKED',
            revokedBy: ctx.clientIdentity.getMSPID(),
            timestamp: identity.updatedAt
        })));

        return JSON.stringify(identity);
    }

    // ============================================================
    // ACCESS CONTROL
    // ============================================================

    // ------------------------------------------------------------
    // GRANT ACCESS
    // ------------------------------------------------------------

    async GrantAccess(
        ctx,
        accessId,
        identityId,
        assetId,
        grantedTo,
        permission
    ) {

        const grantingMSP = this.requireOrganization(
            ctx,
            ['BELMSP', 'AuditorMSP']
        );

        if (
            !accessId ||
            !identityId ||
            !assetId ||
            !grantedTo ||
            !permission
        ) {
            throw new Error(
                'accessId, identityId, assetId, grantedTo and permission are required'
            );
        }

        // Check identity
        const identityExists = await this.identityExists(
            ctx,
            identityId
        );

        if (!identityExists) {
            throw new Error(
                `Identity ${identityId} does not exist`
            );
        }

        // Check asset
        const assetExists = await this.assetExists(
            ctx,
            assetId
        );

        if (!assetExists) {
            throw new Error(
                `Asset ${assetId} does not exist`
            );
        }

        // Access is uniquely identified by identity + asset
        const key = this.getAccessKey(
            identityId,
            assetId
        );

        const existing = await ctx.stub.getState(key);

        if (existing && existing.length > 0) {
            throw new Error(
                `Access already exists for identity ${identityId} and asset ${assetId}`
            );
        }

        const timestamp = this.getTxISOTimestamp(ctx);

        const access = {
            accessId,
            identityId,
            assetId,
            grantedBy: grantingMSP,
            grantedTo,
            permission,
            status: 'ACTIVE',
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await ctx.stub.putState(
            key,
            Buffer.from(JSON.stringify(access))
        );

        // Emit Fabric Transaction Event
        ctx.stub.setEvent('AccessGranted', Buffer.from(JSON.stringify({
            accessId,
            identityId,
            assetId,
            grantedTo,
            permission,
            timestamp
        })));

        return JSON.stringify(access);
    }

    // ------------------------------------------------------------
    // CHECK ACCESS
    // ------------------------------------------------------------

    async CheckAccess(
        ctx,
        identityId,
        assetId
    ) {

        if (!identityId || !assetId) {
            throw new Error(
                'identityId and assetId are required'
            );
        }

        const key = this.getAccessKey(
            identityId,
            assetId
        );

        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            return JSON.stringify({
                identityId,
                assetId,
                hasAccess: false
            });
        }

        const access = JSON.parse(data.toString());

        if (access.status !== 'ACTIVE') {
            return JSON.stringify({
                identityId,
                assetId,
                hasAccess: false
            });
        }

        return JSON.stringify({
            identityId,
            assetId,
            hasAccess: true,
            permission: access.permission,
            accessId: access.accessId
        });
    }

    // ------------------------------------------------------------
    // REVOKE ACCESS
    // ------------------------------------------------------------

    async RevokeAccess(
        ctx,
        identityId,
        assetId
    ) {

        const callerMSP = ctx.clientIdentity.getMSPID();

        if (!callerMSP) {
            throw new Error(
                'Unable to determine caller organization'
            );
        }

        const key = this.getAccessKey(
            identityId,
            assetId
        );

        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            throw new Error(
                `Access for identity ${identityId} and asset ${assetId} does not exist`
            );
        }

        const access = JSON.parse(data.toString());

        if (access.grantedBy !== callerMSP) {
            throw new Error(
                `Only ${access.grantedBy} can revoke this access`
            );
        }

        if (access.status === 'REVOKED') {
            throw new Error(
                `Access for identity ${identityId} and asset ${assetId} is already revoked`
            );
        }

        access.status = 'REVOKED';
        access.updatedAt = this.getTxISOTimestamp(ctx);

        await ctx.stub.putState(
            key,
            Buffer.from(JSON.stringify(access))
        );

        // Emit Fabric Transaction Event
        ctx.stub.setEvent('AccessRevoked', Buffer.from(JSON.stringify({
            identityId,
            assetId,
            revokedBy: callerMSP,
            timestamp: access.updatedAt
        })));

        return JSON.stringify(access);
    }

    // ============================================================
    // ASSET MANAGEMENT
    // ============================================================

    // ------------------------------------------------------------
    // MINT ASSET
    // ------------------------------------------------------------

    async MintAsset(
        ctx,
        assetId,
        name,
        assetType,
        owner,
        documentHash,
        documentCID
    ) {

        this.requireOrganization(
            ctx,
            ['BELMSP', 'AuditorMSP']
        );

        if (
            !assetId ||
            !name ||
            !assetType ||
            !owner
        ) {
            throw new Error(
                'assetId, name, assetType and owner are required'
            );
        }

        // Owner must be a registered identity
        const ownerExists = await this.identityExists(
            ctx,
            owner
        );

        if (!ownerExists) {
            throw new Error(
                `Owner identity ${owner} does not exist`
            );
        }

        const key = this.getAssetKey(assetId);

        const existing = await ctx.stub.getState(key);

        if (existing && existing.length > 0) {
            throw new Error(
                `Asset ${assetId} already exists`
            );
        }

        // Fetch owner identity details for deterministic DID linkage
        const ownerData = await ctx.stub.getState(this.getIdentityKey(owner));
        const ownerIdentity = (ownerData && ownerData.length > 0)
            ? JSON.parse(ownerData.toString())
            : {};

        const ownerOrganization = ownerIdentity.organization ||
            (owner.startsWith('BEL') ? 'BEL' : owner.startsWith('CON') ? 'Contractor' : owner.startsWith('AUD') ? 'Auditor' : 'BEL');

        const ownerDID = ownerIdentity.did ||
            `did:chaincoder:${ownerOrganization}:${owner}`;

        const timestamp = this.getTxISOTimestamp(ctx);

        const asset = {
            assetId,
            tokenId: assetId,
            name,
            assetType,
            owner,
            ownerOrganization,
            ownerDID,
            tokenStandard: 'CHAINCODER-NFT',
            status: 'ACTIVE',
            documentHash: documentHash || '',
            documentCID: documentCID || '',
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await ctx.stub.putState(
            key,
            Buffer.from(JSON.stringify(asset))
        );

        // Emit Fabric Transaction Event
        ctx.stub.setEvent('AssetMinted', Buffer.from(JSON.stringify({
            assetId,
            name,
            assetType,
            owner,
            tokenId: asset.tokenId,
            timestamp
        })));

        return JSON.stringify(asset);
    }

    // ------------------------------------------------------------
    // GET ASSET
    // ------------------------------------------------------------

    async GetAsset(ctx, assetId) {

        if (!assetId) {
            throw new Error('assetId is required');
        }

        const key = this.getAssetKey(assetId);

        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            throw new Error(
                `Asset ${assetId} does not exist`
            );
        }

        const asset = JSON.parse(data.toString());

        // Backward compatibility for existing assets minted prior to NFT alignment
        if (!asset.tokenId) {
            asset.tokenId = asset.assetId;
        }

        if (!asset.tokenStandard) {
            asset.tokenStandard = 'CHAINCODER-NFT';
        }

        if (!asset.ownerOrganization || !asset.ownerDID) {
            try {
                const ownerData = await ctx.stub.getState(this.getIdentityKey(asset.owner));
                if (ownerData && ownerData.length > 0) {
                    const ownerIdentity = JSON.parse(ownerData.toString());
                    asset.ownerOrganization = asset.ownerOrganization || ownerIdentity.organization;
                    asset.ownerDID = asset.ownerDID || ownerIdentity.did || `did:chaincoder:${ownerIdentity.organization}:${asset.owner}`;
                }
            } catch (_) {}
        }

        if (!asset.ownerOrganization) {
            asset.ownerOrganization = asset.owner?.startsWith('BEL') ? 'BEL' : asset.owner?.startsWith('CON') ? 'Contractor' : asset.owner?.startsWith('AUD') ? 'Auditor' : 'BEL';
        }

        if (!asset.ownerDID) {
            asset.ownerDID = `did:chaincoder:${asset.ownerOrganization}:${asset.owner}`;
        }

        return JSON.stringify(asset);
    }
    // ------------------------------------------------------------
// UPDATE ASSET DOCUMENT
// ------------------------------------------------------------

async UpdateAssetDocument(
    ctx,
    assetId,
    documentHash,
    documentCID
) {

    if (!assetId || !documentHash || !documentCID) {
        throw new Error(
            'assetId, documentHash and documentCID are required'
        );
    }

    // Only BEL or Auditor can update document metadata
    this.requireOrganization(
        ctx,
        ['BELMSP', 'AuditorMSP']
    );

    const key = this.getAssetKey(assetId);

    const data = await ctx.stub.getState(key);

    if (!data || data.length === 0) {
        throw new Error(
            `Asset ${assetId} does not exist`
        );
    }

    const asset = JSON.parse(data.toString());

    if (asset.status !== 'ACTIVE') {
        throw new Error(
            `Asset ${assetId} is not active`
        );
    }

    asset.documentHash = documentHash;
    asset.documentCID = documentCID;
    asset.updatedAt = this.getTxISOTimestamp(ctx);

    await ctx.stub.putState(
        key,
        Buffer.from(JSON.stringify(asset))
    );

    // Emit Fabric Transaction Event
    ctx.stub.setEvent('AssetDocumentUpdated', Buffer.from(JSON.stringify({
        assetId,
        documentHash,
        documentCID,
        timestamp: asset.updatedAt
    })));

    return JSON.stringify(asset);
}

    // ------------------------------------------------------------
    // TRANSFER ASSET
    // ------------------------------------------------------------

    async TransferAsset(
        ctx,
        assetId,
        newOwner
    ) {

        if (!assetId || !newOwner) {
            throw new Error(
                'assetId and newOwner are required'
            );
        }

        // New owner must exist
        const newOwnerExists = await this.identityExists(
            ctx,
            newOwner
        );

        if (!newOwnerExists) {
            throw new Error(
                `New owner identity ${newOwner} does not exist`
            );
        }

        const key = this.getAssetKey(assetId);

        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            throw new Error(
                `Asset ${assetId} does not exist`
            );
        }

        const asset = JSON.parse(data.toString());

        if (asset.status !== 'ACTIVE') {
            throw new Error(
                `Asset ${assetId} is not active`
            );
        }

        /*
         * Temporary ownership model:
         * The backend will provide the registered identityId
         * associated with the Fabric caller.
         *
         * Full Fabric certificate ↔ identity mapping will be
         * added during authentication/RBAC implementation.
         */

        const callerMSP = ctx.clientIdentity.getMSPID();

        if (!callerMSP) {
            throw new Error(
                'Unable to determine caller organization'
            );
        }

        // For now, only the owner's organization may initiate
        // the transfer. Detailed identity verification comes
        // with the authentication/RBAC layer.
        const ownerData = await ctx.stub.getState(
            this.getIdentityKey(asset.owner)
        );

        if (!ownerData || ownerData.length === 0) {
            throw new Error(
                `Owner identity ${asset.owner} does not exist`
            );
        }

        const owner = JSON.parse(ownerData.toString());

        if (owner.organization === 'BEL' && callerMSP !== 'BELMSP') {
            throw new Error(
                'Only BEL can transfer this asset'
            );
        }

        if (
            owner.organization === 'Auditor' &&
            callerMSP !== 'AuditorMSP'
        ) {
            throw new Error(
                'Only Auditor can transfer this asset'
            );
        }

        if (
            owner.organization === 'Contractor' &&
            callerMSP !== 'ContractorMSP'
        ) {
            throw new Error(
                'Only the asset owner organization can transfer this asset'
            );
        }

        // Fetch new owner identity for organization and DID assignment
        const newOwnerData = await ctx.stub.getState(this.getIdentityKey(newOwner));
        const newOwnerIdent = (newOwnerData && newOwnerData.length > 0)
            ? JSON.parse(newOwnerData.toString())
            : {};

        const newOwnerOrg = newOwnerIdent.organization ||
            (newOwner.startsWith('BEL') ? 'BEL' : newOwner.startsWith('CON') ? 'Contractor' : newOwner.startsWith('AUD') ? 'Auditor' : 'BEL');

        const newOwnerDID = newOwnerIdent.did ||
            `did:chaincoder:${newOwnerOrg}:${newOwner}`;

        asset.owner = newOwner;
        asset.ownerOrganization = newOwnerOrg;
        asset.ownerDID = newOwnerDID;
        asset.tokenId = asset.tokenId || asset.assetId;
        asset.tokenStandard = asset.tokenStandard || 'CHAINCODER-NFT';
        asset.updatedAt = this.getTxISOTimestamp(ctx);

        await ctx.stub.putState(
            key,
            Buffer.from(JSON.stringify(asset))
        );

        // Emit Fabric Transaction Event
        ctx.stub.setEvent('AssetTransferred', Buffer.from(JSON.stringify({
            assetId,
            previousOwner: asset.owner,
            newOwner,
            timestamp: asset.updatedAt
        })));

        return JSON.stringify(asset);
    }

    // ------------------------------------------------------------
    // GET ASSET HISTORY
    // ------------------------------------------------------------

    async GetAssetHistory(ctx, assetId) {

        if (!assetId) {
            throw new Error('assetId is required');
        }

        const key = this.getAssetKey(assetId);

        const iterator = await ctx.stub.getHistoryForKey(key);
        const history = [];

        while (true) {
            const result = await iterator.next();

            if (result.done) {
                await iterator.close();
                break;
            }

            let formattedTimestamp = null;
            if (result.value.timestamp) {
                try {
                    const sec = typeof result.value.timestamp.seconds === 'object' && result.value.timestamp.seconds !== null
                        ? (result.value.timestamp.seconds.low ?? result.value.timestamp.seconds.toInt?.() ?? Number(result.value.timestamp.seconds))
                        : Number(result.value.timestamp.seconds || 0);
                    const nanos = typeof result.value.timestamp.nanos === 'number' ? result.value.timestamp.nanos : 0;
                    const date = new Date(sec * 1000 + Math.floor(nanos / 1000000));
                    if (!isNaN(date.getTime())) {
                        formattedTimestamp = date.toISOString();
                    }
                } catch (_) {
                    formattedTimestamp = null;
                }
            }

            const record = {
                txId:      result.value.txId,
                timestamp: formattedTimestamp,
                isDelete:  result.value.isDelete,
                value:     null
            };

            if (!result.value.isDelete && result.value.value) {
                try {
                    record.value = JSON.parse(
                        result.value.value.toString('utf8')
                    );

                    // Ensure backward-compatible NFT metadata in historical values
                    if (typeof record.value === 'object' && record.value !== null) {
                        if (!record.value.tokenId && record.value.assetId) {
                            record.value.tokenId = record.value.assetId;
                        }
                        if (!record.value.tokenStandard) {
                            record.value.tokenStandard = 'CHAINCODER-NFT';
                        }
                        if (!record.value.ownerOrganization && record.value.owner) {
                            record.value.ownerOrganization = record.value.owner.startsWith('BEL') ? 'BEL' : record.value.owner.startsWith('CON') ? 'Contractor' : record.value.owner.startsWith('AUD') ? 'Auditor' : 'BEL';
                        }
                        if (!record.value.ownerDID && record.value.owner) {
                            const org = record.value.ownerOrganization || 'BEL';
                            record.value.ownerDID = `did:chaincoder:${org}:${record.value.owner}`;
                        }
                    }
                } catch (_) {
                    record.value = result.value.value.toString('utf8');
                }
            }

            history.push(record);
        }

        return JSON.stringify(history);
    }

    // ============================================================
    // PRIVATE DATA COLLECTIONS (PDC)
    // ============================================================

    // ------------------------------------------------------------
    // PUT IDENTITY KYC DETAILS (identityKycDetails PDC)
    // ------------------------------------------------------------

    async PutIdentityKycDetails(ctx, identityId, fallbackKycData) {
        const callerMSP = this.requireOrganization(ctx, ['BELMSP', 'AuditorMSP']);

        if (!identityId) {
            throw new Error('identityId is required');
        }

        const exists = await this.identityExists(ctx, identityId);
        if (!exists) {
            throw new Error(`Identity ${identityId} does not exist`);
        }

        const transientMap = ctx.stub.getTransient();
        let kycPayload = null;

        if (transientMap && transientMap.has('kycData')) {
            kycPayload = transientMap.get('kycData').toString('utf8');
        } else if (transientMap && transientMap.has('transient')) {
            kycPayload = transientMap.get('transient').toString('utf8');
        } else if (fallbackKycData) {
            kycPayload = typeof fallbackKycData === 'string' ? fallbackKycData : JSON.stringify(fallbackKycData);
        } else {
            throw new Error('Transient kycData or fallbackKycData is required');
        }

        const kycRecord = {
            identityId,
            kycData: JSON.parse(kycPayload),
            updatedBy: callerMSP,
            updatedAt: this.getTxISOTimestamp(ctx)
        };

        await ctx.stub.putPrivateData(
            'identityKycDetails',
            identityId,
            Buffer.from(JSON.stringify(kycRecord))
        );

        ctx.stub.setEvent('IdentityKycUpdated', Buffer.from(JSON.stringify({
            identityId,
            updatedBy: callerMSP,
            timestamp: kycRecord.updatedAt
        })));

        return JSON.stringify({
            success: true,
            identityId,
            collection: 'identityKycDetails',
            updatedBy: callerMSP
        });
    }

    // ------------------------------------------------------------
    // GET IDENTITY KYC DETAILS (identityKycDetails PDC)
    // ------------------------------------------------------------

    async GetIdentityKycDetails(ctx, identityId) {
        this.requireOrganization(ctx, ['BELMSP', 'AuditorMSP']);

        if (!identityId) {
            throw new Error('identityId is required');
        }

        const data = await ctx.stub.getPrivateData('identityKycDetails', identityId);

        if (!data || data.length === 0) {
            throw new Error(`No private KYC details found for identity ${identityId}`);
        }

        return data.toString('utf8');
    }

    // ------------------------------------------------------------
    // PUT ASSET PRIVATE DETAILS (assetDocumentDetails PDC)
    // ------------------------------------------------------------

    async PutAssetPrivateDetails(ctx, assetId, fallbackDetails) {
        const callerMSP = this.requireOrganization(ctx, ['BELMSP', 'AuditorMSP', 'ContractorMSP']);

        if (!assetId) {
            throw new Error('assetId is required');
        }

        const exists = await this.assetExists(ctx, assetId);
        if (!exists) {
            throw new Error(`Asset ${assetId} does not exist`);
        }

        const transientMap = ctx.stub.getTransient();
        let detailsPayload = null;

        if (transientMap && transientMap.has('assetDetails')) {
            detailsPayload = transientMap.get('assetDetails').toString('utf8');
        } else if (transientMap && transientMap.has('transient')) {
            detailsPayload = transientMap.get('transient').toString('utf8');
        } else if (fallbackDetails) {
            detailsPayload = typeof fallbackDetails === 'string' ? fallbackDetails : JSON.stringify(fallbackDetails);
        } else {
            throw new Error('Transient assetDetails or fallbackDetails is required');
        }

        const privateRecord = {
            assetId,
            details: JSON.parse(detailsPayload),
            updatedBy: callerMSP,
            updatedAt: this.getTxISOTimestamp(ctx)
        };

        await ctx.stub.putPrivateData(
            'assetDocumentDetails',
            assetId,
            Buffer.from(JSON.stringify(privateRecord))
        );

        ctx.stub.setEvent('AssetPrivateDetailsUpdated', Buffer.from(JSON.stringify({
            assetId,
            updatedBy: callerMSP,
            timestamp: privateRecord.updatedAt
        })));

        return JSON.stringify({
            success: true,
            assetId,
            collection: 'assetDocumentDetails',
            updatedBy: callerMSP
        });
    }

    // ------------------------------------------------------------
    // GET ASSET PRIVATE DETAILS (assetDocumentDetails PDC)
    // ------------------------------------------------------------

    async GetAssetPrivateDetails(ctx, assetId) {
        this.requireOrganization(ctx, ['BELMSP', 'AuditorMSP', 'ContractorMSP']);

        if (!assetId) {
            throw new Error('assetId is required');
        }

        const data = await ctx.stub.getPrivateData('assetDocumentDetails', assetId);

        if (!data || data.length === 0) {
            throw new Error(`No private document details found for asset ${assetId}`);
        }

        return data.toString('utf8');
    }

    // ============================================================
    // MULTI-PARTY ENDORSEMENT HELPER
    // ============================================================

    async EndorseTransaction(ctx, txType, targetId) {
        const callerMSP = this.requireOrganization(ctx, ['BELMSP', 'AuditorMSP']);

        if (!txType || !targetId) {
            throw new Error('txType and targetId are required');
        }

        const timestamp = this.getTxISOTimestamp(ctx);
        const endorsement = {
            txType,
            targetId,
            endorserMSP: callerMSP,
            timestamp
        };

        ctx.stub.setEvent('TransactionEndorsed', Buffer.from(JSON.stringify(endorsement)));

        return JSON.stringify({
            success: true,
            endorsement
        });
    }
}