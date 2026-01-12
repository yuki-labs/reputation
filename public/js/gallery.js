// Gallery Module - Handles image gallery display
const Gallery = {
    currentPage: 1,
    isLoading: false,
    hasMore: true,
    currentImages: [],

    // Render public gallery
    async renderPublicGallery() {
        this.currentPage = 1;
        this.hasMore = true;
        this.currentImages = [];

        return `
      <div class="container">
        <div class="hero">
          <h1 class="hero-title">Discover <span class="hero-title-gradient">Amazing</span> Images</h1>
          <p class="hero-subtitle">Explore a curated collection of stunning photographs shared by our community.</p>
          ${!Auth.isLoggedIn() ? `
            <div class="hero-actions">
              <button class="btn btn-primary btn-lg" id="hero-signup">Get Started</button>
              <button class="btn btn-secondary btn-lg" id="hero-explore">Explore Gallery</button>
            </div>
          ` : ''}
        </div>

        <div class="gallery-header">
          <h2 class="gallery-title">Latest Uploads</h2>
        </div>

        <div class="gallery-grid" id="gallery-grid">
          <div class="loading" style="grid-column: 1 / -1;">
            <div class="spinner"></div>
          </div>
        </div>

        <div id="load-more-container" style="text-align: center; margin-top: var(--space-8);"></div>
      </div>
    `;
    },

    // Render user's own images
    async renderMyImages() {
        if (!Auth.isLoggedIn()) {
            App.navigateTo('/');
            return '';
        }

        this.currentPage = 1;
        this.hasMore = true;
        this.currentImages = [];

        return `
      <div class="container">
        <div class="gallery-header">
          <h2 class="gallery-title">My Images</h2>
          <a href="/upload" class="btn btn-primary" data-link>
            <span>+</span>
            Upload Images
          </a>
        </div>

        <div class="gallery-grid" id="gallery-grid">
          <div class="loading" style="grid-column: 1 / -1;">
            <div class="spinner"></div>
          </div>
        </div>

        <div id="load-more-container" style="text-align: center; margin-top: var(--space-8);"></div>
      </div>
    `;
    },

    // Initialize gallery page
    async init(type = 'public') {
        // Hero buttons
        const signupBtn = document.getElementById('hero-signup');
        const exploreBtn = document.getElementById('hero-explore');

        if (signupBtn) {
            signupBtn.addEventListener('click', () => Auth.showModal('register'));
        }
        if (exploreBtn) {
            exploreBtn.addEventListener('click', () => {
                document.getElementById('gallery-grid').scrollIntoView({ behavior: 'smooth' });
            });
        }

        // Load images
        await this.loadImages(type);
    },

    // Load images
    async loadImages(type = 'public') {
        if (this.isLoading || !this.hasMore) return;

        this.isLoading = true;
        const grid = document.getElementById('gallery-grid');
        const loadMoreContainer = document.getElementById('load-more-container');

        try {
            let data;
            if (type === 'my') {
                data = await API.images.getMyImages(this.currentPage);
            } else {
                data = await API.images.getGallery(this.currentPage);
            }

            // Clear loading on first page
            if (this.currentPage === 1) {
                grid.innerHTML = '';
            }

            if (data.images.length === 0 && this.currentPage === 1) {
                grid.innerHTML = `
          <div class="gallery-empty">
            <div class="gallery-empty-icon">📷</div>
            <h3 class="gallery-empty-title">No images yet</h3>
            <p class="gallery-empty-text">
              ${type === 'my'
                        ? 'Start by uploading your first image!'
                        : 'Be the first to share an image with the community.'
                    }
            </p>
            ${type === 'my' ? `
              <a href="/upload" class="btn btn-primary" style="margin-top: var(--space-4);" data-link>
                Upload Images
              </a>
            ` : ''}
          </div>
        `;
                this.hasMore = false;
            } else {
                // Append images
                this.currentImages.push(...data.images);

                data.images.forEach((image, index) => {
                    const card = this.createImageCard(image, type, this.currentImages.length - data.images.length + index);
                    grid.appendChild(card);
                });

                // Update pagination
                this.hasMore = this.currentPage < data.pagination.pages;
                this.currentPage++;

                // Load more button
                if (this.hasMore) {
                    loadMoreContainer.innerHTML = `
            <button class="btn btn-secondary btn-lg" id="load-more-btn">
              Load More
            </button>
          `;
                    document.getElementById('load-more-btn').addEventListener('click', () => this.loadImages(type));
                } else {
                    loadMoreContainer.innerHTML = '';
                }
            }
        } catch (error) {
            App.showToast(error.message, 'error');
            grid.innerHTML = `
        <div class="gallery-empty">
          <div class="gallery-empty-icon">⚠️</div>
          <h3 class="gallery-empty-title">Error loading images</h3>
          <p class="gallery-empty-text">${error.message}</p>
          <button class="btn btn-primary" onclick="Gallery.loadImages('${type}')" style="margin-top: var(--space-4);">
            Try Again
          </button>
        </div>
      `;
        } finally {
            this.isLoading = false;
        }
    },

    // Create image card
    createImageCard(image, type, index) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;

        const isOwner = type === 'my';
        const thumbnail = image.thumbnailUrl || image.url;

        card.innerHTML = `
      <div class="card-image">
        <img src="${thumbnail}" alt="${image.title || 'Image'}" loading="lazy">
        <div class="card-overlay">
          <div style="display: flex; gap: var(--space-2); width: 100%;">
            <button class="btn btn-secondary" style="flex: 1;" data-action="view">View</button>
            ${isOwner ? `
              <button class="btn btn-secondary btn-icon" data-action="edit" title="Edit">✏️</button>
              <button class="btn btn-danger btn-icon" data-action="delete" title="Delete">🗑️</button>
            ` : ''}
          </div>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${image.title || 'Untitled'}</h3>
        <div class="card-meta">
          ${image.author ? `
            <span>by ${image.author.displayName || image.author.username}</span>
            <span>•</span>
          ` : ''}
          <span>${this.formatDate(image.createdAt)}</span>
          ${isOwner ? `
            <span>•</span>
            <span>${image.isPublic ? '🌐 Public' : '🔒 Private'}</span>
          ` : ''}
        </div>
      </div>
    `;

        // Event listeners
        card.querySelector('[data-action="view"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openLightbox(index);
        });

        card.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEditModal(image);
        });

        card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmDelete(image);
        });

        // Click on card to open lightbox
        card.addEventListener('click', () => {
            this.openLightbox(index);
        });

        return card;
    },

    // Format date
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    },

    // Open lightbox
    openLightbox(index) {
        const lightbox = document.getElementById('lightbox');
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxInfo = document.getElementById('lightbox-info');

        const image = this.currentImages[index];
        if (!image) return;

        lightboxImage.src = image.url;
        lightboxImage.alt = image.title || 'Image';
        lightboxInfo.innerHTML = `
      <h3 style="font-weight: 600; margin-bottom: 4px;">${image.title || 'Untitled'}</h3>
      ${image.author ? `<p>by ${image.author.displayName || image.author.username}</p>` : ''}
    `;

        lightbox.classList.add('open');
        lightbox.dataset.currentIndex = index;

        // Update navigation visibility
        document.getElementById('lightbox-prev').style.display = index > 0 ? 'flex' : 'none';
        document.getElementById('lightbox-next').style.display = index < this.currentImages.length - 1 ? 'flex' : 'none';
    },

    // Close lightbox
    closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        lightbox.classList.remove('open');
    },

    // Navigate lightbox
    navigateLightbox(direction) {
        const lightbox = document.getElementById('lightbox');
        const currentIndex = parseInt(lightbox.dataset.currentIndex);
        const newIndex = currentIndex + direction;

        if (newIndex >= 0 && newIndex < this.currentImages.length) {
            this.openLightbox(newIndex);
        }
    },

    // Show edit modal
    showEditModal(image) {
        const modalContent = document.getElementById('modal-content');
        modalContent.innerHTML = `
      <div style="max-width: 500px;">
        <h2 style="font-size: var(--font-size-2xl); font-weight: 700; margin-bottom: var(--space-6);">
          Edit Image
        </h2>
        
        <form id="edit-image-form">
          <div class="form-group">
            <label class="form-label" for="edit-title">Title</label>
            <input type="text" id="edit-title" name="title" class="form-input" 
              value="${image.title || ''}" placeholder="Image title">
          </div>

          <div class="form-group">
            <label class="form-label" for="edit-description">Description</label>
            <textarea id="edit-description" name="description" class="form-input form-textarea" 
              placeholder="Add a description...">${image.description || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">
              <input type="checkbox" id="edit-public" name="isPublic" ${image.isPublic ? 'checked' : ''}>
              <span style="margin-left: var(--space-2);">Make this image public</span>
            </label>
            <p class="form-helper">Public images appear in the gallery and can be viewed by anyone.</p>
          </div>

          <div style="display: flex; gap: var(--space-4); margin-top: var(--space-6);">
            <button type="submit" class="btn btn-primary" id="edit-submit">Save Changes</button>
            <button type="button" class="btn btn-secondary" id="edit-cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;

        App.openModal();

        const form = document.getElementById('edit-image-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('edit-submit');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                await API.images.updateImage(image.id, {
                    title: document.getElementById('edit-title').value,
                    description: document.getElementById('edit-description').value,
                    isPublic: document.getElementById('edit-public').checked,
                });

                App.showToast('Image updated', 'success');
                App.closeModal();
                App.navigateTo(window.location.pathname); // Refresh
            } catch (error) {
                App.showToast(error.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            }
        });

        document.getElementById('edit-cancel').addEventListener('click', () => {
            App.closeModal();
        });
    },

    // Confirm delete
    confirmDelete(image) {
        const modalContent = document.getElementById('modal-content');
        modalContent.innerHTML = `
      <div style="max-width: 400px; text-align: center;">
        <div style="font-size: 4rem; margin-bottom: var(--space-4);">⚠️</div>
        <h2 style="font-size: var(--font-size-xl); font-weight: 700; margin-bottom: var(--space-2);">
          Delete Image?
        </h2>
        <p style="color: var(--text-secondary); margin-bottom: var(--space-6);">
          This action cannot be undone. The image will be permanently deleted.
        </p>
        <div style="display: flex; gap: var(--space-4); justify-content: center;">
          <button class="btn btn-danger" id="confirm-delete">Delete</button>
          <button class="btn btn-secondary" id="cancel-delete">Cancel</button>
        </div>
      </div>
    `;

        App.openModal();

        document.getElementById('confirm-delete').addEventListener('click', async () => {
            try {
                await API.images.deleteImage(image.id);
                App.showToast('Image deleted', 'success');
                App.closeModal();
                App.navigateTo(window.location.pathname); // Refresh
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });

        document.getElementById('cancel-delete').addEventListener('click', () => {
            App.closeModal();
        });
    },
};

window.Gallery = Gallery;
