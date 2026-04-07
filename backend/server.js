const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const JWT_SECRET = 'pishori_secret_2026';

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'newpassword', // <--- CHECK THIS
    database: 'ricedirect',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: "Access denied." });
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid token." });
        req.user = decoded;
        next();
    });
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await db.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashed]);
        res.status(201).json({ success: true, message: "User registered" });
    } catch (e) { res.status(400).json({ error: "Email already registered." }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length && await bcrypt.compare(password, users[0].password)) {
            const token = jwt.sign({ id: users[0].id, role: users[0].role }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, role: users[0].role, name: users[0].name, points: users[0].points });
        } else {
            res.status(401).json({ error: "Invalid email or password." });
        }
    } catch (e) { res.status(500).json({ error: "Database error." }); }
});

// FORGOT PASSWORD LOGIC
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const [users] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (!users.length) return res.status(404).json({ error: "Email not found in our database." });
        
        const hashed = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password = ? WHERE email = ?', [hashed, email]);
        res.json({ success: true, message: "Password successfully reset! You can now login." });
    } catch (e) { res.status(500).json({ error: "Database error." }); }
});

// --- PRODUCT ROUTES ---
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM products');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: "Could not fetch products." }); }
});

app.post('/api/orders', verifyToken, async (req, res) => {
    const { items, total, pointsUsed } = req.body;
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // --- MATH LOGIC START ---
        let totalWeightKg = 0;
        for (const item of items) {
            // Ensure we are using the quantity from the cart
            totalWeightKg += Number(item.quantity);
            
            // Check stock
            const [rows] = await connection.execute('SELECT stock FROM products WHERE id = ? FOR UPDATE', [item.id]);
            if (!rows[0] || rows[0].stock < item.quantity) {
                throw new Error(`Insufficient stock for ${item.name}`);
            }
        }

        // Apply your rule: 100 points for every full 40kg
        const pointsEarned = Math.floor(totalWeightKg / 40) * 100;
        // --- MATH LOGIC END ---

        // 1. Insert Order with the calculated points
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (user_id, total_amount, points_earned, points_used, status) VALUES (?, ?, ?, ?, ?)', 
            [req.user.id, total, pointsEarned, pointsUsed || 0, 'pending']
        );
        const orderId = orderResult.insertId;

        // 2. Insert Order Items & Update Stock
        for (const item of items) {
            await connection.execute(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?,?,?,?)', 
                [orderId, item.id, item.quantity, item.price_per_kg]
            );
            await connection.execute('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
        }

        // 3. Update the User's point balance
        // This adds the newly earned points and subtracts any points they chose to spend
        await connection.execute(
            'UPDATE users SET points = points - ? + ? WHERE id = ?', 
            [pointsUsed || 0, pointsEarned, req.user.id]
        );

        await connection.commit();
        
        console.log(`Order ${orderId} success: ${totalWeightKg}kg bought, ${pointsEarned} points awarded.`);
        res.json({ success: true, orderId, pointsEarned });

    } catch (e) {
        await connection.rollback();
        console.error("Order Error:", e.message);
        res.status(400).json({ error: e.message });
    } finally {
        connection.release();
    }
});

// --- ADMIN ONLY: Fetch all orders from all users ---
app.get('/api/admin/orders', verifyToken, async (req, res) => {
    // Security Check: Only allow if role is admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied. Admins only." });
    }

    try {
        const [rows] = await db.execute(`
            SELECT o.*, u.name as customer_name, u.email 
            FROM orders o 
            JOIN users u ON o.user_id = u.id 
            ORDER BY o.created_at DESC
        `);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN ONLY: Update Order Status (Pending -> Shipped) ---
app.put('/api/admin/products/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send("Unauthorized");
    const { stock, price_per_kg } = req.body;
    
    try {
        if (stock !== undefined) {
            await db.execute('UPDATE products SET stock = ? WHERE id = ?', [stock, req.params.id]);
        }
        if (price_per_kg !== undefined) {
            await db.execute('UPDATE products SET price_per_kg = ? WHERE id = ?', [price_per_kg, req.params.id]);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/orders/history', verifyToken, async (req, res) => {
    try {
        const [orders] = await db.execute('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(orders);
    } catch (e) { res.status(500).json({ error: "Database error" }); }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/orders', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const [orders] = await db.execute(`
            SELECT o.id, o.total_amount, o.status, o.created_at, u.name as customer_name,
            (SELECT GROUP_CONCAT(CONCAT(oi.quantity, 'kg ', p.name) SEPARATOR ', ')
             FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id) as items_summary
            FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC
        `);
        res.json(orders);
    } catch (e) { res.status(500).json({ error: "Database error" }); }
});

app.put('/api/admin/orders/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
        await db.execute('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Database error" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ RiceDirect Backend active on port ${PORT}`));