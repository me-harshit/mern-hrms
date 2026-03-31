const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Vendor = require('../models/Vendor');

// @route   POST /api/vendors
// @desc    Add a new vendor to the centralized database
router.post('/', auth, async (req, res) => {
    try {
        const { name, address, gstNumber, notes } = req.body;

        if (!name || !address) {
            return res.status(400).json({ message: 'Vendor Name and Address are required.' });
        }

        // Smart Check: Prevent duplicate vendors if GST is provided
        if (gstNumber && gstNumber.trim() !== '') {
            const existingVendor = await Vendor.findOne({ gstNumber: gstNumber.trim().toUpperCase() });
            if (existingVendor) {
                return res.status(400).json({ message: 'A vendor with this GST number already exists.' });
            }
        }

        const newVendor = new Vendor({
            name: name.trim(),
            address: address.trim(),
            gstNumber: gstNumber ? gstNumber.trim().toUpperCase() : '',
            notes: notes ? notes.trim() : '',
            createdBy: req.user.id
        });

        await newVendor.save();
        res.status(201).json(newVendor);

    } catch (err) {
        console.error("Vendor Creation Error:", err.message);
        res.status(500).json({ message: 'Server Error creating vendor' });
    }
});

// @route   GET /api/vendors
// @desc    Get all vendors (Used for populating dropdowns)
router.get('/', auth, async (req, res) => {
    try {
        // Sort alphabetically so the dropdown looks clean
        const vendors = await Vendor.find()
            .populate('createdBy', 'name')
            .sort({ name: 1 }); 

        res.json(vendors);
    } catch (err) {
        console.error("Fetch Vendors Error:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;