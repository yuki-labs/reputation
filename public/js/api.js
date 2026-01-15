// API Module - Handles all HTTP requests
const API = {
    baseUrl: '/api',

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            credentials: 'include',
            ...options,
        };

        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An error occurred');
            }

            return data;
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                throw new Error('Network error. Please check your connection.');
            }
            throw error;
        }
    },

    auth: {
        async register(userData) {
            return API.request('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData),
            });
        },

        async login(credentials) {
            return API.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify(credentials),
            });
        },

        async logout() {
            return API.request('/auth/logout', { method: 'POST' });
        },

        async getMe() {
            return API.request('/auth/me');
        },

        async updateProfile(data) {
            return API.request('/auth/me', {
                method: 'PATCH',
                body: JSON.stringify(data),
            });
        },

        async updateTags(tags) {
            return API.request('/auth/me/tags', {
                method: 'PUT',
                body: JSON.stringify({ tags }),
            });
        },

        async getValidTags() {
            return API.request('/auth/tags');
        },

        async changePassword(data) {
            return API.request('/auth/change-password', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },

        async getProviders() {
            return API.request('/auth/providers');
        },

        async deleteAccount(password, confirmation) {
            return API.request('/auth/me', {
                method: 'DELETE',
                body: JSON.stringify({ password, confirmation }),
            });
        },
    },

    images: {
        async upload(formData, onProgress) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && onProgress) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        onProgress(percent);
                    }
                });

                xhr.addEventListener('load', () => {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error || 'Upload failed'));
                        }
                    } catch (e) {
                        reject(new Error('Invalid response'));
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Upload failed'));
                });

                xhr.open('POST', `${API.baseUrl}/images/upload`);
                xhr.withCredentials = true;
                xhr.send(formData);
            });
        },

        async getMyImages(page = 1, limit = 20) {
            return API.request(`/images/my?page=${page}&limit=${limit}`);
        },

        async getGallery(page = 1, limit = 20) {
            return API.request(`/images/gallery?page=${page}&limit=${limit}`);
        },

        async getImage(id) {
            return API.request(`/images/${id}`);
        },

        async updateImage(id, data) {
            return API.request(`/images/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            });
        },

        async deleteImage(id) {
            return API.request(`/images/${id}`, { method: 'DELETE' });
        },
    },

    users: {
        async search(query, tag = null, page = 1, limit = 20) {
            let url = `/users/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
            if (tag) {
                url += `&tag=${encodeURIComponent(tag)}`;
            }
            return API.request(url);
        },

        async getProfile(username) {
            return API.request(`/users/${username}`);
        },

        async getUserImages(username, page = 1, limit = 20) {
            return API.request(`/users/${username}/images?page=${page}&limit=${limit}`);
        },
    },
};

window.API = API;
