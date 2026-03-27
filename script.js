// Placeholder for future JavaScript functionality

document.addEventListener('DOMContentLoaded', function() {
    const searchBtn = document.getElementById('search-btn');
    const searchBar = document.getElementById('search-bar');
    const resultsDiv = document.getElementById('search-results');
    const createAccountBtn = document.getElementById('create-account-btn');
    const loginBtn = document.getElementById('login-btn');
    const main = document.querySelector('main');
    // LOGIN BUTTON HANDLER
    loginBtn.addEventListener('click', function() {
        // Remove search UI
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) searchContainer.remove();
        resultsDiv.innerHTML = '';

        // Create login form
        const formDiv = document.createElement('div');
        formDiv.className = 'create-account-container';
        formDiv.innerHTML = `
            <h2>Login</h2>
            <div class="form-group">
                <input type="text" id="login-identifier" placeholder="Username or Email">
            </div>
            <div class="form-group">
                <input type="password" id="login-password" placeholder="Password">
            </div>
            <button id="login-submit-btn" disabled>Login</button>
            <div id="login-error" class="error-message" style="display:none;"></div>
        `;
        main.insertBefore(formDiv, resultsDiv);

        // Enable login button only if both fields are filled
        const identifierInput = document.getElementById('login-identifier');
        const passwordInput = document.getElementById('login-password');
        const loginSubmitBtn = document.getElementById('login-submit-btn');
        const errorDiv = document.getElementById('login-error');

        function validateLoginForm() {
            loginSubmitBtn.disabled = !(identifierInput.value.trim() && passwordInput.value.trim());
        }
        identifierInput.addEventListener('input', validateLoginForm);
        passwordInput.addEventListener('input', validateLoginForm);

        loginSubmitBtn.addEventListener('click', function() {
            errorDiv.style.display = 'none';
            const identifier = identifierInput.value.trim();
            const password = passwordInput.value;
            if (!identifier || !password) {
                errorDiv.textContent = 'Please fill in all fields.';
                errorDiv.style.display = 'block';
                return;
            }
            fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    formDiv.remove();
                    restoreSearchUI();
                    showLoginSuccess(data.username);
                } else {
                    errorDiv.textContent = data.error || 'Login failed.';
                    errorDiv.style.display = 'block';
                }
            })
            .catch(() => {
                errorDiv.textContent = 'Server error. Please try again later.';
                errorDiv.style.display = 'block';
            });
        });
    });
    // Helper to show login success message
    function showLoginSuccess(username) {
        const msg = document.createElement('div');
        msg.className = 'info-message';
        msg.textContent = `You have logged in successfully ${username}`;
        resultsDiv.appendChild(msg);
        setTimeout(() => {
            if (msg.parentNode) msg.parentNode.removeChild(msg);
        }, 3000);
    }

    // Helper to restore search UI and add Write a Review button
    function restoreSearchUI() {
        let searchContainer = document.querySelector('.search-container');
        if (!searchContainer) {
            searchContainer = document.createElement('div');
            searchContainer.className = 'search-container';
            searchContainer.innerHTML = `
                <input type="text" id="search-bar" placeholder="Search for games...">
                <button id="search-btn">Search</button>
                <button id="write-review-btn">Write a Review</button>
            `;
            main.insertBefore(searchContainer, resultsDiv);
        }
        // Add event listeners back
        const searchBtn = document.getElementById('search-btn');
        const searchBar = document.getElementById('search-bar');
        searchBtn.addEventListener('click', function() {
            const query = searchBar.value.trim();
            resultsDiv.innerHTML = '';
            if (!query) {
                resultsDiv.innerHTML = '<div class="error-message">Please enter a game title.</div>';
                return;
            }
            fetch('/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            })
            .then(res => res.json())
            .then(data => {
                if (!data.found) {
                    resultsDiv.innerHTML = '<div class="error-message">Game not found.</div>';
                } else if (data.reviews.length === 0) {
                    resultsDiv.innerHTML = '<div class="info-message">No reviews found for this game.</div>';
                } else {
                    const list = document.createElement('ul');
                    list.className = 'review-list';
                    data.reviews.forEach(r => {
                        const item = document.createElement('li');
                        item.className = 'review-item';
                        item.innerHTML = `<strong>Author:</strong> ${r.user}<br>${r.review}`;
                        list.appendChild(item);
                    });
                    resultsDiv.innerHTML = '';
                    resultsDiv.appendChild(list);
                }
            })
            .catch(() => {
                resultsDiv.innerHTML = '<div class="error-message">Server error. Please try again later.';
            });
        });
        // Placeholder for Write a Review button event
        const writeReviewBtn = document.getElementById('write-review-btn');
        writeReviewBtn.addEventListener('click', function() {
            resultsDiv.innerHTML = '<div class="info-message">Write a Review functionality coming soon.</div>';
        });
    }

    searchBtn.addEventListener('click', function() {
        const query = searchBar.value.trim();
        resultsDiv.innerHTML = '';
        if (!query) {
            resultsDiv.innerHTML = '<div class="error-message">Please enter a game title.</div>';
            return;
        }
        fetch('/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.found) {
                resultsDiv.innerHTML = '<div class="error-message">Game not found.</div>';
            } else if (data.reviews.length === 0) {
                resultsDiv.innerHTML = '<div class="info-message">No reviews found for this game.</div>';
            } else {
                const list = document.createElement('ul');
                list.className = 'review-list';
                data.reviews.forEach(r => {
                    const item = document.createElement('li');
                    item.className = 'review-item';
                    item.innerHTML = `<strong>Author:</strong> ${r.user}<br>${r.review}`;
                    list.appendChild(item);
                });
                resultsDiv.innerHTML = '';
                resultsDiv.appendChild(list);
            }
        })
        .catch(() => {
            resultsDiv.innerHTML = '<div class="error-message">Server error. Please try again later.</div>';
        });
    });

        // CREATE ACCOUNT BUTTON HANDLER
        createAccountBtn.addEventListener('click', function() {
            // Remove search UI
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer) searchContainer.remove();
            resultsDiv.innerHTML = '';

            // Create account form
            const formDiv = document.createElement('div');
            formDiv.className = 'create-account-container';
            formDiv.innerHTML = `
                <h2>Create Account</h2>
                <div class="form-group">
                    <input type="text" id="new-username" placeholder="Username">
                </div>
                <div class="form-group">
                    <input type="email" id="new-email" placeholder="Email">
                </div>
                <div class="form-group">
                    <input type="password" id="new-password" placeholder="Password">
                </div>
                <button id="create-btn" disabled>Create</button>
                <div id="create-error" class="error-message" style="display:none;"></div>
            `;
            main.insertBefore(formDiv, resultsDiv);

            // Enable create button only if password is filled
            const usernameInput = document.getElementById('new-username');
            const emailInput = document.getElementById('new-email');
            const passwordInput = document.getElementById('new-password');
            const createBtn = document.getElementById('create-btn');
            const errorDiv = document.getElementById('create-error');

            function validateForm() {
                createBtn.disabled = !passwordInput.value.trim();
            }
            passwordInput.addEventListener('input', validateForm);

            createBtn.addEventListener('click', function() {
                errorDiv.style.display = 'none';
                const username = usernameInput.value.trim();
                const email = emailInput.value.trim();
                const password = passwordInput.value;
                if (!username && !email) {
                    errorDiv.textContent = 'Please enter a username or email.';
                    errorDiv.style.display = 'block';
                    return;
                }
                // Send to server for validation and creation
                fetch('/create-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        // Restore search UI and add Write a Review button
                        formDiv.remove();
                        restoreSearchUI();
                    } else {
                        errorDiv.textContent = data.error || 'Account creation failed.';
                        errorDiv.style.display = 'block';
                    }
                    // Helper to restore search UI and add Write a Review button
                    function restoreSearchUI() {
                        // Recreate search bar and search button
                        let searchContainer = document.querySelector('.search-container');
                        if (!searchContainer) {
                            searchContainer = document.createElement('div');
                            searchContainer.className = 'search-container';
                            searchContainer.innerHTML = `
                                <input type="text" id="search-bar" placeholder="Search for games...">
                                <button id="search-btn">Search</button>
                                <button id="write-review-btn">Write a Review</button>
                            `;
                            main.insertBefore(searchContainer, resultsDiv);
                        }
                        // Add event listeners back
                        const searchBtn = document.getElementById('search-btn');
                        const searchBar = document.getElementById('search-bar');
                        searchBtn.addEventListener('click', function() {
                            const query = searchBar.value.trim();
                            resultsDiv.innerHTML = '';
                            if (!query) {
                                resultsDiv.innerHTML = '<div class="error-message">Please enter a game title.</div>';
                                return;
                            }
                            fetch('/search', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ query })
                            })
                            .then(res => res.json())
                            .then(data => {
                                if (!data.found) {
                                    resultsDiv.innerHTML = '<div class="error-message">Game not found.</div>';
                                } else if (data.reviews.length === 0) {
                                    resultsDiv.innerHTML = '<div class="info-message">No reviews found for this game.</div>';
                                } else {
                                    const list = document.createElement('ul');
                                    list.className = 'review-list';
                                    data.reviews.forEach(r => {
                                        const item = document.createElement('li');
                                        item.className = 'review-item';
                                        item.innerHTML = `<strong>Author:</strong> ${r.user}<br>${r.review}`;
                                        list.appendChild(item);
                                    });
                                    resultsDiv.innerHTML = '';
                                    resultsDiv.appendChild(list);
                                }
                            })
                            .catch(() => {
                                resultsDiv.innerHTML = '<div class="error-message">Server error. Please try again later.</div>';
                            });
                        });
                        // Placeholder for Write a Review button event
                        const writeReviewBtn = document.getElementById('write-review-btn');
                        writeReviewBtn.addEventListener('click', function() {
                            resultsDiv.innerHTML = '<div class="info-message">Write a Review functionality coming soon.</div>';
                        });
                    }
                })
                .catch(() => {
                    errorDiv.textContent = 'Server error. Please try again later.';
                    errorDiv.style.display = 'block';
                });
            });
        });
});
