'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const IPFS_API = process.env.IPFS_API_URL || 'http://127.0.0.1:5001/api/v0';

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function assertSafeUpload(file) {
    if (!file) {
        throw new Error('File is required');
    }

    if (!file.size) {
        throw new Error('Empty files are not allowed');
    }

    if (file.originalname && (file.originalname.includes('..') || file.originalname.includes('\0'))) {
        throw new Error('Invalid file name');
    }

    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
        throw new Error('Unsupported file type');
    }
}

async function saveUploadedFile(file) {
    assertSafeUpload(file);

    const fileBuffer = fs.readFileSync(file.path);
    const hash = sha256(fileBuffer);

    const form = new FormData();
    const blob = new Blob([fileBuffer], {
        type: file.mimetype || 'application/octet-stream'
    });

    form.append('file', blob, file.filename || 'document');

    try {
        const response = await fetch(`${IPFS_API}/add?pin=true`, {
            method: 'POST',
            body: form
        });

        if (!response.ok) {
            throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        return {
            originalName: path.basename(file.originalname || file.filename),
            fileName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            hash,
            cid: result.Hash,
            path: file.path
        };
    } finally {
        if (file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (cleanupErr) {
                console.warn('Temporary file cleanup notice:', cleanupErr.message);
            }
        }
    }
}

async function retrieveFromIpfs(cid) {
    if (!cid) {
        throw new Error('documentCID is required');
    }

    const response = await fetch(`${IPFS_API}/cat?arg=${encodeURIComponent(cid)}`, {
        method: 'POST'
    });

    if (!response.ok) {
        throw new Error(`IPFS retrieval failed: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function hashFromIpfs(cid) {
    const buffer = await retrieveFromIpfs(cid);
    return {
        buffer,
        hash: sha256(buffer)
    };
}

module.exports = {
    ALLOWED_MIME_TYPES,
    saveUploadedFile,
    retrieveFromIpfs,
    hashFromIpfs,
    sha256
};
