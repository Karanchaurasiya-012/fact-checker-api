const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Routes import karein
const authRoutes = require('./routes/authRoutes');
const claimRoutes = require('./routes/claimRoutes'); // Naya claim route

dotenv.config();
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes register karein
app.use('/api/auth', authRoutes);
app.use('/api/claims', claimRoutes); 

const PORT = process.env.PORT || 5000;

// Root Route
app.get('/', (req, res) => {
    res.send("Backend is running! 🚀");
});

// Server Start
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});