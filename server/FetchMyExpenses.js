require('dotenv').config();
const mongoose = require('mongoose');

// Adjust these paths if your models are located somewhere else
const User = require('./models/User');
const Project = require('./models/Project');
const Expense = require('./models/Expense'); 

const fetchAndPrepareUpdate = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB Connected successfully.');

        // 1. Find Prateek by his exact Employee ID
        const prateek = await User.findOne({ employeeId: 'GTS033' });
        if (!prateek) {
            console.log('❌ Could not find Prateek with Employee ID GTS033');
            return;
        }

        // 2. Find the Oracle ISO Testing Project by ID
        const project = await Project.findById('69c38bc9566ce66722672260');
        if (!project) {
            console.log('❌ Could not find the Oracle ISO Testing project');
            return;
        }

        console.log(`🔍 Searching for expenses submitted by: ${prateek.name} for project: ${project.name}`);

        // 3. Fetch the expenses
        const expenses = await Expense.find({ 
            submittedBy: prateek._id, 
            projectName: project.name 
        });

        console.log(`\n📋 Found ${expenses.length} expenses matching this criteria:\n`);

        // 4. List them out and calculate the total sum
        let totalAmount = 0;
        
        expenses.forEach((exp, index) => {
            console.log(`${index + 1}. Amount: ₹${exp.amount} | Category: ${exp.category} | Status: ${exp.status}`);
            totalAmount += (exp.amount || 0); // Add to our running total
        });

        // 👇 NEW: Print the final total sum!
        console.log(`\n💰 =====================================`);
        console.log(`💰 TOTAL AMOUNT: ₹${totalAmount.toLocaleString('en-IN')}`);
        console.log(`💰 =====================================\n`);

        /* ==========================================================
           🚀 UPDATE LOGIC (Commented out for now)
           When you are ready to change the payer to Harshit Tiwari, 
           paste his MongoDB _id below, uncomment this block, 
           and run the script again.
           ========================================================== */
           
        /*
        const harshitMongoId = 'PASTE_HARSHITS_MONGO_ID_HERE'; 
        
        console.log('⏳ Updating payment source to Harshit...');
        const updateResult = await Expense.updateMany(
            { submittedBy: prateek._id, projectName: project.name },
            { 
                $set: { 
                    paymentSourceId: harshitMongoId,
                    isCompanyPayment: false 
                } 
            }
        );

        console.log(`✅ Successfully updated ${updateResult.modifiedCount} expenses!`);
        */

    } catch (error) {
        console.error('❌ Error during script execution:', error);
    } finally {
        mongoose.connection.close();
        console.log('🔌 Database connection closed.');
        process.exit(0);
    }
};

fetchAndPrepareUpdate();