const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'front-end');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Serve static files
app.use(express.static(FRONTEND_DIR));
app.use(express.json());

// Endpoint to search for a game and get reviews
app.post('/search', (req, res) => {
    try {
        console.log('Received search request:', req.body);
        const { query } = req.body;
        const games = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'Games.json')));
        const reviews = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'Reviews.json')));
        const game = games.find(g => g.title.toLowerCase() === query.trim().toLowerCase());
        console.log('Game found:', game);
        if (!game) {
            console.log('Game not found:', query);
            return res.json({ found: false });
        }
        const gameReviews = reviews[game.title] || [];
        console.log('Reviews found:', gameReviews.length);
        res.json({ found: true, reviews: gameReviews });
    } catch (err) {
        console.error('Error in /search:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

app.get('/game-titles', (req, res) => {
    try {
        const games = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'Games.json')));
        const titles = games.map(game => game.title);
        res.json({ titles });
    } catch (err) {
        console.error('Error in /game-titles:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Endpoint to handle login
app.post('/login', (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.json({ success: false, error: 'All fields required.' });
        }
        // READ ACCOUNTS.JSON FILE TO VALIDATE LOGIN
        const accountsPath = path.join(DATA_DIR, 'Accounts.json');
        let accounts = [];
        if (fs.existsSync(accountsPath)) {
            accounts = JSON.parse(fs.readFileSync(accountsPath)); // READS ACCOUNTS.JSON
        }
        // FIND ACCOUNT BY USERNAME OR EMAIL
        const account = accounts.find(acc =>
            (acc.username && acc.username.toLowerCase() === identifier.toLowerCase()) ||
            (acc.email && acc.email.toLowerCase() === identifier.toLowerCase())
        );
        if (!account) {
            return res.json({ success: false, error: 'Account not found.' });
        }
        // CHECK PASSWORD
        if (account.password !== password) {
            return res.json({ success: false, error: 'Incorrect password.' });
        }
        // LOGIN SUCCESSFUL, RETURN USERNAME
        res.json({ success: true, username: account.username });
    } catch (err) {
        console.error('Error in /login:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});


// Endpoint to create a new account
app.post('/create-account', (req, res) => {
    try {
        const { username, email, password } = req.body;
        if ((!username || username.trim() === '') && (!email || email.trim() === '')) {
            return res.json({ success: false, error: 'Username or email required.' });
        }
        if (!password || password.trim() === '') {
            return res.json({ success: false, error: 'Password required.' });
        }
        // READ ACCOUNTS.JSON FILE
        const accountsPath = path.join(DATA_DIR, 'Accounts.json');
        let accounts = [];
        if (fs.existsSync(accountsPath)) {
            accounts = JSON.parse(fs.readFileSync(accountsPath));
        }
        // CHECK IF USERNAME OR EMAIL EXISTS
        const exists = accounts.some(acc =>
            (username && acc.username && acc.username.toLowerCase() === username.toLowerCase()) ||
            (email && acc.email && acc.email.toLowerCase() === email.toLowerCase())
        );
        if (exists) {
            return res.json({ success: false, error: 'Account already exists.' });
        }
        // APPEND NEW ACCOUNT TO ACCOUNTS.JSON FILE
        // THE FOLLOWING CODE APPENDS THE NEW ACCOUNT TO THE JSON FILE
        // IT READS THE EXISTING ACCOUNTS, PUSHES THE NEW ACCOUNT, AND WRITES BACK TO THE FILE
        accounts.push({ username, email, password });
        fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 4)); // WRITES TO ACCOUNTS.JSON
        // END OF FILE WRITE LOGIC
        res.json({ success: true });
    } catch (err) {
        console.error('Error in /create-account:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});
