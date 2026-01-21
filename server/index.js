const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth'); // Import the route

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors());

// --- ROUTES ---
app.use('/api/auth', authRoutes); // Use the route

app.get('/', (req, res) => res.send("GTS HRMS API is running..."));

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");
        app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.log(err));