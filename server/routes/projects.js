const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Project = require('../models/Project');
const Purchase = require('../models/Expense');

// @route   GET /api/projects
// @desc    Get all active projects (For Dropdowns)
router.get('/', auth, async (req, res) => {
    try {
        const projects = await Project.find({ status: 'Active' }).sort({ name: 1 });
        res.json(projects);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/projects/all
// @desc    Get all projects + Auto-Calculate Total Spent (Paginated)
router.get('/all', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        // --- 1. PAGINATION SETUP ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let andConditions = [];

        // --- 2. SEARCH FILTERING ---
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            
            // First find users matching the search to allow searching by Project Lead name
            const matchingUsers = await User.find({ name: searchRegex }).distinct('_id');

            andConditions.push({
                $or: [
                    { name: searchRegex },
                    { description: searchRegex },
                    { projectLead: { $in: matchingUsers } }
                ]
            });
        }

        let query = {};
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        // --- 3. COUNT AND FETCH ---
        const totalRecords = await Project.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const projects = await Project.find(query)
            .populate('projectLead', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // --- 4. CALCULATE AGGREGATES FOR VISIBLE PROJECTS ONLY ---
        const projectsWithStats = await Promise.all(projects.map(async (proj) => {
            const spentAgg = await Purchase.aggregate([
                { $match: { projectName: proj.name, status: 'Approved' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            
            const totalSpent = spentAgg.length > 0 ? spentAgg[0].total : 0;
            
            return {
                ...proj.toObject(),
                totalSpent,
                totalVendorPayments: 0 // Placeholder for next module
            };
        }));

        res.json({
            data: projectsWithStats,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error("Project Fetch Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/projects
// @desc    Create a new project
router.post('/', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { name, description, status, projectLead, startDate, endDate, totalBudget } = req.body;
        
        let existingProject = await Project.findOne({ name: new RegExp(`^${name}$`, 'i') });
        if (existingProject) return res.status(400).json({ message: 'Project name already exists' });

        const project = new Project({
            name, description, status, projectLead, startDate, endDate, totalBudget, createdBy: req.user.id
        });

        await project.save();
        res.status(201).json(project);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/projects/:id
// @desc    Update a project
router.put('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { name, description, status, projectLead, startDate, endDate, totalBudget } = req.body;
        const project = await Project.findByIdAndUpdate(
            req.params.id, 
            { name, description, status, projectLead, startDate, endDate, totalBudget }, 
            { new: true }
        );
        res.json(project);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/projects/:id
// @desc    Delete a project
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        await Project.findByIdAndDelete(req.params.id);
        res.json({ message: 'Project deleted' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;