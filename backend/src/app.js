'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectToFabric } = require('./config/fabric');
const { initDb, isDbConnected } = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { startEventListener } = require('./services/eventListenerService');

const assetRoutes = require('./routes/assetRoutes');
const identityRoutes = require('./routes/identityRoutes');
const accessRoutes = require('./routes/accessRoutes');
const authRoutes = require('./routes/authRoutes');
const auditorRoutes = require('./routes/auditorRoutes');
const auditRoutes = require('./routes/auditRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const verifyRoutes = require('./routes/verifyRoutes');
const didRoutes = require('./routes/didRoutes');
const blockchainRoutes = require('./routes/blockchainRoutes');

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/identities', identityRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auditor', auditorRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/did', didRoutes);
app.use('/api/public/blockchain', blockchainRoutes);
app.use('/api/blockchain/simulation', blockchainRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'ChainCoder backend is running',
        database: isDbConnected() ? 'connected' : 'in-memory'
    });
});

app.get('/api/blockchain/test', async (req, res) => {
    let connection;

    try {
        connection = connectToFabric();

        const result =
            await connection.contract.evaluateTransaction('test');

        const rawResult = Buffer.from(result).toString('utf8');

        console.log('RAW FABRIC RESULT:', rawResult);

        const blockchainResult =
            JSON.parse(rawResult);

        res.json({
            success: true,
            blockchain: blockchainResult
        });

    } catch (error) {
        console.error('Fabric error:', error);

        res.status(500).json({
            success: false,
            message: 'Unable to query the blockchain',
            errorCode: 'INTERNAL_ERROR'
        });

    } finally {
        if (connection) {
            connection.gateway.close();
            connection.client.close();
        }
    }
});

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`ChainCoder backend running on port ${PORT}`);
    await initDb();
    startEventListener().catch(err => {
        console.warn('Background Fabric event listener notice:', err.message);
    });
});
