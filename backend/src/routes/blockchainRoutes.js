'use strict';

const express = require('express');
const {
    getBlockchainBlocks,
    simulateNewBlock,
    getTransactionByTxId
} = require('../controllers/blockchainController');

const router = express.Router();

// Public route to inspect all blocks and network status
router.get('/blocks', getBlockchainBlocks);

// Public route to inspect a specific blockchain transaction by txId
router.get('/transaction/:txId', getTransactionByTxId);

// Public route to trigger a simulated block creation
router.post('/simulate', simulateNewBlock);

module.exports = router;