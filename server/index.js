const xmlparser = require('express-xml-bodyparser');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Must come first: several modules below read process.env at load time
// (s3Service builds its S3 client from AWS_* the moment it is required), so
// anything required before this would capture undefined credentials.
dotenv.config();

require('./cron/attendanceCron')
require('./cron/videoCompressionCron')
require('./cron/recurringTaskCron')
require('./cron/whatsappHealthCron')

// --- 1. IMPORT ROUTES ---
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employee');
const settingsRoutes = require('./routes/settings');     
const attendanceRoutes = require('./routes/attendance'); 
const leaveRoutes = require('./routes/leaves');
const dashboardRoutes = require('./routes/dashboard');
const holidays = require('./routes/holidays');
const chatRoutes = require('./routes/chat');
const conversationRoutes = require('./routes/conversations');
const projectsRoutes = require('./routes/projects');
const walletsRoute = require('./routes/wallets');
const inventoryRoute = require('./routes/inventory');
const expenseRoute = require('./routes/expenses');
const reimbursementRoutes = require('./routes/reimbursements');
const vendorRoutes = require('./routes/vendors');
const wfh = require('./routes/wfh');
const documentRoutes = require('./routes/documents');
const payrollRoutes = require('./routes/payroll');
const notificationRoutes = require('./routes/notifications');
const whatsappRoutes = require('./routes/whatsapp');
const taskRoutes = require('./routes/tasks');
const recurringTaskRoutes = require('./routes/recurringTasks');
const voiceTaskRoutes = require('./routes/voiceTasks');

const foreverBeginsRoutes = require('./routes/foreverBegins');

const app = express();

// --- 2. MIDDLEWARE ---
app.use(express.json({ limit: '50mb' }));
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
app.use('/api/chat', chatRoutes);
// Internal messaging (feature draft Module 3). Distinct from /api/chat, which
// is the Gemini assistant — two unrelated features must not share a namespace.
app.use('/api/conversations', conversationRoutes);
// The external participant portal (feature draft Module 2). Its own
// namespace and its own middleware: nothing under /api/portal uses the
// employee auth, and nothing outside it accepts a portal token.
app.use('/api/portal', require('./routes/portal'));
app.use('/api/projects', projectsRoutes);
app.use('/api/wallets', walletsRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/expenses', expenseRoute);
app.use('/api/reimbursements', reimbursementRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/wfh', wfh);
app.use('/api/documents', documentRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/whatsapp', whatsappRoutes);
// Must come before /api/tasks — that router's `/:id` route would otherwise
// match 'recurring' or 'voice' as a task id.
app.use('/api/tasks/recurring', recurringTaskRoutes);
app.use('/api/tasks/voice', voiceTaskRoutes);
app.use('/api/tasks', taskRoutes);

app.use('/api/forever-begins', foreverBeginsRoutes);

app.get('/', (req, res) => res.send("GTS HRMS API is running..."));

// --- 4. DATABASE & SERVER START ---
const PORT = process.env.PORT || 5000;

// socket.io needs the underlying HTTP server, so create it explicitly rather
// than letting app.listen() make one internally.
const http = require('http');
const { initRealtime } = require('./utils/realtime');
const httpServer = http.createServer(app);
initRealtime(httpServer);

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");
        httpServer.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.log(err));