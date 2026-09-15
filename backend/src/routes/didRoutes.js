'use strict';

const express = require('express');
const { handleResolveDID, handleVerifyDID } = require('../controllers/didController');

const router = express.Router();

// GET /api/did/:did/verify
router.get('/:did/verify', handleVerifyDID);

// GET /api/did/:did
router.get('/:did', handleResolveDID);

module.exports = router;