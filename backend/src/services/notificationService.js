'use strict';

const crypto = require('crypto');
const { listUsers } = require('./authService');
const { query, isDbConnected } = require('../config/db');

const notifications = [];

async function loadNotificationsFromDb() {
    if (!isDbConnected()) return;
    try {
        const res = await query(`
            SELECT 
                id,
                user_id AS "userId",
                organization,
                type,
                title,
                message,
                resource_type AS "resourceType",
                resource_id AS "resourceId",
                read,
                read_at AS "readAt",
                created_at AS "createdAt"
            FROM notifications
            ORDER BY created_at DESC
            LIMIT 500
        `);

        for (const row of res.rows) {
            if (!notifications.some(n => n.id === row.id)) {
                notifications.push(row);
            }
        }
    } catch (err) {
        console.warn('Failed to load notifications from DB:', err.message);
    }
}

setTimeout(loadNotificationsFromDb, 1500);

function createNotification({
    userId,
    organization,
    type,
    title,
    message,
    resourceType,
    resourceId
}) {
    if (!userId || !type || !title) {
        return null;
    }

    const notification = {
        id: `NTF-${crypto.randomUUID()}`,
        userId,
        organization: organization || null,
        type,
        title,
        message: message || null,
        resourceType: resourceType || null,
        resourceId: resourceId || null,
        read: false,
        createdAt: new Date().toISOString()
    };

    notifications.push(notification);

    if (isDbConnected()) {
        query(
            `INSERT INTO notifications (
                id, user_id, organization, type, title, message, resource_type, resource_id, read, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                notification.id,
                notification.userId,
                notification.organization,
                notification.type,
                notification.title,
                notification.message,
                notification.resourceType,
                notification.resourceId,
                notification.read,
                notification.createdAt
            ]
        ).catch(err => console.error('Failed to persist notification to DB:', err.message));
    }

    return notification;
}

function notifyUsers(users, payload) {
    return users
        .filter(Boolean)
        .map((user) =>
            createNotification({
                userId: user.userId,
                organization: user.organization,
                ...payload
            })
        );
}

function notifyRoles(organization, roles, payload) {
    const users = listUsers().filter(
        (user) =>
            user.organization === organization &&
            roles.includes(user.role)
    );

    return notifyUsers(users, payload);
}

function getUnreadCountForUser(userId) {
    return notifications.filter(item => item.userId === userId && !item.read).length;
}

function getNotificationsForUser(userId) {
    return notifications
        .filter((item) => item.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function markNotificationRead(notificationId, userId) {
    const notification = notifications.find((item) => item.id === notificationId);

    if (!notification) {
        return null;
    }

    if (notification.userId !== userId) {
        const error = new Error('You cannot update this notification');
        error.statusCode = 403;
        error.errorCode = 'FORBIDDEN';
        throw error;
    }

    const now = new Date().toISOString();
    notification.read = true;
    notification.readAt = now;

    if (isDbConnected()) {
        query(
            `UPDATE notifications SET read = TRUE, read_at = $1 WHERE id = $2`,
            [now, notificationId]
        ).catch(err => console.error('Failed to update notification in DB:', err.message));
    }

    return notification;
}

module.exports = {
    createNotification,
    notifyUsers,
    notifyRoles,
    getUnreadCountForUser,
    getNotificationsForUser,
    markNotificationRead,
    loadNotificationsFromDb
};
