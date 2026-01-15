const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../database/init');

// Configure Google OAuth Strategy
function configurePassport() {
    // Only configure if credentials are provided
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.log('Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
        return;
    }

    // Build callback URL - use RAILWAY_PUBLIC_DOMAIN or APP_URL if available
    const baseUrl = process.env.APP_URL ||
        (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
    const callbackURL = baseUrl ? `${baseUrl}/api/auth/google/callback` : '/api/auth/google/callback';

    console.log(`Google OAuth callback URL: ${callbackURL}`);

    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: callbackURL,
        proxy: true  // Trust the proxy (Railway)
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const pool = getPool();

                // Extract user info from Google profile
                const googleId = profile.id;
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
                const displayName = profile.displayName || '';
                const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

                if (!email) {
                    return done(new Error('No email provided by Google'), null);
                }

                // Check if user exists with this Google ID
                let userResult = await pool.query(
                    'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
                    ['google', googleId]
                );

                let user = userResult.rows[0];

                if (!user) {
                    // Check if user exists with this email (might have registered with email/password)
                    userResult = await pool.query(
                        'SELECT * FROM users WHERE email = $1',
                        [email.toLowerCase()]
                    );
                    user = userResult.rows[0];

                    if (user) {
                        // Link Google account to existing user
                        await pool.query(
                            'UPDATE users SET oauth_provider = $1, oauth_id = $2, avatar_url = COALESCE(avatar_url, $3) WHERE id = $4',
                            ['google', googleId, avatarUrl, user.id]
                        );
                    } else {
                        // Create new user
                        const userId = uuidv4();

                        // Generate unique username from email or display name
                        let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
                        let username = baseUsername;
                        let counter = 1;

                        // Ensure username is unique
                        while (true) {
                            const existing = await pool.query(
                                'SELECT id FROM users WHERE username = $1',
                                [username]
                            );
                            if (existing.rows.length === 0) break;
                            username = `${baseUsername}${counter}`;
                            counter++;
                        }

                        await pool.query(
                            `INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, oauth_provider, oauth_id, email_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                            [userId, username, email.toLowerCase(), '', displayName, avatarUrl, 'google', googleId, true]
                        );

                        user = { id: userId, username, email: email.toLowerCase(), display_name: displayName, avatar_url: avatarUrl };
                    }
                }

                return done(null, user);
            } catch (error) {
                console.error('Google OAuth error:', error);
                return done(error, null);
            }
        }));

    // Serialize user for session (we're using JWT, so minimal serialization)
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const pool = getPool();
            const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
            done(null, result.rows[0]);
        } catch (error) {
            done(error, null);
        }
    });

    console.log('Google OAuth configured successfully');
}

module.exports = { passport, configurePassport };
