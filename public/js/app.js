// Main App Module - Handles routing and global functionality
const App = {
  searchTimeout: null,
  currentTagFilter: null,
  validTags: ['buying', 'selling', 'lending', 'borrowing', 'looking'],

  async init() {
    await Auth.init();
    this.setupRouting();
    this.setupGlobalEvents();
    this.handleRoute();
  },

  setupRouting() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-link], .nav-link, .logo');
      if (link && link.href) {
        e.preventDefault();
        const url = new URL(link.href);
        this.navigateTo(url.pathname);
      }
    });

    window.addEventListener('popstate', () => {
      this.handleRoute();
    });
  },

  navigateTo(path) {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    this.handleRoute();
  },

  async handleRoute() {
    const path = window.location.pathname;
    const main = document.getElementById('main-content');

    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === path ||
        (path === '/' && link.dataset.page === 'home'));
    });

    let html = '';
    let initFn = null;

    switch (path) {
      case '/':
        html = this.renderSearchPage();
        initFn = () => this.initSearchPage();
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
        if (path.startsWith('/u/')) {
          const username = path.split('/')[2];
          html = await this.renderUserProfile(username);
          initFn = () => this.initUserProfile(username);
        } else {
          html = this.render404();
        }
    }

    main.innerHTML = html;

    if (initFn) {
      initFn();
    }

    window.scrollTo(0, 0);
  },

  // Tag colors
  getTagColor(tag) {
    const colors = {
      buying: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
      selling: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
      lending: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
      borrowing: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
      looking: { bg: 'rgba(251, 146, 60, 0.15)', text: '#fb923c', border: 'rgba(251, 146, 60, 0.3)' }
    };
    return colors[tag] || { bg: 'var(--surface-2)', text: 'var(--text-secondary)', border: 'var(--border-default)' };
  },

  renderTag(tag, clickable = false) {
    const color = this.getTagColor(tag);
    const clickAttr = clickable ? `data-tag-filter="${tag}"` : '';
    return `<span class="tag" ${clickAttr} style="background: ${color.bg}; color: ${color.text}; border-color: ${color.border};">${tag}</span>`;
  },

  renderTags(tags, clickable = false) {
    if (!tags || tags.length === 0) return '';
    return `<div class="tags-container">${tags.map(t => this.renderTag(t, clickable)).join('')}</div>`;
  },

  // Search page
  renderSearchPage() {
    return `
      <div class="container">
        <div class="search-hero">
          <h1 class="search-hero-title">
            Find <span class="gradient-text">Verified</span> Users
          </h1>
          <p class="search-hero-subtitle">
            Search for users or browse by activity tag
          </p>
          
          <div class="search-container">
            <div class="search-input-wrapper">
              <span class="search-icon">🔍</span>
              <input 
                type="text" 
                id="search-input" 
                class="search-input" 
                placeholder="Search users..."
                autocomplete="off"
                autofocus
              >
              <div class="search-spinner" id="search-spinner" style="display: none;"></div>
            </div>
            
            <div class="tag-filters" id="tag-filters">
              <span class="tag-filter-label">Filter by:</span>
              ${this.validTags.map(tag => `
                <button class="tag-filter-btn" data-tag="${tag}">
                  ${this.renderTag(tag)}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="search-results" id="search-results">
          <div class="search-placeholder">
            <div class="search-placeholder-icon">👥</div>
            <p>Start typing to search for users</p>
          </div>
        </div>
      </div>
    `;
  },

  initSearchPage() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const searchSpinner = document.getElementById('search-spinner');
    const tagFilters = document.getElementById('tag-filters');

    this.currentTagFilter = null;

    // Tag filter clicks
    tagFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-filter-btn');
      if (!btn) return;

      const tag = btn.dataset.tag;

      // Toggle active state
      if (this.currentTagFilter === tag) {
        this.currentTagFilter = null;
        btn.classList.remove('active');
      } else {
        document.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
        this.currentTagFilter = tag;
        btn.classList.add('active');
      }

      // Re-trigger search
      this.performSearch(searchInput.value.trim(), searchResults, searchSpinner);
    });

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      this.performSearch(query, searchResults, searchSpinner);
    });

    searchInput.focus();
  },

  performSearch(query, searchResults, searchSpinner) {
    clearTimeout(this.searchTimeout);

    const hasQuery = query.length >= 2;
    const hasTag = this.currentTagFilter !== null;

    // Must have at least a query or a tag filter
    if (!hasQuery && !hasTag) {
      searchResults.innerHTML = `
        <div class="search-placeholder">
          <div class="search-placeholder-icon">👥</div>
          <p>${query.length === 0 ? 'Start typing to search for users, or click a tag to browse' : 'Type at least 2 characters'}</p>
        </div>
      `;
      return;
    }

    searchSpinner.style.display = 'block';

    this.searchTimeout = setTimeout(async () => {
      try {
        const data = await API.users.search(hasQuery ? query : '', this.currentTagFilter);
        searchSpinner.style.display = 'none';

        if (data.users.length === 0) {
          const filterDesc = [];
          if (hasQuery) filterDesc.push(`"${query}"`);
          if (hasTag) filterDesc.push(`tag "${this.currentTagFilter}"`);

          searchResults.innerHTML = `
            <div class="search-placeholder">
              <div class="search-placeholder-icon">🔍</div>
              <p>No users found ${filterDesc.length ? 'for ' + filterDesc.join(' with ') : ''}</p>
            </div>
          `;
        } else {
          const headerText = hasTag && !hasQuery
            ? `${data.pagination.total} user${data.pagination.total !== 1 ? 's' : ''} ${this.currentTagFilter}`
            : `${data.pagination.total} user${data.pagination.total !== 1 ? 's' : ''} found`;

          searchResults.innerHTML = `
            <div class="search-results-header">
              <span>${headerText}</span>
            </div>
            <div class="user-grid" id="user-grid">
              ${data.users.map(user => this.renderUserCard(user)).join('')}
            </div>
          `;
        }
      } catch (error) {
        searchSpinner.style.display = 'none';
        this.showToast(error.message, 'error');
      }
    }, 300);
  },

  renderUserCard(user) {
    const initials = (user.displayName || user.username)
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return `
      <a href="/u/${user.username}" class="user-card" data-link>
        <div class="user-card-avatar">
          ${user.avatarUrl
        ? `<img src="${user.avatarUrl}" alt="${user.displayName || user.username}">`
        : `<span>${initials}</span>`
      }
        </div>
        <div class="user-card-info">
          <h3 class="user-card-name">${user.displayName || user.username}</h3>
          <p class="user-card-username">@${user.username}</p>
          ${this.renderTags(user.tags)}
          ${user.bio ? `<p class="user-card-bio">${user.bio}</p>` : ''}
        </div>
        <div class="user-card-stats">
          <span class="user-card-stat">
            <span class="user-card-stat-value">${user.imageCount}</span>
            <span class="user-card-stat-label">images</span>
          </span>
        </div>
      </a>
    `;
  },

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
            ${this.renderTags(user.tags)}
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

  async initProfilePage() {
    try {
      const data = await API.images.getMyImages(1, 20);

      const statsEl = document.getElementById('profile-stats');
      statsEl.innerHTML = `
        <div class="profile-stat">
          <div class="profile-stat-value">${data.pagination.total}</div>
          <div class="profile-stat-label">Images</div>
        </div>
      `;

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
              <label class="form-label" for="settings-username">Username</label>
              <input type="text" id="settings-username" name="username" class="form-input" 
                value="${user.username || ''}" placeholder="your_username" 
                pattern="^[a-zA-Z0-9_]{3,30}$" minlength="3" maxlength="30">
              <p class="form-helper">3-30 characters, letters, numbers, and underscores only. This is your unique @handle.</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="settings-displayName">Display Name</label>
              <input type="text" id="settings-displayName" name="displayName" class="form-input" 
                value="${user.displayName || ''}" placeholder="Your display name">
              <p class="form-helper">This is shown on your profile and can be anything you like.</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="settings-bio">Bio</label>
              <textarea id="settings-bio" name="bio" class="form-input form-textarea" 
                placeholder="Tell us about yourself...">${user.bio || ''}</textarea>
            </div>

            <button type="submit" class="btn btn-primary" id="profile-submit">Save Profile</button>
          </form>
        </div>

        <div class="card" style="padding: var(--space-6); margin-bottom: var(--space-6);">
          <h2 style="font-size: var(--font-size-xl); font-weight: 600; margin-bottom: var(--space-4);">
            Activity Tags
          </h2>
          <p style="color: var(--text-tertiary); margin-bottom: var(--space-6); font-size: var(--font-size-sm);">
            Select tags that describe what you're looking for. Others can filter by these tags.
          </p>
          
          <div class="tag-selector" id="tag-selector">
            ${this.validTags.map(tag => {
      const isActive = user.tags && user.tags.includes(tag);
      const color = this.getTagColor(tag);
      return `
                <label class="tag-checkbox ${isActive ? 'active' : ''}" style="--tag-bg: ${color.bg}; --tag-color: ${color.text}; --tag-border: ${color.border};">
                  <input type="checkbox" name="tags" value="${tag}" ${isActive ? 'checked' : ''}>
                  <span class="tag-checkbox-label">${tag}</span>
                </label>
              `;
    }).join('')}
          </div>

          <button type="button" class="btn btn-primary" id="tags-submit" style="margin-top: var(--space-6);">
            Save Tags
          </button>
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

        <div class="card" style="padding: var(--space-6); border-color: var(--error);">
          <h2 style="font-size: var(--font-size-xl); font-weight: 600; margin-bottom: var(--space-4); color: var(--error);">
            ⚠️ Danger Zone
          </h2>
          <p style="color: var(--text-tertiary); margin-bottom: var(--space-6); font-size: var(--font-size-sm);">
            Once you delete your account, there is no going back. All your data, images, and settings will be permanently removed.
          </p>
          
          <button type="button" class="btn btn-danger" id="delete-account-btn">
            Delete My Account
          </button>
        </div>
      </div>
    `;
  },

  initSettingsPage() {
    // Tag selector interactivity
    const tagSelector = document.getElementById('tag-selector');
    tagSelector.addEventListener('change', (e) => {
      const label = e.target.closest('.tag-checkbox');
      if (label) {
        label.classList.toggle('active', e.target.checked);
      }
    });

    // Save tags
    document.getElementById('tags-submit').addEventListener('click', async () => {
      const checkboxes = document.querySelectorAll('#tag-selector input[type="checkbox"]:checked');
      const tags = Array.from(checkboxes).map(cb => cb.value);

      const btn = document.getElementById('tags-submit');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        await API.auth.updateTags(tags);
        await Auth.init();
        this.showToast('Tags updated', 'success');
      } catch (error) {
        this.showToast(error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Tags';
      }
    });

    // Profile form
    const profileForm = document.getElementById('profile-form');
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('profile-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        await API.auth.updateProfile({
          username: document.getElementById('settings-username').value,
          displayName: document.getElementById('settings-displayName').value,
          bio: document.getElementById('settings-bio').value,
        });

        await Auth.init();
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

    // Delete account button
    document.getElementById('delete-account-btn').addEventListener('click', () => {
      this.showDeleteAccountModal();
    });
  },

  showDeleteAccountModal() {
    const user = Auth.currentUser;
    // Only require password if user has one (OAuth-only users don't)
    const requiresPassword = user.hasPassword === true;

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
      <div class="auth-modal">
        <div class="auth-header">
          <h2 class="auth-title" style="color: var(--error);">⚠️ Delete Account</h2>
          <p class="auth-subtitle">This action cannot be undone. All your data will be permanently deleted.</p>
        </div>

        <form id="delete-account-form">
          ${requiresPassword ? `
            <div class="form-group">
              <label class="form-label" for="delete-password">Your Password</label>
              <input type="password" id="delete-password" name="password" class="form-input" 
                placeholder="Enter your password to confirm" required>
            </div>
          ` : ''}

          <div class="form-group">
            <label class="form-label" for="delete-confirmation">Type DELETE to confirm</label>
            <input type="text" id="delete-confirmation" name="confirmation" class="form-input" 
              placeholder="Type DELETE" required pattern="DELETE">
            <p class="form-helper">This is case-sensitive</p>
          </div>

          <div style="display: flex; gap: var(--space-3); margin-top: var(--space-6);">
            <button type="button" class="btn btn-secondary" id="cancel-delete" style="flex: 1;">
              Cancel
            </button>
            <button type="submit" class="btn btn-danger" id="confirm-delete" style="flex: 1;">
              Delete Permanently
            </button>
          </div>
        </form>
      </div>
    `;

    this.openModal();

    // Cancel button
    document.getElementById('cancel-delete').addEventListener('click', () => {
      this.closeModal();
    });

    // Form submission
    document.getElementById('delete-account-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const confirmation = document.getElementById('delete-confirmation').value;
      if (confirmation !== 'DELETE') {
        this.showToast('Please type DELETE exactly to confirm', 'error');
        return;
      }

      const passwordInput = document.getElementById('delete-password');
      const password = passwordInput ? passwordInput.value : null;

      const submitBtn = document.getElementById('confirm-delete');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Deleting...';

      try {
        await API.auth.deleteAccount(password, confirmation);
        this.closeModal();
        Auth.currentUser = null;
        Auth.updateUI();
        this.navigateTo('/');
        this.showToast('Your account has been deleted', 'success');
      } catch (error) {
        this.showToast(error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Delete Permanently';
      }
    });
  },

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

  async initUserProfile(username) {
    try {
      const user = await API.users.getProfile(username);
      const images = await API.users.getUserImages(username);

      const initials = (user.displayName || user.username)
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      const header = document.getElementById('user-profile-header');
      header.innerHTML = `
        <div class="profile-avatar">
          ${user.avatarUrl
          ? `<img src="${user.avatarUrl}" alt="${user.displayName}">`
          : initials
        }
        </div>
        <div class="profile-info">
          <h1 class="profile-name">${user.displayName || user.username}</h1>
          <p class="profile-username">@${user.username}</p>
          ${this.renderTags(user.tags)}
          ${user.bio ? `<p class="profile-bio">${user.bio}</p>` : ''}
          <div class="profile-stats">
            <div class="profile-stat">
              <div class="profile-stat-value">${user.stats.publicImages}</div>
              <div class="profile-stat-label">Images</div>
            </div>
          </div>
        </div>
      `;

      document.getElementById('user-gallery-title').textContent = `${user.displayName || user.username}'s Images`;

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

  render404() {
    return `
      <div class="container">
        <div class="search-hero">
          <h1 class="search-hero-title" style="font-size: 8rem;">404</h1>
          <h2 style="font-size: var(--font-size-2xl); margin-bottom: var(--space-4);">Page Not Found</h2>
          <p class="search-hero-subtitle">The page you're looking for doesn't exist or has been moved.</p>
          <a href="/" class="btn btn-primary btn-lg" data-link style="margin-top: var(--space-4);">Back to Search</a>
        </div>
      </div>
    `;
  },

  setupGlobalEvents() {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalClose = document.getElementById('modal-close');

    modalClose.addEventListener('click', () => this.closeModal());
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        this.closeModal();
      }
    });

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

  openModal() {
    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
  },

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

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 200);
      }
    }, 5000);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.App = App;
