const express = require('express');
const { passport } = require('../config/passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../database/init');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Helper to create session token
async function createSessionToken(user, req) {
    const pool = getPool();
    const sessionId = uuidv4();
    const token = jwt.sign(
        { userId: user.id, sessionId },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
        [sessionId, user.id, tokenHash, expiresAt, req.get('user-agent'), req.ip]
    );

    return token;
}

// Google OAuth - Initiate
router.get('/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(503).json({ error: 'Google OAuth is not configured' });
    }
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false
    })(req, res, next);
});

// Google OAuth - Callback
router.get('/google/callback',
    passport.authenticate('google', {
        session: false,
        failureRedirect: '/?error=oauth_failed'
    }),
    async (req, res) => {
        try {
            const token = await createSessionToken(req.user, req);
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.redirect('/?oauth=success');
        } catch (error) {
            console.error('OAuth callback error:', error);
            res.redirect('/?error=oauth_error');
        }
    }
);

// Discord OAuth - Initiate
router.get('/discord', (req, res, next) => {
    if (!process.env.DISCORD_CLIENT_ID) {
        return res.status(503).json({ error: 'Discord OAuth is not configured' });
    }
    passport.authenticate('discord', {
        scope: ['identify', 'email'],
        session: false
    })(req, res, next);
});

// Discord OAuth - Callback
router.get('/discord/callback',
    passport.authenticate('discord', {
        session: false,
        failureRedirect: '/?error=oauth_failed'
    }),
    async (req, res) => {
        try {
            const token = await createSessionToken(req.user, req);
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.redirect('/?oauth=success');
        } catch (error) {
            console.error('Discord OAuth callback error:', error);
            res.redirect('/?error=oauth_error');
        }
    }
);

// OAuth status check
router.get('/providers', (req, res) => {
    res.json({
        google: !!process.env.GOOGLE_CLIENT_ID,
        apple: !!process.env.APPLE_CLIENT_ID,
        discord: !!process.env.DISCORD_CLIENT_ID,
        microsoft: !!process.env.MICROSOFT_CLIENT_ID,
        twitter: !!process.env.TWITTER_CLIENT_ID
    });
});

module.exports = router;
