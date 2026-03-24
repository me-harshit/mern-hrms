const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware'); 

router.post('/', authMiddleware, handleChat); 

module.exports = router;