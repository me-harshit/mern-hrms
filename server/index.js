const xmlparser = require('express-xml-bodyparser');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// --- 1. IMPORT ROUTES ---
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employee');
const settingsRoutes = require('./routes/settings');     
const attendanceRoutes = require('./routes/attendance'); 
const leaveRoutes = require('./routes/leaves');
const dashboardRoutes = require('./routes/dashboard');
const holidays = require('./routes/holidays');
const purchaseRoutes = require('./routes/purchases');
const chatRoutes = require('./routes/chat');
const projectsRoutes = require('./routes/projects');
const walletsRoute = require('./routes/wallets');


const app = express();

// --- 2. MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(xmlparser()); // You had imported this but weren't using it

// --- 3. MOUNT ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/holidays', holidays);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/wallets', walletsRoute);

app.get('/', (req, res) => res.send("GTS HRMS API is running..."));

// --- 4. DATABASE & SERVER START ---
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");
        app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.log(err));