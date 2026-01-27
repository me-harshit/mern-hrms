const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// --- 1. IMPORT ROUTES ---
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employee');
const settingsRoutes = require('./routes/settings');     
const attendanceRoutes = require('./routes/attendance'); 
const leaveRoutes = require('./routes/leaves');
const dashboardRoutes = require('./routes/dashboard');
const holidays = require('./routes/holidays');

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 2. USE ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/holidays', holidays);

app.get('/', (req, res) => res.send("GTS HRMS API is running..."));

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");
        app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.log(err));