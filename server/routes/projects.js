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
// @desc    Get all projects + Auto-Calculate Total Spent
router.get('/all', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        
        // 1. Fetch all projects and populate the lead's name
        const projects = await Project.find()
            .populate('projectLead', 'name email')
            .sort({ createdAt: -1 });

        // 2. Dynamically calculate the "Total Spent" for each project
        const projectsWithStats = await Promise.all(projects.map(async (proj) => {
            const spentAgg = await Purchase.aggregate([
                { $match: { projectName: proj.name, status: 'Approved' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            
            const totalSpent = spentAgg.length > 0 ? spentAgg[0].total : 0;
            // NOTE: Total Vendor Payments can be added here later when Vendor module is built.
            
            return { 
                ...proj.toObject(), 
                totalSpent,
                totalVendorPayments: 0 // Placeholder for next module
            };
        }));

        res.json(projectsWithStats);
    } catch (err) {
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