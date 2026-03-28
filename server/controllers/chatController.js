const { GoogleGenerativeAI } = require('@google/generative-ai');

// Models
const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Expense = require('../models/Expense');
const Inventory = require('../models/Inventory');
const Project = require('../models/Project');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Holiday = require('../models/Holiday');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define Tools
const tools = [
  {
    functionDeclarations: [
      // --- HR & ATTENDANCE ---
      {
        name: "getEmployeeProfile",
        description: "Get general profile details of an employee, such as joining date, role, shift type, or email.",
        parameters: { type: "OBJECT", properties: { employeeName: { type: "STRING" } }, required: ["employeeName"] }
      },
      {
        name: "getDailyAttendance",
        description: "Get the attendance record (check-in/out, status) for an employee on a specific date.",
        parameters: { type: "OBJECT", properties: { employeeName: { type: "STRING" }, targetDate: { type: "STRING", description: "YYYY-MM-DD format" } }, required: ["employeeName", "targetDate"] }
      },
      {
        name: "getMonthlyAttendance",
        description: "Get the complete monthly attendance summary for an employee, including the count of days Present, Absent, Late, Half Day, and total work hours logged.",
        parameters: {
          type: "OBJECT",
          properties: {
            employeeName: { type: "STRING" },
            month: { type: "INTEGER", description: "Month as a number (1-12)" },
            year: { type: "INTEGER", description: "4-digit year" }
          },
          required: ["employeeName", "month", "year"]
        }
      },
      {
        name: "getLateDays",
        description: "Get the number of times an employee was marked as 'Late' in a given month and year.",
        parameters: { type: "OBJECT", properties: { employeeName: { type: "STRING" }, month: { type: "INTEGER" }, year: { type: "INTEGER" } }, required: ["employeeName", "month", "year"] }
      },
      {
        name: "getEmployeeLeaves",
        description: "Get the total number of leave days taken by a specific employee in a given month.",
        parameters: { type: "OBJECT", properties: { employeeName: { type: "STRING" }, month: { type: "INTEGER" }, year: { type: "INTEGER" } }, required: ["employeeName", "month", "year"] }
      },
      {
        name: "getUpcomingHolidays",
        description: "Get a list of upcoming company and public holidays.",
        parameters: { type: "OBJECT", properties: { limit: { type: "INTEGER", description: "How many holidays to return" } } }
      },

      // --- EXPENSES & WALLET ---
      {
        name: "getEmployeeExpenses",
        description: "Get the total amount of expenses submitted by an employee in a given month and year.",
        parameters: { type: "OBJECT", properties: { employeeName: { type: "STRING" }, month: { type: "INTEGER" }, year: { type: "INTEGER" }, statusFilter: { type: "STRING", description: "Optional: 'Pending', 'Approved', 'Rejected'" } }, required: ["employeeName", "month", "year"] }
      },
      {
        name: "getWalletBalance",
        description: "Check the current wallet balance of an employee (Positive = advance given, Negative = company owes reimbursement).",
        parameters: { type: "OBJECT", properties: { employeeName: { type: "STRING" } }, required: ["employeeName"] }
      },

      // --- PROJECTS ---
      {
        name: "getProjectDetails",
        description: "Get the status, timeline, and total budget of a specific project.",
        parameters: { type: "OBJECT", properties: { projectName: { type: "STRING" } }, required: ["projectName"] }
      },
      {
        name: "getProjectExpenses",
        description: "Get the total amount of money expensed against a specific project.",
        parameters: { type: "OBJECT", properties: { projectName: { type: "STRING" } }, required: ["projectName"] }
      },

      // --- INVENTORY ---
      {
        name: "getAllInventory",
        description: "Get a global list of all inventory items in the company. Use this when asked for 'all items', 'what is assigned to who', or global stock counts.",
        parameters: {
          type: "OBJECT",
          properties: {
            statusFilter: { type: "STRING", description: "Optional: 'Available', 'Assigned', 'Damaged', or 'Lost'" }
          }
        }
      },
      {
        name: "getInventoryItem",
        description: "Check the stock, quantity, and status (Available, Damaged, Assigned) of an inventory item like 'Laptop'.",
        parameters: { type: "OBJECT", properties: { itemName: { type: "STRING" } }, required: ["itemName"] }
      },
      {
        name: "getEmployeeInventory",
        description: "Check what inventory items are currently assigned to a specific employee.",
        parameters: { type: "OBJECT", properties: { employeeName: { type: "STRING" } }, required: ["employeeName"] }
      }
    ]
  }
];

const getMonthDateRange = (year, month) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
};

exports.handleChat = async (req, res) => {
  const { message, history = [] } = req.body;

  try {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools,
      systemInstruction: `You are an HR & ERP AI Assistant. Today is ${todayStr}. Use tools to fetch DB records. For wallet balances: Positive means company gave an advance, Negative means employee spent out of pocket and company owes them.`
    });

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    const call = result.response.functionCalls()?.[0];

    if (call) {
      let dbResult = {};
      const { name, args } = call;

      // ==========================================
      // 1. GLOBAL QUERIES (No specific User needed)
      // ==========================================
      if (name === "getAllInventory") {
        let query = {};
        if (args.statusFilter) {
          query.status = new RegExp(`^${args.statusFilter}$`, 'i');
        }

        const items = await Inventory.find(query).populate('assignedTo', 'name');

        if (items.length === 0) {
          dbResult = { message: `No inventory items found${args.statusFilter ? ` with status '${args.statusFilter}'` : ''}.` };
        } else {
          // 👇 FIX: Wrapped the array in an { inventoryList: ... } object
          dbResult = {
            inventoryList: items.map(i => ({
              item: i.itemName,
              quantity: i.quantity,
              status: i.status,
              location: i.storageLocation || 'N/A',
              assignedTo: i.assignedTo?.name || "Unassigned"
            }))
          };
        }
      }
      else if (name === "getProjectDetails") {
        const project = await Project.findOne({ name: new RegExp(args.projectName, 'i') }).populate('projectLead', 'name');
        dbResult = project
          ? { name: project.name, status: project.status, budget: project.totalBudget, lead: project.projectLead?.name || "None" }
          : { error: `Project '${args.projectName}' not found.` };
      }
      else if (name === "getProjectExpenses") {
        const expenses = await Expense.find({ projectName: new RegExp(args.projectName, 'i'), status: 'Approved' });
        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        dbResult = { project: args.projectName, totalApprovedExpenses: total, expenseCount: expenses.length };
      }
      else if (name === "getInventoryItem") {
        const items = await Inventory.find({ itemName: new RegExp(args.itemName, 'i') }).populate('assignedTo', 'name');
        if (items.length === 0) {
          dbResult = { error: `No items matching '${args.itemName}' found in inventory.` };
        } else {
          // 👇 FIX: Wrapped the array in an { items: ... } object
          dbResult = {
            items: items.map(i => ({
              item: i.itemName,
              quantity: i.quantity,
              status: i.status,
              location: i.storageLocation || 'N/A',
              assignedTo: i.assignedTo?.name || "Nobody"
            }))
          };
        }
      }
      else if (name === "getUpcomingHolidays") {
        const holidays = await Holiday.find({ date: { $gte: today } }).sort({ date: 1 }).limit(args.limit || 5);
        dbResult = holidays.length > 0
          ? { upcomingHolidays: holidays.map(h => ({ name: h.name, date: h.date.toDateString(), type: h.type })) }
          : { message: "No upcoming holidays found." };
      }

      // ==========================================
      // 2. USER-SPECIFIC QUERIES
      // ==========================================
      else if (args.employeeName) {
        const user = await User.findOne({ name: new RegExp(args.employeeName, 'i') });

        if (!user) {
          dbResult = { error: `Employee named '${args.employeeName}' not found.` };
        } else {
          const { startDate, endDate } = args.month && args.year ? getMonthDateRange(args.year, args.month) : {};

          switch (name) {
            case "getEmployeeProfile":
              dbResult = { employee: user.name, joiningDate: user.joiningDate, role: user.role, email: user.email, shiftType: user.shiftType };
              break;

            case "getDailyAttendance":
              const targetDate = new Date(args.targetDate);
              const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
              const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
              const dailyRecord = await Attendance.findOne({ userId: user._id, checkIn: { $gte: startOfDay, $lte: endOfDay } });
              dbResult = dailyRecord
                ? { employee: user.name, date: args.targetDate, status: dailyRecord.status, checkIn: dailyRecord.checkIn, checkOut: dailyRecord.checkOut, hours: dailyRecord.totalHours }
                : { employee: user.name, date: args.targetDate, status: "No punch records found." };
              break;

            case "getMonthlyAttendance":
              // 1. Fetch all attendance records for the user in the specified month
              const monthlyRecords = await Attendance.find({
                userId: user._id,
                checkIn: { $gte: startDate, $lte: endDate }
              });

              // 2. Tally up the statuses and total hours
              const summary = {
                Present: 0,
                Absent: 0,
                Late: 0,
                'Half Day': 0,
                'On Leave': 0,
                totalHoursLogged: 0
              };

              monthlyRecords.forEach(record => {
                // Increment the specific status count
                if (summary[record.status] !== undefined) {
                  summary[record.status]++;
                }
                // Add to total hours
                if (record.totalHours) {
                  summary.totalHoursLogged += record.totalHours;
                }
              });

              dbResult = {
                employee: user.name,
                month: args.month,
                year: args.year,
                totalDaysLogged: monthlyRecords.length,
                attendanceSummary: summary
              };
              break;

            case "getLateDays":
              const lateDays = await Attendance.countDocuments({ userId: user._id, checkIn: { $gte: startDate, $lte: endDate }, status: 'Late' });
              dbResult = { employee: user.name, timesLate: lateDays, month: args.month, year: args.year };
              break;

            case "getEmployeeLeaves":
              const leaves = await Leave.find({ userId: user._id, status: 'Approved', fromDate: { $lte: endDate }, toDate: { $gte: startDate } });
              dbResult = { employee: user.name, totalLeaveDays: leaves.reduce((sum, l) => sum + l.days, 0), month: args.month, year: args.year };
              break;

            case "getEmployeeExpenses":
              let query = { submittedBy: user._id, expenseDate: { $gte: startDate, $lte: endDate } };
              if (args.statusFilter) query.status = new RegExp(`^${args.statusFilter}$`, 'i');
              const userExpenses = await Expense.find(query);
              dbResult = {
                employee: user.name,
                totalAmount: userExpenses.reduce((sum, e) => sum + e.amount, 0),
                expenseCount: userExpenses.length,
                statusFiltered: args.statusFilter || 'All',
                month: args.month, year: args.year
              };
              break;

            case "getWalletBalance":
              const wallet = await Wallet.findOne({ userId: user._id });
              dbResult = { employee: user.name, balance: wallet ? wallet.balance : 0 };
              break;

            case "getEmployeeInventory":
              const assignedItems = await Inventory.find({ assignedTo: user._id, status: 'Assigned' });
              dbResult = assignedItems.length > 0
                ? { employee: user.name, items: assignedItems.map(i => ({ item: i.itemName, quantity: i.quantity })) }
                : { employee: user.name, items: "No inventory items currently assigned." };
              break;
          }
        }
      }

      // 3. Send raw DB JSON back to Gemini
      const finalResult = await chat.sendMessage([{ functionResponse: { name, response: dbResult } }]);
      return res.status(200).json({ reply: finalResult.response.text() });
    }

    // 4. Return standard conversational text if no DB query was needed
    return res.status(200).json({ reply: result.response.text() });

  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ reply: "I encountered an error connecting to the HR database." });
  }
};