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

      case '/messages':
        html = await this.renderMessagesPage();
        initFn = () => this.initMessagesPage();
        break;

      default:
        if (path.startsWith('/u/')) {
          const username = path.split('/')[2];
          html = await this.renderUserProfile(username);
          initFn = () => this.initUserProfile(username);
        } else if (path.startsWith('/messages/')) {
          const conversationId = path.split('/')[2];
          html = await this.renderMessagesPage(conversationId);
          initFn = () => this.initMessagesPage(conversationId);
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
        <div class="profile-avatar-container">
          <div class="profile-avatar">
            ${user.avatarUrl
          ? `<img src="${user.avatarUrl}" alt="${user.displayName}">`
          : initials
        }
          </div>
          ${Auth.currentUser && Auth.currentUser.id !== user.id ? `
            <button class="profile-message-btn" id="message-user-btn" data-user-id="${user.id}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              </svg>
              Message
            </button>
          ` : ''}
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

      // Add message button handler
      const messageBtn = document.getElementById('message-user-btn');
      if (messageBtn) {
        messageBtn.addEventListener('click', () => {
          this.startConversationWith(messageBtn.dataset.userId);
        });
      }

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

  // Messages Page
  currentConversationId: null,
  messageRefreshInterval: null,

  async renderMessagesPage(conversationId = null) {
    if (!Auth.currentUser) {
      return `
        <div class="container">
          <div class="search-hero">
            <h1 class="search-hero-title">Messages</h1>
            <p class="search-hero-subtitle">Please log in to view your messages.</p>
            <button class="btn btn-primary btn-lg" onclick="Auth.showAuthModal('login')">Login</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="container" style="max-width: 1200px;">
        <div class="messages-container">
          <div class="conversation-list" id="conversation-list">
            <div class="conversation-list-header">Messages</div>
            <div id="conversations-container">
              <div class="conversation-empty">
                <p>Loading conversations...</p>
              </div>
            </div>
          </div>
          <div class="chat-area" id="chat-area">
            <div class="no-chat-selected" id="no-chat-selected">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              </svg>
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the list or start a new one from someone's profile.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async initMessagesPage(conversationId = null) {
    if (!Auth.currentUser) return;

    await this.loadConversations();

    if (conversationId) {
      this.openConversation(conversationId);
    }
  },

  async loadConversations() {
    try {
      const data = await API.messages.getConversations();
      const container = document.getElementById('conversations-container');

      if (data.conversations.length === 0) {
        container.innerHTML = `
          <div class="conversation-empty">
            <p>No conversations yet</p>
            <p style="font-size: var(--font-size-sm); margin-top: var(--space-2);">Start a conversation from someone's profile</p>
          </div>
        `;
        return;
      }

      container.innerHTML = data.conversations.map(conv => `
        <div class="conversation-item" data-conversation-id="${conv.id}">
          <div class="conversation-avatar">
            ${conv.other_avatar_url
          ? `<img src="${conv.other_avatar_url}" alt="${conv.other_display_name || conv.other_username}">`
          : (conv.other_display_name || conv.other_username || '?').charAt(0).toUpperCase()
        }
          </div>
          <div class="conversation-info">
            <div class="conversation-name">${conv.other_display_name || conv.other_username}</div>
            <div class="conversation-preview">${conv.last_message || 'No messages yet'}</div>
          </div>
          <div class="conversation-meta">
            <div class="conversation-time">${this.formatMessageTime(conv.last_message_at)}</div>
            ${conv.unread_count > 0 ? `<div class="conversation-unread">${conv.unread_count}</div>` : ''}
          </div>
        </div>
      `).join('');

      // Add click handlers
      container.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
          this.openConversation(item.dataset.conversationId);
        });
      });
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  },

  async openConversation(conversationId) {
    this.currentConversationId = conversationId;

    // Update active state
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.classList.toggle('active', item.dataset.conversationId === conversationId);
    });

    try {
      const data = await API.messages.getMessages(conversationId);
      const convData = await API.messages.getConversations();
      const conv = convData.conversations.find(c => c.id === conversationId);

      if (!conv) return;

      // Check if either user has irl_gfe tag
      const showGfeWarning = (data.currentUserTags || []).includes('irl_gfe') ||
        (data.otherUserTags || []).includes('irl_gfe');

      const chatArea = document.getElementById('chat-area');
      chatArea.innerHTML = `
        <div class="chat-header">
          <div class="chat-header-avatar">
            ${conv.other_avatar_url
          ? `<img src="${conv.other_avatar_url}" alt="${conv.other_display_name || conv.other_username}">`
          : (conv.other_display_name || conv.other_username || '?').charAt(0).toUpperCase()
        }
          </div>
          <div class="chat-header-info">
            <div class="chat-header-name">${conv.other_display_name || conv.other_username}</div>
            <div class="chat-header-username">@${conv.other_username}</div>
          </div>
          <a href="/u/${conv.other_username}" class="btn btn-secondary" data-link style="margin-left: auto;">View Profile</a>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        ${showGfeWarning ? `
          <div class="chat-legal-warning">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            <span>Prostitution, even just the act of agreeing to exchange money for sex, may be illegal in your area.</span>
          </div>
        ` : ''}
        <div class="chat-input-area">
          <input type="file" id="attachment-input" accept="image/*,video/*,audio/*" style="display: none;">
          <button class="chat-attach-btn" id="attach-btn" title="Send file">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
            </svg>
          </button>
          <textarea class="chat-input" id="message-input" placeholder="Type a message..." rows="1"></textarea>
          <button class="chat-send-btn" id="send-message-btn">Send</button>
        </div>
      `;

      this.renderMessages(data.messages);
      this.setupMessageInput();
      this.startMessageRefresh();

      // Refresh conversations to clear unread count
      this.loadConversations();
    } catch (error) {
      console.error('Failed to open conversation:', error);
      this.showToast('Failed to load conversation', 'error');
    }
  },

  renderMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // Get any message currently being edited
    const editingEl = container.querySelector('.message.editing');
    const editingMessageId = editingEl ? editingEl.dataset.messageId : null;
    const editingContent = editingEl ? editingEl.querySelector('.message-edit-input')?.value : null;

    // Build new messages HTML
    const newMessagesHtml = messages.map(msg => {
      const isMine = msg.sender_id === Auth.currentUser.id;
      const isDeleted = msg.is_deleted;

      if (isDeleted) {
        return `
          <div class="message ${isMine ? 'sent' : 'received'}" data-message-id="${msg.id}">
            <div class="message-time">${this.formatMessageTime(msg.created_at)}</div>
            <div class="message-bubble message-deleted">
              <em>This message was deleted</em>
            </div>
          </div>
        `;
      }

      return `
        <div class="message ${isMine ? 'sent' : 'received'}" data-message-id="${msg.id}">
          <div class="message-time">${this.formatMessageTime(msg.created_at)}</div>
          <div class="message-bubble">
            ${this.renderMessageContent(msg)}
            ${msg.edited_at ? `
              <span class="message-edited-indicator" onclick="App.showEditHistory('${msg.id}')" title="Click to view edit history">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
                edited
              </span>
            ` : ''}
          </div>
          ${isMine ? `
            <div class="message-actions">
              <button class="message-action-btn" onclick="App.editMessage('${msg.id}', this)" title="Edit">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </button>
              <button class="message-action-btn" onclick="App.deleteMessage('${msg.id}')" title="Delete">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = newMessagesHtml;

    // Restore editing state if we were editing a message
    if (editingMessageId && editingContent !== null) {
      const messageEl = container.querySelector(`[data-message-id="${editingMessageId}"]`);
      if (messageEl) {
        const editBtn = messageEl.querySelector('.message-action-btn');
        if (editBtn) {
          // Re-enter edit mode
          this.editMessage(editingMessageId, editBtn);
          // Restore the text content after a brief delay to let editMessage setup
          setTimeout(() => {
            const textarea = messageEl.querySelector('.message-edit-input');
            if (textarea) {
              textarea.value = editingContent;
              textarea.focus();
              textarea.setSelectionRange(editingContent.length, editingContent.length);
            }
          }, 0);
        }
      }
    }

    // Scroll to bottom only if not editing
    if (!editingMessageId) {
      container.scrollTop = container.scrollHeight;
    }
  },

  renderMessageContent(msg) {
    let html = '';

    // Render attachment if present
    if (msg.attachment_url) {
      if (msg.attachment_type === 'image') {
        html += `<img src="${msg.attachment_url}" alt="${msg.attachment_name || 'Image'}" class="message-image" onclick="App.openLightbox('${msg.attachment_url}')">`;
      } else if (msg.attachment_type === 'video') {
        html += `<video src="${msg.attachment_url}" controls class="message-video" preload="metadata"></video>`;
      } else if (msg.attachment_type === 'audio') {
        html += `<audio src="${msg.attachment_url}" controls class="message-audio" preload="metadata"></audio>`;
      }
    }

    // Render text content if present
    if (msg.content) {
      html += `<span class="message-text">${this.escapeHtml(msg.content)}</span>`;
    }

    return html;
  },

  async showEditHistory(messageId) {
    try {
      const data = await API.messages.getMessageHistory(messageId);

      if (data.history.length === 0) {
        this.showToast('No edit history available', 'info');
        return;
      }

      const historyHtml = data.history.map(edit => `
        <div class="edit-history-item">
          <div class="edit-history-time">${new Date(edit.edited_at).toLocaleString()}</div>
          <div class="edit-history-content">${this.escapeHtml(edit.previous_content || '(empty)')}</div>
        </div>
      `).join('');

      const modalContent = document.getElementById('modal-content');
      modalContent.innerHTML = `
        <h2 class="modal-title">Edit History</h2>
        <div class="edit-history-list">
          ${historyHtml}
        </div>
      `;
      this.openModal();
    } catch (error) {
      this.showToast('Failed to load edit history', 'error');
    }
  },

  async editMessage(messageId, btn) {
    const messageEl = btn.closest('.message');
    const textEl = messageEl.querySelector('.message-text');
    const bubble = messageEl.querySelector('.message-bubble');

    if (!textEl) {
      this.showToast('Cannot edit attachment-only messages', 'error');
      return;
    }

    // Check if already in edit mode
    if (messageEl.classList.contains('editing')) return;

    const currentContent = textEl.textContent;
    const actions = messageEl.querySelector('.message-actions');

    // Enter edit mode
    messageEl.classList.add('editing');
    if (actions) actions.style.display = 'none';

    // Replace text with editable textarea
    const editContainer = document.createElement('div');
    editContainer.className = 'message-edit-container';
    editContainer.innerHTML = `
      <textarea class="message-edit-input">${this.escapeHtml(currentContent)}</textarea>
      <div class="message-edit-actions">
        <button class="message-edit-save" title="Save">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        </button>
        <button class="message-edit-cancel" title="Cancel">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    `;

    textEl.style.display = 'none';
    bubble.appendChild(editContainer);

    const textarea = editContainer.querySelector('.message-edit-input');
    const saveBtn = editContainer.querySelector('.message-edit-save');
    const cancelBtn = editContainer.querySelector('.message-edit-cancel');

    // Focus and select text
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Auto-resize textarea
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });

    const exitEditMode = () => {
      messageEl.classList.remove('editing');
      textEl.style.display = '';
      editContainer.remove();
      if (actions) actions.style.display = '';
    };

    const saveEdit = async () => {
      const newContent = textarea.value.trim();

      if (!newContent) {
        this.showToast('Message cannot be empty', 'error');
        return;
      }

      if (newContent === currentContent) {
        exitEditMode();
        return;
      }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;

      try {
        await API.messages.editMessage(messageId, newContent);
        textEl.textContent = newContent;

        // Add edited indicator if not present
        if (!messageEl.querySelector('.message-edited-indicator')) {
          bubble.insertAdjacentHTML('beforeend', `
            <span class="message-edited-indicator" onclick="App.showEditHistory('${messageId}')" title="Click to view edit history">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
              edited
            </span>
          `);
        }

        exitEditMode();
        this.showToast('Message edited', 'success');
      } catch (error) {
        this.showToast(error.message || 'Failed to edit message', 'error');
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    };

    saveBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', exitEditMode);

    // Save on Enter, cancel on Escape
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        exitEditMode();
      }
    });
  },

  async deleteMessage(messageId) {
    if (!confirm('Delete this message? This cannot be undone.')) return;

    try {
      await API.messages.deleteMessage(messageId);

      // Update the message in the DOM
      const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageEl) {
        const bubble = messageEl.querySelector('.message-bubble');
        bubble.className = 'message-bubble message-deleted';
        bubble.innerHTML = '<em>This message was deleted</em>';

        const actions = messageEl.querySelector('.message-actions');
        if (actions) actions.remove();
      }

      this.showToast('Message deleted', 'success');
      this.loadConversations(); // Update preview
    } catch (error) {
      this.showToast(error.message || 'Failed to delete message', 'error');
    }
  },

  openLightbox(url) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-image');
    if (lightbox && img) {
      img.src = url;
      lightbox.classList.add('open');
    }
  },

  setupMessageInput() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('attachment-input');
    if (!input || !sendBtn) return;

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Send on Enter (but not Shift+Enter)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => this.sendMessage());

    // Attachment handling
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
          this.showToast('File too large. Maximum size is 50MB.', 'error');
          fileInput.value = '';
          return;
        }

        await this.sendAttachment(file);
        fileInput.value = '';
      });
    }
  },

  async sendAttachment(file) {
    if (!this.currentConversationId) return;

    const sendBtn = document.getElementById('send-message-btn');
    const attachBtn = document.getElementById('attach-btn');
    if (sendBtn) sendBtn.disabled = true;
    if (attachBtn) attachBtn.disabled = true;

    try {
      this.showToast('Uploading file...', 'info');
      const data = await API.messages.sendAttachment(this.currentConversationId, file);

      // Add message to chat
      const container = document.getElementById('chat-messages');
      const msgHtml = `
        <div class="message sent">
          <div class="message-time">${this.formatMessageTime(data.message.created_at)}</div>
          <div class="message-bubble">
            ${this.renderMessageContent(data.message)}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', msgHtml);
      container.scrollTop = container.scrollHeight;

      // Update conversation list
      this.loadConversations();
      this.showToast('File sent!', 'success');
    } catch (error) {
      this.showToast(error.message || 'Failed to send file', 'error');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (attachBtn) attachBtn.disabled = false;
    }
  },

  async sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content || !this.currentConversationId) return;

    const sendBtn = document.getElementById('send-message-btn');
    sendBtn.disabled = true;

    try {
      const data = await API.messages.sendMessage(this.currentConversationId, content);
      input.value = '';
      input.style.height = 'auto';

      // Add message to chat
      const container = document.getElementById('chat-messages');
      const msgHtml = `
        <div class="message sent">
          <div class="message-time">${this.formatMessageTime(data.message.created_at)}</div>
          <div class="message-bubble">${this.escapeHtml(data.message.content)}</div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', msgHtml);
      container.scrollTop = container.scrollHeight;

      // Update conversation list
      this.loadConversations();
    } catch (error) {
      this.showToast('Failed to send message', 'error');
    } finally {
      sendBtn.disabled = false;
    }
  },

  startMessageRefresh() {
    // Clear existing interval
    if (this.messageRefreshInterval) {
      clearInterval(this.messageRefreshInterval);
    }

    // Refresh messages every 5 seconds
    this.messageRefreshInterval = setInterval(async () => {
      if (!this.currentConversationId) return;

      try {
        const data = await API.messages.getMessages(this.currentConversationId);
        this.renderMessages(data.messages);
      } catch (error) {
        console.error('Failed to refresh messages:', error);
      }
    }, 5000);
  },

  formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async startConversationWith(userId) {
    try {
      const data = await API.messages.startConversation(userId);
      this.navigateTo(`/messages/${data.conversationId}`);
    } catch (error) {
      this.showToast('Failed to start conversation', 'error');
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
