const express = require('express');
const path = require('path');
const db = require('./models/db');
require('dotenv').config();

const app = express();
var curUser = '';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

// Initialize database
(async () => {
  try {
    // Insert data if table is empty
    const [user_rows] = await db.execute('select count(*) as count from users');
    if (user_rows[0].count === 0) {
      await db.execute(`
            insert into users (username, email, password_hash, role) values
            ('alice123', 'alice@example.com', 'hashed123', 'owner'),
            ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
            ('carol123', 'carol@example.com', 'hashed789', 'owner'),
            ('jim123', 'jim@example.com', 'hashedjim', 'owner'),
            ('alexwalker', 'alexwalker@example.com', 'hashedalex', 'walker');
      `);
    }
    
    const [dog_rows] = await db.execute('select count(*) as count from dogs');
    if (dog_rows[0].count === 0) {
      await db.execute(`
            insert into dogs (owner_id, name, size) values
            ((select user_id from Users where username = 'alice123'), 'Max', 'medium'),
            ((select user_id from Users where username = 'carol123'), 'Bella', 'small'),
            ((select user_id from Users where username = 'jim123'), 'Joy', 'medium'),
            ((select user_id from Users where username = 'alice123'), 'Lucky', 'large'),
            ((select user_id from Users where username = 'jim123'), 'Charming', 'small');
      `);
    }

    const [walkrequests_rows] = await db.execute('select count(*) as count from walkrequests');
    if (walkrequests_rows[0].count === 0) {
      await db.execute(`
            insert into walkrequests (dog_id, requested_time, duration_minutes, location, status) values
            ((select dog_id from dogs where name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
            ((select dog_id from dogs where name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
            ((select dog_id from dogs where name = 'Joy'), '2025-06-10 10:00:00', 60, 'Baker Street', 'open'),
            ((select dog_id from dogs where name = 'Lucky'), '2025-06-12 13:30:00', 20, 'Luck Park', 'completed'),
            ((select dog_id from dogs where name = 'Charming'), '2025-06-08 18:00:00', 30, 'Great Avenue', 'open');
      `);
    }
  } catch (err) {
    console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
  }
})();

// Get current user
app.get('/api/users/me', async (req, res) => {
  try {
    res.json(curUser)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current user' });
  }
});

// Route to return the user with specified username and password as JSON
app.post('/api/login', async (req, res) => {
  try {
    const username = req.body.username;
    const password_hash = req.body.password_hash;

    const [user] = await db.execute(`
            select *
            from users
            where username = ? and password_hash = ?
        `, [username, password_hash]);
    
    if(user.length != 0){
      curUser = user[0];
    }
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// Route to return the user with specified username and password as JSON
app.post('/api/owner/dogs', async (req, res) => {
  try {
    const user_id = req.body.user_id;

    const [dogs] = await db.execute(`
            select dogs.dog_id as dog_id, dogs.name as dog_name, size
            from dogs
            where dogs.owner_id = ?
        `, [user_id]);
    res.json(dogs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// Route to return dogs as JSON
app.get('/api/dogs', async (req, res) => {
  try {
    const [dogs] = await db.execute(`
            select dogs.name as dog_name, size, users.username as owner_username
            from dogs
            join users on users.user_id = dogs.owner_id
        `);
    res.json(dogs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// Route to return open walk requests as JSON
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [walk_requests] = await db.execute(`
            select request_id, dogs.name as dog_name, requested_time, duration_minutes, location, users.username as owner_username
            from walkrequests
            join dogs on dogs.dog_id = walkrequests.dog_id
            join users on users.user_id = dogs.owner_id
            where walkrequests.status = 'open';
        `);
    res.json(walk_requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch open walk requests' });
  }
});

// Route to return walkers summary as JSON
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [walkers_summary] = await db.execute(`
            select
                users.username as walker_username,
                count(distinct walkratings.walker_id) as total_rating,
                avg(walkratings.rating) as average_rating,
                count(distinct case when walkapplications.status = 'accepted' and walkrequests.status = 'completed' then walkratings.walker_id end) completed_walks
            from users
            left join walkapplications on walkapplications.walker_id = users.user_id
            left join walkrequests on walkrequests.request_id = walkapplications.request_id
            left join walkratings on walkratings.walker_id = users.user_id and users.user_id = walkratings.walker_id
            where users.role = 'walker'
            group by users.user_id;
        `);
    res.json(walkers_summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch walkers summary' });
  }
});

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;
