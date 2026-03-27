const { GoogleGenerativeAI } = require('@google/generative-ai');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Purchase = require('../models/Expense');

// Initialize Gemini (Requires GEMINI_API_KEY in .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define the Tools (Functions) for Gemini based on your exact schema
const tools = [
  {
    functionDeclarations: [
      {
        name: "getDailyAttendance",
        description: "Get the attendance record (check-in time, check-out time, and status like Present/Late/Absent) for an employee on a specific date.",
        parameters: {
          type: "OBJECT",
          properties: {
            employeeName: { type: "STRING", description: "Name of the employee" },
            targetDate: { type: "STRING", description: "The date to check in YYYY-MM-DD format." }
          },
          required: ["employeeName", "targetDate"]
        }
      },
      {
        name: "getEmployeeLeaves",
        description: "Get the total number of leave days taken by a specific employee in a given month and year.",
        parameters: {
          type: "OBJECT",
          properties: {
            employeeName: { type: "STRING", description: "Name of the employee" },
            month: { type: "INTEGER", description: "Month as a number (1-12)" },
            year: { type: "INTEGER", description: "4-digit year" }
          },
          required: ["employeeName", "month", "year"]
        }
      },
      {
        name: "getEmployeeProfile",
        description: "Get general profile details of an employee, such as their date of joining, role, shift type, email, or salary.",
        parameters: {
          type: "OBJECT",
          properties: {
            employeeName: { type: "STRING", description: "Name of the employee" }
          },
          required: ["employeeName"]
        }
      },
      {
        name: "getEmployeePurchases",
        description: "Get the total amount spent on purchases by a specific employee in a given month and year.",
        parameters: {
          type: "OBJECT",
          properties: {
            employeeName: { type: "STRING", description: "Name of the employee" },
            month: { type: "INTEGER", description: "Month as a number (1-12)" },
            year: { type: "INTEGER", description: "4-digit year" },
            inventoryStatus: { type: "STRING", description: "Optional filter: 'Available', 'In Use', 'Consumed', or 'Lost/Damaged'" }
          },
          required: ["employeeName", "month", "year"]
        }
      },
      {
        name: "getLateDays",
        description: "Get the number of times an employee was marked as 'Late' in a given month and year.",
        parameters: {
          type: "OBJECT",
          properties: {
            employeeName: { type: "STRING", description: "Name of the employee" },
            month: { type: "INTEGER", description: "Month as a number (1-12)" },
            year: { type: "INTEGER", description: "4-digit year" }
          },
          required: ["employeeName", "month", "year"]
        }
      }
    ]
  }
];

// Helper: Get Start and End dates for a specific month
const getMonthDateRange = (year, month) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
};

exports.handleChat = async (req, res) => {
  const { message, history = [] } = req.body;

  try {
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools });
    const chat = model.startChat({
      history: history
    });

    // 1. Send user message to Gemini
    const result = await chat.sendMessage(message);
    const call = result.response.functionCalls()?.[0];

    // 2. Execute DB Logic if Gemini calls a tool
    if (call) {
      let dbResult = {};
      const { name, args } = call;
      const { startDate, endDate } = getMonthDateRange(args.year, args.month);

      // Find user using regex (case-insensitive partial match on your `name` field)
      const user = await User.findOne({ name: new RegExp(args.employeeName, 'i') });

      if (!user) {
        dbResult = { error: `Employee named ${args.employeeName} not found.` };
      } else {

        switch (name) {
          case "getEmployeeLeaves":
            // Matches Leave schema: userId, fromDate, toDate, status, days
            const leaves = await Leave.find({
              userId: user._id,
              status: 'Approved',
              fromDate: { $lte: endDate },
              toDate: { $gte: startDate }
            });
            // Sum the 'days' field directly from your schema
            const totalLeaveDays = leaves.reduce((sum, leave) => sum + leave.days, 0);

            dbResult = { employee: user.name, totalLeaveDays, month: args.month, year: args.year };
            break;

          case "getEmployeeProfile":
            // Pass whatever fields from your User schema you want the AI to be able to talk about
            dbResult = {
              employee: user.name,
              joiningDate: user.joiningDate,
              role: user.role,
              email: user.email,
              shiftType: user.shiftType,
              dateOfBirth: user.dateOfBirth
            };
            break;

          case "getDailyAttendance":
            // 1. Create start and end bounds for the target date
            const searchDate = new Date(args.targetDate);
            const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
            const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));

            // 2. Query the Attendance model
            const dailyRecord = await Attendance.findOne({
              userId: user._id,
              checkIn: { $gte: startOfDay, $lte: endOfDay }
            });

            if (!dailyRecord) {
              dbResult = {
                employee: user.name,
                date: args.targetDate,
                status: "No punch records found. They might be absent or haven't punched in yet."
              };
            } else {
              dbResult = {
                employee: user.name,
                date: args.targetDate,
                status: dailyRecord.status, // e.g., 'Present', 'Late', 'Half Day'
                checkInTime: dailyRecord.checkIn,
                checkOutTime: dailyRecord.checkOut || "Has not checked out yet",
                totalHoursLogged: dailyRecord.totalHours,
                note: dailyRecord.note
              };
            }
            break;

          case "getEmployeePurchases":
            // Matches Purchase schema: purchasedBy, purchaseDate, amount, inventoryStatus
            const purchaseQuery = {
              purchasedBy: user._id,
              purchaseDate: { $gte: startDate, $lte: endDate }
            };

            if (args.inventoryStatus) {
              purchaseQuery.inventoryStatus = new RegExp(args.inventoryStatus, 'i');
            }

            const purchases = await Purchase.find(purchaseQuery);
            const totalSpent = purchases.reduce((sum, item) => sum + item.amount, 0);

            dbResult = {
              employee: user.name,
              totalSpent,
              itemCount: purchases.length,
              statusFilter: args.inventoryStatus || 'All',
              month: args.month,
              year: args.year
            };
            break;

          case "getLateDays":
            // Matches Attendance schema: userId, checkIn, status
            const lateDays = await Attendance.countDocuments({
              userId: user._id,
              checkIn: { $gte: startDate, $lte: endDate },
              status: 'Late'
            });

            dbResult = { employee: user.name, timesLate: lateDays, month: args.month, year: args.year };
            break;
        }
      }

      // 3. Send raw JSON data back to Gemini to format as text
      const finalResult = await chat.sendMessage([{
        functionResponse: {
          name: name,
          response: dbResult
        }
      }]);

      return res.status(200).json({ reply: finalResult.response.text() });
    }

    // 4. Return standard conversational text if no DB query was needed
    return res.status(200).json({ reply: result.response.text() });

  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ reply: "I encountered an error connecting to the HR database." });
  }
};