// Auth Module - Handles user authentication UI and state
const Auth = {
  currentUser: null,

  async init() {
    try {
      const data = await API.auth.getMe();
      this.currentUser = data;
      this.updateUI();

      // Check if onboarding is needed
      if (this.currentUser && !this.currentUser.onboardingComplete) {
        this.showOnboardingModal();
      }
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
            <a href="/messages" class="user-dropdown-item" data-link>
              <span>💬</span> Messages <span id="unread-badge" class="nav-message-badge" style="display: none;"></span>
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

      if (mainNav) {
        const uploadLink = mainNav.querySelector('[data-page="upload"]');
        if (uploadLink) uploadLink.style.display = '';
      }

      this.setupUserMenu();
      this.updateUnreadBadge();
    } else {
      headerActions.innerHTML = `
        <button class="btn btn-ghost" id="login-btn">Login</button>
        <button class="btn btn-primary" id="signup-btn">Sign Up</button>
      `;

      if (mainNav) {
        const uploadLink = mainNav.querySelector('[data-page="upload"]');
        if (uploadLink) uploadLink.style.display = 'none';
      }

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

  async updateUnreadBadge() {
    if (!this.currentUser) return;

    try {
      const data = await API.messages.getUnreadCount();
      const badge = document.getElementById('unread-badge');
      if (badge) {
        if (data.unreadCount > 0) {
          badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Failed to get unread count:', error);
    }
  },

  showOnboardingModal() {
    const modalContent = document.getElementById('modal-content');

    const tagColors = {
      buying: '#10b981',
      selling: '#f59e0b',
      lending: '#3b82f6',
      borrowing: '#8b5cf6',
      looking: '#ec4899'
    };

    const categories = [
      {
        name: 'Seeking',
        description: 'Buy or sell intimate content or experiences',
        tags: ['buying', 'selling']
      },
      {
        name: 'Loans',
        description: 'Lend or borrow money',
        tags: ['lending', 'borrowing']
      },
      {
        name: 'Unspecified',
        description: 'Just browsing',
        tags: ['looking']
      }
    ];

    modalContent.innerHTML = `
      <div class="onboarding-modal">
        <h2 class="modal-title">Welcome to VerifiedUsers! 🎉</h2>
        <p class="onboarding-subtitle">Let others know what you're here for. Select at least one tag:</p>
        
        <div class="onboarding-categories" id="onboarding-tags">
          ${categories.map(cat => `
            <div class="onboarding-category">
              <h3 class="onboarding-category-name">${cat.name}</h3>
              <p class="onboarding-category-desc">${cat.description}</p>
              <div class="onboarding-category-tags">
                ${cat.tags.map(tag => `
                  <button type="button" class="onboarding-tag" data-tag="${tag}" style="--tag-color: ${tagColors[tag]}">
                    <span class="onboarding-tag-check">✓</span>
                    <span class="onboarding-tag-name">${tag.charAt(0).toUpperCase() + tag.slice(1)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        
        <p class="onboarding-hint">You can change these later in your settings.</p>
        
        <button class="btn btn-primary btn-lg onboarding-continue" id="onboarding-continue" disabled>
          Continue
        </button>
      </div>
    `;

    App.openModal();

    // Prevent closing the modal without completing onboarding
    const modal = document.getElementById('modal');
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.style.display = 'none';

    // Tag selection logic
    const selectedTags = new Set();
    const tagsContainer = document.getElementById('onboarding-tags');
    const continueBtn = document.getElementById('onboarding-continue');

    tagsContainer.addEventListener('click', (e) => {
      const tagBtn = e.target.closest('.onboarding-tag');
      if (!tagBtn) return;

      const tag = tagBtn.dataset.tag;
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        tagBtn.classList.remove('selected');
      } else {
        selectedTags.add(tag);
        tagBtn.classList.add('selected');
      }

      continueBtn.disabled = selectedTags.size === 0;
    });

    continueBtn.addEventListener('click', async () => {
      if (selectedTags.size === 0) return;

      continueBtn.disabled = true;
      continueBtn.textContent = 'Setting up...';

      try {
        const result = await API.auth.completeOnboarding([...selectedTags]);
        this.currentUser.tags = result.tags;
        this.currentUser.onboardingComplete = true;

        App.closeModal();
        if (closeBtn) closeBtn.style.display = '';

        App.showToast('Welcome aboard! Your profile is ready.', 'success');

        // Refresh the page to show updated content
        App.handleRoute();
      } catch (error) {
        App.showToast(error.message || 'Failed to complete setup', 'error');
        continueBtn.disabled = false;
        continueBtn.textContent = 'Continue';
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

        <div class="social-auth">
          <!-- Primary providers (always visible) -->
          <button class="social-btn google" data-provider="google">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          <button class="social-btn facebook" data-provider="facebook">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continue with Facebook
          </button>
          <button class="social-btn apple" data-provider="apple">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>

          <!-- Show More Button -->
          <button class="show-more-btn" id="show-more-providers">
            <span>More options</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
          </button>

          <!-- Hidden providers -->
          <div class="social-auth-more" id="social-auth-more">
            <button class="social-btn discord" data-provider="discord">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#5865F2">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Continue with Discord
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
          </div>
          
          <div class="auth-divider">
            <span>or continue with email</span>
          </div>
        </div>

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

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.showAuthModal(tab.dataset.mode);
      });
    });

    switchLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.showAuthModal(link.dataset.switch);
      });
    });

    socialBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const provider = btn.dataset.provider;
        this.handleSocialAuth(provider);
      });
    });

    // Show more providers toggle
    const showMoreBtn = document.getElementById('show-more-providers');
    const moreProviders = document.getElementById('social-auth-more');
    if (showMoreBtn && moreProviders) {
      showMoreBtn.addEventListener('click', () => {
        const isExpanded = moreProviders.classList.toggle('show');
        showMoreBtn.classList.toggle('expanded', isExpanded);
        showMoreBtn.querySelector('span').textContent = isExpanded ? 'Show less' : 'More options';
      });
    }

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

  async handleSocialAuth(provider) {
    const providerNames = {
      google: 'Google',
      apple: 'Apple',
      discord: 'Discord',
      facebook: 'Facebook',
      microsoft: 'Microsoft',
      twitter: 'X (Twitter)'
    };

    try {
      // Check which providers are configured
      const response = await fetch('/api/auth/providers');
      const providers = await response.json();

      if (providers[provider]) {
        // Provider is configured - redirect to OAuth
        App.closeModal();
        window.location.href = `/api/auth/${provider}`;
      } else {
        // Provider not configured
        App.showToast(`${providerNames[provider]} sign-in is not yet configured.`, 'info');
      }
    } catch (error) {
      // Fallback - try redirect anyway
      App.closeModal();
      window.location.href = `/api/auth/${provider}`;
    }
  }
};

// Check for OAuth callback status on page load
// This runs early to capture the URL params before they're cleared
(function checkOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('oauth') === 'success') {
    // Store flag to show success message after app initializes
    sessionStorage.setItem('oauth_success', 'true');
    // Clear the URL parameter immediately
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (urlParams.get('error')) {
    const error = urlParams.get('error');
    sessionStorage.setItem('oauth_error', error);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
})();

// Hook into Auth.init to show OAuth messages after authentication loads
const originalAuthInit = Auth.init.bind(Auth);
Auth.init = async function () {
  await originalAuthInit();

  // Check for OAuth success/error after auth state is loaded
  const oauthSuccess = sessionStorage.getItem('oauth_success');
  const oauthError = sessionStorage.getItem('oauth_error');

  if (oauthSuccess) {
    sessionStorage.removeItem('oauth_success');
    if (this.isLoggedIn()) {
      // Small delay to ensure App is ready
      setTimeout(() => {
        if (window.App && window.App.showToast) {
          window.App.showToast(`Welcome, ${this.currentUser.displayName || this.currentUser.username}!`, 'success');
        }
      }, 100);
    }
  }

  if (oauthError) {
    sessionStorage.removeItem('oauth_error');
    setTimeout(() => {
      if (window.App && window.App.showToast) {
        window.App.showToast(`Login failed: ${oauthError.replace(/_/g, ' ')}`, 'error');
      }
    }, 100);
  }
};

window.Auth = Auth;

