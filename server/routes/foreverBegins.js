const express = require('express');
const router = express.Router();

const { listForeverBeginsFiles } = require('../utils/s3Service');

router.get('/', async (req, res) => {
    try {

        const files = await listForeverBeginsFiles();

        res.json(files);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: "Unable to fetch download links."
        });

    }
});

module.exports = router;