const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Connection check logic
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Database connection error:', err.message);
  }
  console.log('✅ Connected to Supabase Cloud Database!');
  release();
});

module.exports = pool;