// Main App Module - Handles routing and global functionality
const App = {
    // Initialize application
    async init() {
        // Initialize auth state
        await Auth.init();

        // Setup routing
        this.setupRouting();

        // Setup global event listeners
        this.setupGlobalEvents();

        // Initial route
        this.handleRoute();
    },

    // Setup client-side routing
    setupRouting() {
        // Handle link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-link], .nav-link, .logo');
            if (link && link.href) {
                e.preventDefault();
                const url = new URL(link.href);
                this.navigateTo(url.pathname);
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            this.handleRoute();
        });
    },

    // Navigate to path
    navigateTo(path) {
        if (window.location.pathname !== path) {
            window.history.pushState(null, '', path);
        }
        this.handleRoute();
    },

    // Handle current route
    async handleRoute() {
        const path = window.location.pathname;
        const main = document.getElementById('main-content');

        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === path ||
                (path === '/' && link.dataset.page === 'home'));
        });

        // Route handling
        let html = '';
        let initFn = null;

        switch (path) {
            case '/':
                html = await Gallery.renderPublicGallery();
                initFn = () => Gallery.init('public');
                break;

            case '/upload':
                html = Upload.render();
                initFn = () => Upload.init();
                break;

            case '/my-images':
                html = await Gallery.renderMyImages();
                initFn = () => Gallery.init('my');
                break;

            case '/profile':
                html = this.renderProfilePage();
                initFn = () => this.initProfilePage();
                break;

            case '/settings':
                html = this.renderSettingsPage();
                initFn = () => this.initSettingsPage();
                break;

            default:
                // Check for user profile route /u/username
                if (path.startsWith('/u/')) {
                    const username = path.split('/')[2];
                    html = await this.renderUserProfile(username);
                    initFn = () => this.initUserProfile(username);
                } else {
                    html = this.render404();
                }
        }

        main.innerHTML = html;

        // Initialize page-specific functionality
        if (initFn) {
            initFn();
        }

        // Scroll to top
        window.scrollTo(0, 0);
    },

    // Render profile page
    renderProfilePage() {
        if (!Auth.isLoggedIn()) {
            this.navigateTo('/');
            return '';
        }

        const user = Auth.currentUser;
        return `
      <div class="container">
        <div class="profile-header">
          <div class="profile-avatar" id="profile-avatar">
            ${user.avatarUrl
                ? `<img src="${user.avatarUrl}" alt="${user.displayName}">`
                : Auth.getInitials(user.displayName || user.username)
            }
          </div>
          <div class="profile-info">
            <h1 class="profile-name">${user.displayName || user.username}</h1>
            <p class="profile-username">@${user.username}</p>
            ${user.bio ? `<p class="profile-bio">${user.bio}</p>` : ''}
            <div class="profile-stats" id="profile-stats">
              <div class="loading"><div class="spinner"></div></div>
            </div>
          </div>
        </div>

        <div class="gallery-header">
          <h2 class="gallery-title">My Images</h2>
          <a href="/upload" class="btn btn-primary" data-link>Upload Images</a>
        </div>

        <div class="gallery-grid" id="gallery-grid">
          <div class="loading" style="grid-column: 1 / -1;">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    `;
    },

    // Initialize profile page
    async initProfilePage() {
        // Load stats and images
        try {
            const data = await API.images.getMyImages(1, 20);

            // Update stats
            const statsEl = document.getElementById('profile-stats');
            statsEl.innerHTML = `
        <div class="profile-stat">
          <div class="profile-stat-value">${data.pagination.total}</div>
          <div class="profile-stat-label">Images</div>
        </div>
      `;

            // Display images
            const grid = document.getElementById('gallery-grid');
            if (data.images.length === 0) {
                grid.innerHTML = `
          <div class="gallery-empty">
            <div class="gallery-empty-icon">📷</div>
            <h3 class="gallery-empty-title">No images yet</h3>
            <a href="/upload" class="btn btn-primary" style="margin-top: var(--space-4);" data-link>
              Upload Your First Image
            </a>
          </div>
        `;
            } else {
                grid.innerHTML = '';
                Gallery.currentImages = data.images;
                data.images.forEach((image, index) => {
                    const card = Gallery.createImageCard(image, 'my', index);
                    grid.appendChild(card);
                });
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // Render settings page
    renderSettingsPage() {
        if (!Auth.isLoggedIn()) {
            this.navigateTo('/');
            return '';
        }

        const user = Auth.currentUser;
        return `
      <div class="container" style="max-width: 600px;">
        <h1 style="font-size: var(--font-size-3xl); font-weight: 700; margin-bottom: var(--space-8);">
          Settings
        </h1>

        <div class="card" style="padding: var(--space-6); margin-bottom: var(--space-6);">
          <h2 style="font-size: var(--font-size-xl); font-weight: 600; margin-bottom: var(--space-6);">
            Profile Information
          </h2>
          
          <form id="profile-form">
            <div class="form-group">
              <label class="form-label" for="settings-displayName">Display Name</label>
              <input type="text" id="settings-displayName" name="displayName" class="form-input" 
                value="${user.displayName || ''}" placeholder="Your display name">
            </div>

            <div class="form-group">
              <label class="form-label" for="settings-bio">Bio</label>
              <textarea id="settings-bio" name="bio" class="form-input form-textarea" 
                placeholder="Tell us about yourself...">${user.bio || ''}</textarea>
            </div>

            <button type="submit" class="btn btn-primary" id="profile-submit">Save Profile</button>
          </form>
        </div>

        <div class="card" style="padding: var(--space-6);">
          <h2 style="font-size: var(--font-size-xl); font-weight: 600; margin-bottom: var(--space-6);">
            Change Password
          </h2>
          
          <form id="password-form">
            <div class="form-group">
              <label class="form-label" for="current-password">Current Password</label>
              <input type="password" id="current-password" name="currentPassword" 
                class="form-input" placeholder="Enter current password" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-password">New Password</label>
              <input type="password" id="new-password" name="newPassword" 
                class="form-input" placeholder="Enter new password" required minlength="8">
              <p class="form-helper">At least 8 characters with uppercase, lowercase, and number</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="confirm-password">Confirm New Password</label>
              <input type="password" id="confirm-password" name="confirmPassword" 
                class="form-input" placeholder="Confirm new password" required>
            </div>

            <button type="submit" class="btn btn-primary" id="password-submit">Change Password</button>
          </form>
        </div>
      </div>
    `;
    },

    // Initialize settings page
    initSettingsPage() {
        // Profile form
        const profileForm = document.getElementById('profile-form');
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('profile-submit');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                await API.auth.updateProfile({
                    displayName: document.getElementById('settings-displayName').value,
                    bio: document.getElementById('settings-bio').value,
                });

                await Auth.init(); // Refresh user data
                this.showToast('Profile updated', 'success');
            } catch (error) {
                this.showToast(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Profile';
            }
        });

        // Password form
        const passwordForm = document.getElementById('password-form');
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newPass = document.getElementById('new-password').value;
            const confirmPass = document.getElementById('confirm-password').value;

            if (newPass !== confirmPass) {
                this.showToast('Passwords do not match', 'error');
                return;
            }

            const submitBtn = document.getElementById('password-submit');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Changing...';

            try {
                await API.auth.changePassword({
                    currentPassword: document.getElementById('current-password').value,
                    newPassword: newPass,
                });

                this.showToast('Password changed successfully', 'success');
                passwordForm.reset();
            } catch (error) {
                this.showToast(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Change Password';
            }
        });
    },

    // Render user profile
    async renderUserProfile(username) {
        return `
      <div class="container">
        <div class="profile-header" id="user-profile-header">
          <div class="loading" style="width: 100%;"><div class="spinner"></div></div>
        </div>

        <div class="gallery-header">
          <h2 class="gallery-title" id="user-gallery-title">Images</h2>
        </div>

        <div class="gallery-grid" id="gallery-grid">
          <div class="loading" style="grid-column: 1 / -1;">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    `;
    },

    // Initialize user profile
    async initUserProfile(username) {
        try {
            const user = await API.users.getProfile(username);
            const images = await API.users.getUserImages(username);

            // Update header
            const header = document.getElementById('user-profile-header');
            header.innerHTML = `
        <div class="profile-avatar">
          ${user.avatarUrl
                    ? `<img src="${user.avatarUrl}" alt="${user.displayName}">`
                    : Auth.getInitials(user.displayName || user.username)
                }
        </div>
        <div class="profile-info">
          <h1 class="profile-name">${user.displayName || user.username}</h1>
          <p class="profile-username">@${user.username}</p>
          ${user.bio ? `<p class="profile-bio">${user.bio}</p>` : ''}
          <div class="profile-stats">
            <div class="profile-stat">
              <div class="profile-stat-value">${user.stats.publicImages}</div>
              <div class="profile-stat-label">Images</div>
            </div>
          </div>
        </div>
      `;

            // Update gallery title
            document.getElementById('user-gallery-title').textContent = `${user.displayName || user.username}'s Images`;

            // Display images
            const grid = document.getElementById('gallery-grid');
            if (images.images.length === 0) {
                grid.innerHTML = `
          <div class="gallery-empty">
            <div class="gallery-empty-icon">📷</div>
            <h3 class="gallery-empty-title">No public images</h3>
            <p class="gallery-empty-text">This user hasn't shared any images yet.</p>
          </div>
        `;
            } else {
                grid.innerHTML = '';
                Gallery.currentImages = images.images;
                images.images.forEach((image, index) => {
                    const card = Gallery.createImageCard(image, 'public', index);
                    grid.appendChild(card);
                });
            }
        } catch (error) {
            this.showToast(error.message, 'error');
            this.navigateTo('/');
        }
    },

    // Render 404 page
    render404() {
        return `
      <div class="container">
        <div class="hero">
          <h1 class="hero-title" style="font-size: 8rem;">404</h1>
          <h2 style="font-size: var(--font-size-2xl); margin-bottom: var(--space-4);">Page Not Found</h2>
          <p class="hero-subtitle">The page you're looking for doesn't exist or has been moved.</p>
          <div class="hero-actions">
            <a href="/" class="btn btn-primary btn-lg" data-link>Back to Home</a>
          </div>
        </div>
      </div>
    `;
    },

    // Setup global events
    setupGlobalEvents() {
        // Modal close
        const modalOverlay = document.getElementById('modal-overlay');
        const modalClose = document.getElementById('modal-close');

        modalClose.addEventListener('click', () => this.closeModal());
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                this.closeModal();
            }
        });

        // Lightbox
        const lightbox = document.getElementById('lightbox');
        const lightboxClose = document.getElementById('lightbox-close');
        const lightboxPrev = document.getElementById('lightbox-prev');
        const lightboxNext = document.getElementById('lightbox-next');

        lightboxClose.addEventListener('click', () => Gallery.closeLightbox());
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.id === 'lightbox-content') {
                Gallery.closeLightbox();
            }
        });
        lightboxPrev.addEventListener('click', () => Gallery.navigateLightbox(-1));
        lightboxNext.addEventListener('click', () => Gallery.navigateLightbox(1));

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (lightbox.classList.contains('open')) {
                if (e.key === 'Escape') Gallery.closeLightbox();
                if (e.key === 'ArrowLeft') Gallery.navigateLightbox(-1);
                if (e.key === 'ArrowRight') Gallery.navigateLightbox(1);
            }

            if (modalOverlay.classList.contains('open') && e.key === 'Escape') {
                this.closeModal();
            }
        });
    },

    // Open modal
    openModal() {
        document.getElementById('modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    },

    // Close modal
    closeModal() {
        document.getElementById('modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
    },

    // Show toast notification
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
        };

        toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;

        container.appendChild(toast);

        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });

        // Auto remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 200);
            }
        }, 5000);
    },
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

window.App = App;
