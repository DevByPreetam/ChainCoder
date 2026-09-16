'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const {
    loginUser,
    enrollNewUser
} = require('../controllers/authController');

const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
        errorCode: 'TOO_MANY_REQUESTS'
    }
});

router.post('/login', authLimiter, loginUser);
router.post('/enroll', authenticate, enrollNewUser);

module.exports = router;
