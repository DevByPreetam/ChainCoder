'use strict';

const express = require('express');
const auditorRoutes = require('./auditorRoutes');
const { fetchRecentActivities } = require('../controllers/auditorController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/recent', authenticate, fetchRecentActivities);
router.use('/', auditorRoutes);

module.exports = router;
