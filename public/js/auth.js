// Auth Module - Handles user authentication UI and state
const Auth = {
    currentUser: null,

    async init() {
        try {
            const data = await API.auth.getMe();
            this.currentUser = data;
            this.updateUI();
        } catch (error) {
            this.currentUser = null;
            this.updateUI();
        }
    },

    isLoggedIn() {
        return this.currentUser !== null;
    },

    getInitials(name) {
        if (!name) return '?';
        return name
            .split(' ')
            .map(part => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    },

    updateUI() {
        const headerActions = document.getElementById('header-actions');
        const mainNav = document.getElementById('main-nav');

        if (this.isLoggedIn()) {
            // Show user menu
            headerActions.innerHTML = `
        <div class="user-menu" id="user-menu">
          <button class="user-menu-trigger" id="user-menu-trigger">
            <div class="user-avatar">
              ${this.currentUser.avatarUrl
                    ? `<img src="${this.currentUser.avatarUrl}" alt="${this.currentUser.displayName}">`
                    : this.getInitials(this.currentUser.displayName || this.currentUser.username)
                }
            </div>
            <span class="user-name">${this.currentUser.displayName || this.currentUser.username}</span>
            <span style="font-size: 10px;">▼</span>
          </button>
          <div class="user-dropdown" id="user-dropdown">
            <a href="/profile" class="user-dropdown-item" data-link>
              <span>👤</span> My Profile
            </a>
            <a href="/my-images" class="user-dropdown-item" data-link>
              <span>🖼️</span> My Images
            </a>
            <a href="/settings" class="user-dropdown-item" data-link>
              <span>⚙️</span> Settings
            </a>
            <div class="user-dropdown-divider"></div>
            <button class="user-dropdown-item" id="logout-btn">
              <span>🚪</span> Logout
            </button>
          </div>
        </div>
      `;

            // Show upload in nav
            if (mainNav) {
                const uploadLink = mainNav.querySelector('[data-page="upload"]');
                if (uploadLink) uploadLink.style.display = '';
            }

            // Setup menu events
            this.setupUserMenu();
        } else {
            // Show login/signup buttons
            headerActions.innerHTML = `
        <button class="btn btn-ghost" id="login-btn">Login</button>
        <button class="btn btn-primary" id="signup-btn">Sign Up</button>
      `;

            // Hide upload in nav
            if (mainNav) {
                const uploadLink = mainNav.querySelector('[data-page="upload"]');
                if (uploadLink) uploadLink.style.display = 'none';
            }

            // Setup auth events
            document.getElementById('login-btn').addEventListener('click', () => this.showAuthModal('login'));
            document.getElementById('signup-btn').addEventListener('click', () => this.showAuthModal('signup'));
        }
    },

    setupUserMenu() {
        const trigger = document.getElementById('user-menu-trigger');
        const dropdown = document.getElementById('user-dropdown');
        const logoutBtn = document.getElementById('logout-btn');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('open');
        });

        logoutBtn.addEventListener('click', async () => {
            try {
                await API.auth.logout();
                this.currentUser = null;
                this.updateUI();
                App.navigateTo('/');
                App.showToast('Logged out successfully', 'success');
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });
    },

    showAuthModal(mode = 'login') {
        const modalContent = document.getElementById('modal-content');
        modalContent.innerHTML = this.renderAuthForm(mode);
        App.openModal();
        this.setupAuthForm(mode);
    },

    renderAuthForm(mode) {
        const isLogin = mode === 'login';

        return `
      <div class="auth-modal">
        <div class="auth-header">
          <h2 class="auth-title">${isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p class="auth-subtitle">${isLogin ? 'Sign in to continue' : 'Join VerifiedUsers today'}</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${isLogin ? 'active' : ''}" data-mode="login">Login</button>
          <button class="auth-tab ${!isLogin ? 'active' : ''}" data-mode="signup">Sign Up</button>
        </div>

        ${!isLogin ? `
          <div class="social-auth">
            <button class="social-btn google" data-provider="google">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            <button class="social-btn microsoft" data-provider="microsoft">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#F25022" d="M1 1h10v10H1z"/>
                <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                <path fill="#FFB900" d="M13 13h10v10H13z"/>
              </svg>
              Continue with Microsoft
            </button>
            <button class="social-btn twitter" data-provider="twitter">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Continue with X
            </button>
            
            <div class="auth-divider">
              <span>or continue with email</span>
            </div>
          </div>
        ` : ''}

        <form id="auth-form" class="auth-form">
          ${!isLogin ? `
            <div class="form-group">
              <label class="form-label" for="auth-username">Username</label>
              <input type="text" id="auth-username" name="username" class="form-input" 
                placeholder="Choose a username" required minlength="3" maxlength="30"
                pattern="^[a-zA-Z0-9_]+$">
              <p class="form-helper">3-30 characters, letters, numbers, and underscores only</p>
            </div>
          ` : ''}

          <div class="form-group">
            <label class="form-label" for="auth-email">${isLogin ? 'Email or Username' : 'Email'}</label>
            <input type="${isLogin ? 'text' : 'email'}" id="auth-email" name="${isLogin ? 'login' : 'email'}" 
              class="form-input" placeholder="${isLogin ? 'Enter email or username' : 'Enter your email'}" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="auth-password">Password</label>
            <input type="password" id="auth-password" name="password" class="form-input" 
              placeholder="Enter your password" required minlength="8">
            ${!isLogin ? `<p class="form-helper">At least 8 characters with uppercase, lowercase, and number</p>` : ''}
          </div>

          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%; margin-top: var(--space-4);">
            ${isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p class="auth-footer">
          ${isLogin
                ? "Don't have an account? <a href='#' data-switch='signup'>Sign up</a>"
                : "Already have an account? <a href='#' data-switch='login'>Sign in</a>"
            }
        </p>
      </div>
    `;
    },

    setupAuthForm(mode) {
        const form = document.getElementById('auth-form');
        const tabs = document.querySelectorAll('.auth-tab');
        const switchLinks = document.querySelectorAll('[data-switch]');
        const socialBtns = document.querySelectorAll('.social-btn');

        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.showAuthModal(tab.dataset.mode);
            });
        });

        // Footer link switching
        switchLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAuthModal(link.dataset.switch);
            });
        });

        // Social auth buttons
        socialBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const provider = btn.dataset.provider;
                this.handleSocialAuth(provider);
            });
        });

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = mode === 'login' ? 'Signing in...' : 'Creating account...';

            try {
                if (mode === 'login') {
                    await API.auth.login({
                        login: document.getElementById('auth-email').value,
                        password: document.getElementById('auth-password').value,
                    });
                    App.showToast('Welcome back!', 'success');
                } else {
                    await API.auth.register({
                        username: document.getElementById('auth-username').value,
                        email: document.getElementById('auth-email').value,
                        password: document.getElementById('auth-password').value,
                    });
                    App.showToast('Account created successfully!', 'success');
                }

                await this.init();
                App.closeModal();
                App.handleRoute();
            } catch (error) {
                App.showToast(error.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    },

    handleSocialAuth(provider) {
        // Social auth requires OAuth setup with each provider
        // For now, show a message about configuration
        const providerNames = {
            google: 'Google',
            microsoft: 'Microsoft',
            twitter: 'X (Twitter)'
        };

        App.showToast(`${providerNames[provider]} sign-in requires OAuth configuration. Contact the administrator.`, 'info');

        // When OAuth is configured, this would redirect to:
        // window.location.href = `/api/auth/${provider}`;
    }
};

window.Auth = Auth;
