const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // Get token from header
    const token = req.header('x-auth-token');

    // Check if no token
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        /*
         * An employee token and an external participant's portal token are both
         * signed with JWT_SECRET, so a valid signature is not on its own proof
         * that the bearer is staff. The shapes differ - staff carry `user`,
         * an outsider carries `ext` (see middleware/externalAuthMiddleware.js)
         * - and this is where that difference is enforced.
         *
         * Without it, a vendor's token reaching /api/employees would leave
         * req.user undefined and the outcome would depend on whether that
         * particular route happens to dereference it before querying. Refusing
         * here makes every internal route staff-only by construction, which is
         * what feature draft F2.3 requires, rather than by two dozen separate
         * routes each getting it right.
         */
        if (!decoded.user || !decoded.user.id) {
            return res.status(401).json({ message: 'Token is not valid for this area' });
        }

        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};
