const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../database/init');

// Get base URL for callbacks
function getBaseUrl() {
    return process.env.APP_URL ||
        (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
}

// Common OAuth handler - creates or links user
async function handleOAuthLogin(provider, providerId, email, displayName, avatarUrl, done) {
    try {
        const pool = getPool();

        if (!email) {
            return done(new Error(`No email provided by ${provider}`), null);
        }

        // Check if user exists with this provider ID
        let userResult = await pool.query(
            'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
            [provider, providerId]
        );

        let user = userResult.rows[0];

        if (!user) {
            // Check if user exists with this email
            userResult = await pool.query(
                'SELECT * FROM users WHERE email = $1',
                [email.toLowerCase()]
            );
            user = userResult.rows[0];

            if (user) {
                // Link OAuth account to existing user
                await pool.query(
                    'UPDATE users SET oauth_provider = $1, oauth_id = $2, avatar_url = COALESCE(avatar_url, $3) WHERE id = $4',
                    [provider, providerId, avatarUrl, user.id]
                );
            } else {
                // Create new user
                const userId = uuidv4();

                // Generate unique username from email
                let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
                if (baseUsername.length < 3) baseUsername = `user_${baseUsername}`;
                let username = baseUsername;
                let counter = 1;

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
                    [userId, username, email.toLowerCase(), '', displayName, avatarUrl, provider, providerId, true]
                );

                user = { id: userId, username, email: email.toLowerCase(), display_name: displayName, avatar_url: avatarUrl };
            }
        }

        return done(null, user);
    } catch (error) {
        console.error(`${provider} OAuth error:`, error);
        return done(error, null);
    }
}

// Configure all OAuth strategies
function configurePassport() {
    const baseUrl = getBaseUrl();

    // Configure Google OAuth
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        const googleCallbackURL = baseUrl ? `${baseUrl}/api/auth/google/callback` : '/api/auth/google/callback';
        console.log(`Google OAuth callback URL: ${googleCallbackURL}`);

        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: googleCallbackURL,
            proxy: true
        },
            async (accessToken, refreshToken, profile, done) => {
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
                const displayName = profile.displayName || '';
                const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
                await handleOAuthLogin('google', profile.id, email, displayName, avatarUrl, done);
            }));

        console.log('Google OAuth configured successfully');
    } else {
        console.log('Google OAuth not configured - missing credentials');
    }

    // Configure Discord OAuth
    if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
        const discordCallbackURL = baseUrl ? `${baseUrl}/api/auth/discord/callback` : '/api/auth/discord/callback';
        console.log(`Discord OAuth callback URL: ${discordCallbackURL}`);

        passport.use(new DiscordStrategy({
            clientID: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            callbackURL: discordCallbackURL,
            scope: ['identify', 'email']
        },
            async (accessToken, refreshToken, profile, done) => {
                const email = profile.email;
                const displayName = profile.global_name || profile.username || '';
                const avatarUrl = profile.avatar
                    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
                    : null;
                await handleOAuthLogin('discord', profile.id, email, displayName, avatarUrl, done);
            }));

        console.log('Discord OAuth configured successfully');
    } else {
        console.log('Discord OAuth not configured - missing credentials');
    }

    // Serialize/deserialize for session support
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
}

module.exports = { passport, configurePassport };
