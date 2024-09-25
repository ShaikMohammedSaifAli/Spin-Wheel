const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const moment = require('moment-timezone'); // Import moment-timezone
const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve static files

// SQLite Database setup
let db = new sqlite3.Database('./spins.db', (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

// Create users table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL UNIQUE,
    last_spin TIMESTAMP
)`);

// Create spins table to store each spin's result and timestamp
db.run(`CREATE TABLE IF NOT EXISTS spins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobile TEXT NOT NULL,
    spin_result TEXT NOT NULL,
    spin_time TIMESTAMP NOT NULL
)`);

// Helper function to calculate the next spin time
function calculateNextSpin(lastSpinTime) {
    const lastSpinDate = new Date(lastSpinTime);
    const nextSpinDate = new Date(lastSpinDate.getTime() + 24 * 60 * 60 * 1000); // Add 24 hours
    return nextSpinDate;
}

// Function to format date in IST
function formatDateInIST(date) {
    return moment(date).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
}

// Submit user form
app.post('/submit', (req, res) => {
    const { name, mobile } = req.body;

    // Check if the user already exists
    db.get(`SELECT * FROM users WHERE mobile = ?`, [mobile], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row) {
            // User exists, check the last spin time
            if (row.last_spin) {
                const nextSpin = calculateNextSpin(row.last_spin);
                const now = new Date();
                console.log(`Current Time: ${formatDateInIST(now)}`);
                console.log(`Next Spin Time: ${formatDateInIST(nextSpin)}`);
                if (now < nextSpin) {
                    res.json({ canSpin: false, nextSpin: formatDateInIST(nextSpin) });
                } else {
                    res.json({ canSpin: true });
                }
            } else {
                res.json({ canSpin: true });
            }
        } else {
            // Insert new user
            db.run(`INSERT INTO users (name, mobile) VALUES (?, ?)`, [name, mobile], function(err) {
                if (err) {
                    return console.error(err.message);
                }
                res.json({ canSpin: true });
            });
        }
    });
});

// Spin the wheel
app.post('/spin', (req, res) => {
    const { mobile, spinResult } = req.body;

    // Get the current time in UTC format
    const now = new Date().toISOString(); // Store in UTC format for consistency
    console.log(`Current Time (UTC): ${now}`);

    // Check the user's last spin time
    db.get(`SELECT last_spin FROM users WHERE mobile = ?`, [mobile], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row) {
            if (row.last_spin) {
                const nextSpin = calculateNextSpin(row.last_spin);
                console.log(`Next Spin Time (UTC): ${nextSpin}`);
                if (new Date() < nextSpin) {
                    // User cannot spin yet
                    res.json({ canSpin: false, nextSpin: formatDateInIST(nextSpin) });
                    return;
                }
            }
        }

        // Update last spin time in users table
        db.run(`UPDATE users SET last_spin = ? WHERE mobile = ?`, [now, mobile], function(err) {
            if (err) {
                return console.error(err.message);
            }

            // Insert the spin result into the spins table
            db.run(`INSERT INTO spins (mobile, spin_result, spin_time) VALUES (?, ?, ?)`, [mobile, spinResult, now], function(err) {
                if (err) {
                    return console.error(err.message);
                }

                const nextSpin = calculateNextSpin(now);
                console.log(`Next Spin Time (UTC): ${nextSpin}`);
                res.json({ canSpin: true, nextSpin: formatDateInIST(nextSpin) }); // Format next spin time in IST
            });
        });
    });
});

// Get last spin data for a user
app.post('/last-spin', (req, res) => {
    const { mobile } = req.body;

    // Query the last spin from the spins table
    db.get(`SELECT * FROM spins WHERE mobile = ? ORDER BY spin_time DESC LIMIT 1`, [mobile], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row) {
            res.json({
                lastSpinResult: row.spin_result,
            });
        } else {
            res.json({ message: "No spin history found" });
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
