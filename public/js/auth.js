// Auth Module - Handles authentication UI and state
const Auth = {
    currentUser: null,

    // Initialize auth state
    async init() {
        try {
            const data = await API.auth.getMe();
            this.currentUser = data;
            this.updateUI();
            return data;
        } catch (error) {
            this.currentUser = null;
            this.updateUI();
            return null;
        }
    },

    // Check if user is logged in
    isLoggedIn() {
        return !!this.currentUser;
    },

    // Update header UI based on auth state
    updateUI() {
        const headerActions = document.getElementById('header-actions');

        if (this.currentUser) {
            headerActions.innerHTML = `
        <div class="user-menu" id="user-menu">
          <button class="user-menu-trigger" id="user-menu-trigger">
            <div class="user-avatar" id="user-avatar">
              ${this.currentUser.avatarUrl
                    ? `<img src="${this.currentUser.avatarUrl}" alt="${this.currentUser.displayName}">`
                    : this.getInitials(this.currentUser.displayName || this.currentUser.username)
                }
            </div>
            <span class="user-name">${this.currentUser.displayName || this.currentUser.username}</span>
            <span style="font-size: 0.75rem; color: var(--text-tertiary);">▼</span>
          </button>
          <div class="user-dropdown" id="user-dropdown">
            <a href="/my-images" class="user-dropdown-item" data-link>
              <span>🖼️</span>
              <span>My Images</span>
            </a>
            <a href="/profile" class="user-dropdown-item" data-link>
              <span>👤</span>
              <span>Profile</span>
            </a>
            <a href="/settings" class="user-dropdown-item" data-link>
              <span>⚙️</span>
              <span>Settings</span>
            </a>
            <div class="user-dropdown-divider"></div>
            <button class="user-dropdown-item danger" id="logout-btn">
              <span>🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      `;

            // Setup dropdown toggle
            const trigger = document.getElementById('user-menu-trigger');
            const dropdown = document.getElementById('user-dropdown');

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('open');
            });

            document.addEventListener('click', () => {
                dropdown.classList.remove('open');
            });

            // Setup logout
            document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        } else {
            headerActions.innerHTML = `
        <button class="btn btn-ghost" id="login-btn">Log In</button>
        <button class="btn btn-primary" id="signup-btn">Sign Up</button>
      `;

            document.getElementById('login-btn').addEventListener('click', () => this.showModal('login'));
            document.getElementById('signup-btn').addEventListener('click', () => this.showModal('register'));
        }
    },

    // Get user initials
    getInitials(name) {
        return name
            .split(' ')
            .map(part => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    },

    // Show auth modal
    showModal(type = 'login') {
        const modalContent = document.getElementById('modal-content');
        modalContent.innerHTML = this.getModalHTML(type);

        App.openModal();
        this.setupModalEvents(type);
    },

    // Get modal HTML
    getModalHTML(type) {
        return `
      <div class="auth-modal">
        <div class="auth-header">
          <h2 class="auth-title">${type === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
          <p class="auth-subtitle">${type === 'login'
                ? 'Sign in to access your images'
                : 'Join to start sharing your images'
            }</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${type === 'login' ? 'active' : ''}" data-tab="login">Log In</button>
          <button class="auth-tab ${type === 'register' ? 'active' : ''}" data-tab="register">Sign Up</button>
        </div>

        <form id="auth-form">
          ${type === 'register' ? `
            <div class="form-group">
              <label class="form-label" for="username">Username</label>
              <input type="text" id="username" name="username" class="form-input" 
                placeholder="Choose a username" required minlength="3" maxlength="30"
                pattern="[a-zA-Z0-9_]+" title="Only letters, numbers, and underscores">
              <p class="form-helper">3-30 characters, letters, numbers, and underscores only</p>
            </div>
          ` : ''}

          <div class="form-group">
            <label class="form-label" for="login">${type === 'login' ? 'Email or Username' : 'Email'}</label>
            <input type="${type === 'login' ? 'text' : 'email'}" id="login" name="login" 
              class="form-input" placeholder="${type === 'login' ? 'Enter email or username' : 'Enter your email'}" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input type="password" id="password" name="password" class="form-input" 
              placeholder="Enter password" required minlength="8">
            ${type === 'register'
                ? '<p class="form-helper">At least 8 characters with uppercase, lowercase, and number</p>'
                : ''
            }
          </div>

          ${type === 'register' ? `
            <div class="form-group">
              <label class="form-label" for="displayName">Display Name (optional)</label>
              <input type="text" id="displayName" name="displayName" class="form-input" 
                placeholder="Your display name">
            </div>
          ` : ''}

          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;" id="auth-submit">
            ${type === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p class="auth-footer">
          ${type === 'login'
                ? 'Don\'t have an account? <a href="#" data-switch="register">Sign up</a>'
                : 'Already have an account? <a href="#" data-switch="login">Log in</a>'
            }
        </p>
      </div>
    `;
    },

    // Setup modal events
    setupModalEvents(currentType) {
        const form = document.getElementById('auth-form');
        const tabs = document.querySelectorAll('.auth-tab');
        const switchLinks = document.querySelectorAll('[data-switch]');

        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const newType = tab.dataset.tab;
                if (newType !== currentType) {
                    document.getElementById('modal-content').innerHTML = this.getModalHTML(newType);
                    this.setupModalEvents(newType);
                }
            });
        });

        // Footer links
        switchLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const newType = link.dataset.switch;
                document.getElementById('modal-content').innerHTML = this.getModalHTML(newType);
                this.setupModalEvents(newType);
            });
        });

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('auth-submit');
            const originalText = submitBtn.textContent;

            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Please wait...';

                const formData = new FormData(form);
                const data = Object.fromEntries(formData);

                if (currentType === 'login') {
                    await API.auth.login({ login: data.login, password: data.password });
                    App.showToast('Welcome back!', 'success');
                } else {
                    await API.auth.register({
                        username: data.username,
                        email: data.login,
                        password: data.password,
                        displayName: data.displayName || undefined,
                    });
                    App.showToast('Account created successfully!', 'success');
                }

                App.closeModal();
                await this.init();

                // Refresh current page
                App.navigateTo(window.location.pathname);
            } catch (error) {
                App.showToast(error.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    },

    // Logout
    async logout() {
        try {
            await API.auth.logout();
            this.currentUser = null;
            this.updateUI();
            App.showToast('Logged out successfully', 'success');
            App.navigateTo('/');
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
};

window.Auth = Auth;
