// Upload Module - Handles image upload functionality
const Upload = {
    selectedFiles: [],
    isUploading: false,

    // Render upload page
    render() {
        if (!Auth.isLoggedIn()) {
            return `
        <div class="container">
          <div class="hero">
            <h1 class="hero-title">Upload Your <span class="hero-title-gradient">Images</span></h1>
            <p class="hero-subtitle">Please sign in to upload and manage your images.</p>
            <div class="hero-actions">
              <button class="btn btn-primary btn-lg" id="upload-login-btn">Sign In to Upload</button>
            </div>
          </div>
        </div>
      `;
        }

        return `
      <div class="container upload-container">
        <div class="hero" style="padding-bottom: var(--space-8);">
          <h1 class="hero-title">Upload <span class="hero-title-gradient">Images</span></h1>
          <p class="hero-subtitle">Share your photos with the world. Support for JPG, PNG, GIF, and WebP.</p>
        </div>

        <div class="upload-zone" id="upload-zone">
          <input type="file" class="upload-zone-input" id="file-input" 
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif" multiple>
          <div class="upload-zone-icon">📤</div>
          <h3 class="upload-zone-title">Drop images here or click to browse</h3>
          <p class="upload-zone-text">Maximum 10 images, up to 50MB each</p>
        </div>

        <div class="upload-preview" id="upload-preview" style="display: none;">
          <h3 style="margin-bottom: var(--space-4); font-weight: 600;">Selected Images</h3>
          <div class="upload-preview-grid" id="preview-grid"></div>
          
          <div class="upload-progress" id="upload-progress" style="display: none;">
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill" style="width: 0%;"></div>
            </div>
            <p style="margin-top: var(--space-2); font-size: var(--font-size-sm); color: var(--text-secondary);" id="progress-text">
              Uploading...
            </p>
          </div>

          <div style="margin-top: var(--space-6); display: flex; gap: var(--space-4);">
            <button class="btn btn-primary btn-lg" id="upload-btn">
              Upload Images
            </button>
            <button class="btn btn-secondary btn-lg" id="clear-btn">
              Clear Selection
            </button>
          </div>
        </div>
      </div>
    `;
    },

    // Initialize upload page events
    init() {
        const uploadZone = document.getElementById('upload-zone');
        const fileInput = document.getElementById('file-input');

        // If not logged in, show login modal
        const loginBtn = document.getElementById('upload-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => Auth.showModal('login'));
            return;
        }

        if (!uploadZone) return;

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // Upload button
        const uploadBtn = document.getElementById('upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.uploadFiles());
        }

        // Clear button
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearSelection());
        }
    },

    // Handle selected files
    handleFiles(fileList) {
        const files = Array.from(fileList).filter(file => file.type.startsWith('image/'));

        if (files.length === 0) {
            App.showToast('Please select valid image files', 'warning');
            return;
        }

        // Add to selection (max 10)
        const remaining = 10 - this.selectedFiles.length;
        if (remaining <= 0) {
            App.showToast('Maximum 10 images allowed', 'warning');
            return;
        }

        const newFiles = files.slice(0, remaining);
        this.selectedFiles.push(...newFiles);

        if (files.length > remaining) {
            App.showToast(`Only ${remaining} more images allowed`, 'warning');
        }

        this.updatePreview();
    },

    // Update preview grid
    updatePreview() {
        const preview = document.getElementById('upload-preview');
        const grid = document.getElementById('preview-grid');

        if (this.selectedFiles.length === 0) {
            preview.style.display = 'none';
            return;
        }

        preview.style.display = 'block';
        grid.innerHTML = '';

        this.selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'upload-preview-item';

            const reader = new FileReader();
            reader.onload = (e) => {
                item.innerHTML = `
          <img src="${e.target.result}" alt="${file.name}">
          <button class="upload-preview-remove" data-index="${index}">&times;</button>
        `;

                // Remove button
                item.querySelector('.upload-preview-remove').addEventListener('click', () => {
                    this.removeFile(index);
                });
            };
            reader.readAsDataURL(file);

            grid.appendChild(item);
        });
    },

    // Remove file from selection
    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.updatePreview();
    },

    // Clear all selected files
    clearSelection() {
        this.selectedFiles = [];
        this.updatePreview();
        document.getElementById('file-input').value = '';
    },

    // Upload files
    async uploadFiles() {
        if (this.selectedFiles.length === 0) {
            App.showToast('Please select images to upload', 'warning');
            return;
        }

        if (this.isUploading) return;

        this.isUploading = true;
        const uploadBtn = document.getElementById('upload-btn');
        const progress = document.getElementById('upload-progress');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        uploadBtn.disabled = true;
        progress.style.display = 'block';

        try {
            const formData = new FormData();
            this.selectedFiles.forEach(file => {
                formData.append('images', file);
            });

            const result = await API.images.upload(formData, (percent) => {
                progressFill.style.width = `${percent}%`;
                progressText.textContent = `Uploading... ${percent}%`;
            });

            App.showToast(result.message, 'success');
            this.clearSelection();

            // Navigate to my images
            setTimeout(() => {
                App.navigateTo('/my-images');
            }, 1000);
        } catch (error) {
            App.showToast(error.message, 'error');
        } finally {
            this.isUploading = false;
            uploadBtn.disabled = false;
            progress.style.display = 'none';
            progressFill.style.width = '0%';
        }
    },
};

window.Upload = Upload;
