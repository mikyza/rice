const AppConfig = {
    API_URL: 'http://localhost:3000' 
};

const state = {
    products: [],
    cart: JSON.parse(localStorage.getItem('rd_cart')) || [],
    user: JSON.parse(localStorage.getItem('rd_user')) || null,
};

const api = {
    async request(endpoint, options = {}) {
        try {
            const res = await fetch(`${AppConfig.API_URL}${endpoint}`, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${state.user?.token}`,
                    // Only set Content-Type if we aren't sending FormData (for Admin uploads)
                    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
                    ...options.headers
                }
            });
            if (!res.ok) {
                const text = await res.json();
                throw new Error(text.error || "Server Error");
            }
            return await res.json();
        } catch (err) {
            ui.toast(err.message, "error");
            return null;
        }
    }
};

const auth = {
    mode: 'login', // 'login', 'register', 'forgot'

    showModal(mode = 'login') {
        this.showMode(mode);
        const modal = document.getElementById('authModal');
        const box = document.getElementById('authBox');
        modal.classList.remove('invisible');
        setTimeout(() => { box.classList.remove('scale-95', 'opacity-0'); }, 10);
    },
    
    hideModal() {
        const modal = document.getElementById('authModal');
        const box = document.getElementById('authBox');
        box.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { modal.classList.add('invisible'); }, 300);
    },

    showMode(mode) {
        this.mode = mode;
        const form = document.getElementById('authForm');
        const forgotForm = document.getElementById('forgotForm');
        const title = document.getElementById('authTitle');
        const nameInput = document.getElementById('authName');
        const btn = document.getElementById('authBtn');
        const toggleText = document.getElementById('authToggleText');
        const toggleLink = document.getElementById('authToggleLink');
        const forgotLink = document.getElementById('forgotLink');

        form.classList.add('hidden');
        forgotForm.classList.add('hidden');

        if (mode === 'login') {
            form.classList.remove('hidden');
            title.innerText = "Welcome Back";
            nameInput.classList.add('hidden');
            nameInput.removeAttribute('required');
            btn.innerText = "Login Securely";
            forgotLink.classList.remove('hidden');
            toggleText.innerText = "Need an account?";
            toggleLink.innerText = "Register here";
            toggleLink.onclick = () => this.showMode('register');
        } else if (mode === 'register') {
            form.classList.remove('hidden');
            title.innerText = "Create Account";
            nameInput.classList.remove('hidden');
            nameInput.setAttribute('required', 'true');
            btn.innerText = "Register";
            forgotLink.classList.add('hidden');
            toggleText.innerText = "Already have one?";
            toggleLink.innerText = "Login here";
            toggleLink.onclick = () => this.showMode('login');
        } else if (mode === 'forgot') {
            forgotForm.classList.remove('hidden');
            title.innerText = "Reset Password";
            toggleText.innerText = "Remembered it?";
            toggleLink.innerText = "Back to Login";
            toggleLink.onclick = () => this.showMode('login');
        }
    },

    async submit(e) {
        e.preventDefault();
        const email = document.getElementById('authEmail').value;
        const pass = document.getElementById('authPass').value;
        const name = document.getElementById('authName').value;

        const endpoint = this.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const body = this.mode === 'login' ? { email, password: pass } : { name, email, password: pass };

        const res = await api.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
        
        if (res && res.token) {
            state.user = res;
            localStorage.setItem('rd_user', JSON.stringify(res));
            this.hideModal();
            ui.setupUserEnvironment();
            ui.toast(`Welcome back!`);
        } else if (res && res.message) {
            ui.toast("Account created! Please login.");
            this.showMode('login');
        }
    },

    async submitForgot(e) {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value;
        const newPassword = document.getElementById('resetPass').value;

        const res = await api.request('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email, newPassword })
        });

        if (res && res.success) {
            ui.toast(res.message);
            this.showMode('login');
        }
    },

    logout() {
        state.user = null;
        localStorage.removeItem('rd_user');
        ui.setupUserEnvironment();
        ui.showView('shop');
        ui.toast("Logged out successfully");
    }
};

const ui = {
    setupUserEnvironment() {
        const authDiv = document.getElementById('authLinks');
        const badge = document.getElementById('loyaltyBadge');
        
        if (state.user) {
            authDiv.innerHTML = `<button onclick="ui.showView('${state.user.role === 'admin' ? 'admin' : 'profile'}')" class="font-bold text-organic-800 bg-white border border-organic-100 shadow-sm px-4 py-2 rounded-full hover:bg-organic-50 transition-colors">
                <i class="fas fa-user-circle text-organic-600 mr-1"></i> ${state.user.name.split(' ')[0]}
            </button>`;
            
            if (state.user.role === 'customer') {
                badge.classList.remove('hidden');
                document.getElementById('pointsCount').innerText = state.user.points || 0;
                document.getElementById('profilePoints').innerText = state.user.points || 0;
                userLogic.fetchHistory();
            } else {
                badge.classList.add('hidden');
                admin.fetchOrders();
            }
        } else {
            authDiv.innerHTML = `<button onclick="auth.showModal('login')" class="bg-organic-800 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-organic-600 shadow-md transition-all">Login</button>`;
            badge.classList.add('hidden');
        }
    },

    showView(viewId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        window.scrollTo(0,0);
    },

    renderProducts(filter = "") {
        const grid = document.getElementById('productGrid');
        grid.innerHTML = state.products
            .filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
            .map(p => `
                <div class="glass-card p-4 rounded-3xl group flex flex-col h-full">
                    <div class="relative overflow-hidden rounded-2xl mb-4">
                        <img src="${p.image_url}" class="h-48 w-full object-cover group-hover:scale-110 transition-transform duration-500" alt="${p.name}">
                        ${p.stock < 10 ? `<span class="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">Low Stock</span>` : ''}
                    </div>
                    <div class="px-2 flex-grow flex flex-col">
                        <h3 class="font-black text-xl text-organic-900 truncate">${p.name}</h3>
                        <p class="text-xs font-bold text-organic-500 mb-4 uppercase tracking-wider">${p.category} • ${p.grade}</p>
                        
                        <div class="mt-auto">
                            <div class="flex items-center justify-between mb-4 bg-organic-50/50 p-2 rounded-xl border border-organic-50">
                                <span class="text-organic-800 font-black text-lg">$${p.price_per_kg}/<span class="text-sm font-normal text-gray-500">kg</span></span>
                                <div class="flex items-center gap-1">
                                    <input type="number" id="qty-${p.id}" value="1" min="1" max="${p.stock}" 
                                        class="w-14 text-center bg-white border border-gray-200 rounded-lg py-1 outline-none focus:border-organic-500 font-bold">
                                </div>
                            </div>
                            <button onclick="cartLogic.addToCart(${p.id})" 
                                class="w-full bg-organic-100 text-organic-800 py-3 rounded-2xl text-sm font-black hover:bg-organic-600 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2 border border-organic-200 shadow-sm">
                                <i class="fas fa-cart-plus"></i> Add to Basket
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
    },

    toggleCart() {
        const drawer = document.getElementById('cartDrawer');
        drawer.classList.toggle('invisible');
        drawer.querySelector('.absolute.right-0').classList.toggle('translate-x-full');
        cartLogic.renderItems();
    },

    toast(msg, type = "info") {
        alert(msg); // Replace with a fancy toast notification system if desired
    }
};

const cartLogic = {
    addToCart(id) {
        const product = state.products.find(p => p.id === id);
        const inputField = document.getElementById(`qty-${id}`);
        const qty = parseInt(inputField.value);

        if (isNaN(qty) || qty <= 0) return ui.toast("Please enter a valid weight");
        
        const existing = state.cart.find(i => i.id === id);
        const currentQtyInCart = existing ? existing.quantity : 0;

        if (qty + currentQtyInCart > product.stock) {
            return ui.toast(`Cannot add more. Only ${product.stock}kg total available.`);
        }

        if (existing) { 
            existing.quantity += qty; 
        } else { 
            state.cart.push({ ...product, quantity: qty }); 
        }

        // Reset input field to 1 after adding
        inputField.value = 1;
        
        this.saveAndSync();
        ui.toast(`Added ${qty}kg of ${product.name}`);
        this.renderItems();
    },

    // Helper to keep localStorage updated
    saveAndSync() {
        localStorage.setItem('rd_cart', JSON.stringify(state.cart));
        document.getElementById('cartCount').innerText = state.cart.reduce((a, b) => a + b.quantity, 0);
    },

    renderItems() {
        const container = document.getElementById('cartItems');
        this.saveAndSync();

        if (state.cart.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-400">
                    <i class="fas fa-shopping-basket text-6xl mb-4 opacity-20"></i>
                    <p class="font-bold">Your basket is empty</p>
                    <button onclick="ui.toggleCart()" class="mt-4 text-organic-600 text-sm font-bold underline">Start Shopping</button>
                </div>`;
            this.updateTotal();
            return;
        }

        container.innerHTML = state.cart.map((item, index) => `
            <div class="group relative bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm hover:border-organic-500 transition-all">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-black text-organic-900">${item.name}</h4>
                        <p class="text-xs text-gray-500 uppercase font-bold tracking-widest">${item.category}</p>
                    </div>
                    <button onclick="cartLogic.remove(${index})" class="text-gray-300 hover:text-red-500 transition-colors">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </div>
                
                <div class="flex justify-between items-center mt-4">
                    <div class="flex items-center bg-organic-50 rounded-lg p-1 border border-organic-100">
                        <button onclick="cartLogic.updateQty(${index}, -1)" class="w-8 h-8 flex items-center justify-center hover:bg-white rounded-md text-organic-800 transition-all">-</button>
                        <span class="px-3 font-black text-sm">${item.quantity}kg</span>
                        <button onclick="cartLogic.updateQty(${index}, 1)" class="w-8 h-8 flex items-center justify-center hover:bg-white rounded-md text-organic-800 transition-all">+</button>
                    </div>
                    <div class="text-right">
                        <span class="block text-xs text-gray-400">$${item.price_per_kg}/kg</span>
                        <span class="font-black text-organic-900 text-lg">$${(item.quantity * item.price_per_kg).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `).join('');

        // Loyalty Logic: Only show redeem option if they have 100+ points AND items in cart
        const redeemSection = document.getElementById('redeemSection');
        if (state.user && state.user.points >= 100 && state.cart.length > 0) {
            redeemSection.classList.remove('hidden');
        } else {
            redeemSection.classList.add('hidden');
            const toggle = document.getElementById('usePointsToggle');
            if (toggle) toggle.checked = false;
        }
        
        this.updateTotal();
    },

    updateQty(index, delta) {
        const item = state.cart[index];
        const product = state.products.find(p => p.id === item.id);
        
        const newQty = item.quantity + delta;
        
        if (newQty <= 0) return this.remove(index);
        if (newQty > product.stock) return ui.toast("Maximum stock reached");
        
        item.quantity = newQty;
        this.renderItems();
    },

    remove(index) {
        state.cart.splice(index, 1);
        this.renderItems();
    },

    updateTotal() {
        const subtotal = state.cart.reduce((acc, i) => acc + (i.price_per_kg * i.quantity), 0);
        const totalKg = state.cart.reduce((acc, i) => acc + Number(i.quantity), 0);
        
        let discount = 0;
        const usePoints = document.getElementById('usePointsToggle')?.checked;

        if (usePoints && state.cart.length > 0) {
            // Give them the 1kg discount based on their most expensive item in cart
            const prices = state.cart.map(i => parseFloat(i.price_per_kg));
            discount = Math.max(...prices); 
        }

        const finalTotal = Math.max(0, subtotal - discount);
        
        // UI Updates
        document.getElementById('cartSubtotal').innerText = `$${subtotal.toFixed(2)}`;
        document.getElementById('cartTotal').innerText = `$${finalTotal.toFixed(2)}`;

        // Potential Rewards Math
        const pointsEarned = Math.floor(totalKg / 40) * 100;
        const remainder = totalKg % 40;
        const needed = 40 - remainder;

        const rewardMsg = document.getElementById('rewardMessage');
        if (rewardMsg) {
            if (totalKg === 0) {
                rewardMsg.innerHTML = '';
            } else if (pointsEarned > 0) {
                rewardMsg.innerHTML = `
                    <div class="bg-organic-600 text-white p-4 rounded-2xl shadow-inner mb-4">
                        <div class="flex items-center gap-3">
                            <div class="bg-white/20 p-2 rounded-lg"><i class="fas fa-crown text-organic-gold"></i></div>
                            <div>
                                <p class="text-xs uppercase font-bold opacity-80 tracking-tighter">Order Reward</p>
                                <p class="font-black">+${pointsEarned} Points earned!</p>
                            </div>
                        </div>
                        <p class="text-[10px] mt-2 opacity-70">Add ${needed}kg more to unlock another 100 points.</p>
                    </div>`;
            } else {
                rewardMsg.innerHTML = `
                    <div class="bg-gray-100 border border-dashed border-gray-300 p-4 rounded-2xl mb-4 text-center">
                        <p class="text-gray-500 text-xs font-bold">Add <span class="text-organic-600">${needed}kg</span> more to earn your first <span class="text-organic-600">100 points!</span></p>
                    </div>`;
            }
        }
    },

    async checkout() {
    if (!state.user) return auth.showModal();
    if (state.cart.length === 0) return ui.toast("Cart is empty");

    const usePoints = document.getElementById('usePointsToggle')?.checked;
    const finalTotal = parseFloat(document.getElementById('cartTotal').innerText.replace('$', ''));

    // We send the cart and whether points were used. 
    // The server will re-calculate the pointsEarned for security.
    const payload = {
        items: state.cart,
        total: finalTotal,
        pointsUsed: usePoints ? 100 : 0
    };

    const res = await api.request('/api/orders', { 
        method: 'POST', 
        body: JSON.stringify(payload) 
    });

    if (res && res.success) {
        // Update local user points so the "Crown" badge updates immediately
        const earned = res.pointsEarned;
        ui.toast(`Success! You earned ${earned} points.`, 'success');
        
        // Refresh local user data
        state.user.points = (state.user.points || 0) - payload.pointsUsed + earned;
        localStorage.setItem('rd_user', JSON.stringify(state.user));
        
        // Clear cart and refresh UI
        state.cart = [];
        localStorage.removeItem('rd_cart');
        ui.setupUserEnvironment(); // This updates the points display on navbar
        ui.renderProducts();
        ui.toggleCart();
        
        if (state.user.role !== 'admin') ui.showView('profile');
    }
}
};
const userLogic = {
    async fetchHistory() {
        const res = await api.request('/api/orders/history');
        if (res) {
            const list = document.getElementById('orderHistoryList');
            list.innerHTML = res.map(o => `
                <div class="bg-white p-6 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
                    <div>
                        <div class="font-black text-organic-900 text-lg mb-1">Order #${o.id}</div>
                        <div class="text-sm font-bold text-gray-400"><i class="far fa-calendar-alt"></i> ${new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-black text-2xl text-organic-900 mb-2">$${o.total_amount}</div>
                        <span class="text-xs uppercase font-black tracking-wider px-3 py-1 rounded-full 
                            ${o.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                              o.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                              o.status === 'completed' ? 'bg-organic-100 text-organic-700' :
                              'bg-gray-100 text-gray-700'}">
                            ${o.status}
                        </span>
                    </div>
                </div>
            `).join('') || '<div class="p-8 text-center bg-gray-50 rounded-2xl text-gray-400 font-bold border border-dashed border-gray-300">No orders found. Time to stock up!</div>';
        }
    }
};

const admin = {
    // 1. TAB SWITCHING LOGIC
    switchTab(tab) {
        // Toggle Panels
        document.getElementById('admin-dashboard-panel').classList.toggle('hidden', tab !== 'dashboard');
        document.getElementById('admin-inventory-panel').classList.toggle('hidden', tab !== 'inventory');
        
        // Toggle Button Styles
        const dashBtn = document.getElementById('tab-dashboard');
        const invBtn = document.getElementById('tab-inventory');
        
        if (tab === 'dashboard') {
            dashBtn.className = "admin-tab px-6 py-2 rounded-full font-bold transition-all bg-white text-organic-900";
            invBtn.className = "admin-tab px-6 py-2 rounded-full font-bold transition-all text-white hover:bg-white/10";
            this.loadDashboard(); // Refresh data when entering dashboard
        } else {
            invBtn.className = "admin-tab px-6 py-2 rounded-full font-bold transition-all bg-white text-organic-900";
            dashBtn.className = "admin-tab px-6 py-2 rounded-full font-bold transition-all text-white hover:bg-white/10";
        }
    },

    // 2. DASHBOARD DATA LOADER (Stats & Orders)
    async loadDashboard() {
        const orders = await api.request('/api/admin/orders');
        const products = await api.request('/api/products');
        
        if (orders) {
            // Calculate Stats
            const revenue = orders.reduce((acc, o) => acc + parseFloat(o.total_amount), 0);
            const totalPoints = orders.reduce((acc, o) => acc + (o.points_earned || 0), 0);
            
            // Render Stats Cards
            const statsContainer = document.getElementById('adminStats');
            if (statsContainer) {
                statsContainer.innerHTML = `
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                        <div class="bg-white p-6 rounded-3xl border border-organic-100 shadow-sm">
                            <p class="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Revenue</p>
                            <h3 class="text-3xl font-black text-organic-900">$${revenue.toLocaleString()}</h3>
                        </div>
                        <div class="bg-white p-6 rounded-3xl border border-organic-100 shadow-sm">
                            <p class="text-gray-500 text-xs font-bold uppercase tracking-wider">Orders Processed</p>
                            <h3 class="text-3xl font-black text-organic-900">${orders.length}</h3>
                        </div>
                        <div class="bg-white p-6 rounded-3xl border border-organic-100 shadow-sm">
                            <p class="text-gray-500 text-xs font-bold uppercase tracking-wider">Loyalty Points Issued</p>
                            <h3 class="text-3xl font-black text-organic-500">${totalPoints}</h3>
                        </div>
                    </div>
                `;
            }

            // Render Orders Table (Matching your Amount, Reward, Status columns)
            const container = document.getElementById('adminOrderTable');
            container.innerHTML = orders.map(o => `
                <tr class="border-b border-gray-50 hover:bg-organic-50/50 transition-colors">
                    <td class="p-4"><span class="font-mono text-xs font-bold text-gray-400">#${o.id}</span></td>
                    <td class="p-4">
                        <div class="font-bold text-organic-900">${o.customer_name}</div>
                        <div class="text-[10px] text-gray-400 font-mono">${o.email}</div>
                    </td>
                    <td class="p-4">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-black">$${parseFloat(o.total_amount).toFixed(2)}</span>
                            ${o.points_used > 0 ? `<span class="text-[10px] bg-red-100 text-red-600 px-1 rounded">Used ${o.points_used}pts</span>` : ''}
                        </div>
                    </td>
                    <td class="p-4">
                        <span class="inline-flex items-center gap-1 bg-organic-100 text-organic-700 px-2 py-1 rounded-full text-[10px] font-black">
                            <i class="fas fa-crown text-[8px]"></i> +${o.points_earned}
                        </span>
                    </td>
                    <td class="p-4">
                        <select onchange="admin.updateStatus(${o.id}, this.value)" 
                                class="bg-white border border-gray-200 text-xs font-bold py-1 px-2 rounded-lg focus:ring-2 ring-organic-500 outline-none cursor-pointer">
                            <option value="pending" ${o.status==='pending'?'selected':''}>Pending</option>
                            <option value="processing" ${o.status==='processing'?'selected':''}>Processing</option>
                            <option value="shipped" ${o.status==='shipped'?'selected':''}>Shipped</option>
                            <option value="completed" ${o.status==='completed'?'selected':''}>Completed</option>
                        </select>
                    </td>
                </tr>
            `).join('');
        }
        
        if (products) this.renderInventory(products);
    },

    // 3. INVENTORY MANAGEMENT
    renderInventory(products) {
        const container = document.getElementById('adminInventoryTable');
        if (!container) return;
        
        container.innerHTML = products.map(p => `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-2xl mb-2 border border-transparent hover:border-organic-200 transition-all">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 bg-organic-100 rounded-lg flex items-center justify-center text-organic-600 font-bold">
                        ${p.name.charAt(0)}
                    </div>
                    <div>
                        <h4 class="font-bold text-sm text-organic-900">${p.name}</h4>
                        <p class="text-xs text-gray-500">${p.stock}kg available</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="admin.editStock(${p.id}, ${p.stock})" class="p-2 hover:bg-white rounded-lg transition-colors text-organic-600" title="Edit Stock"><i class="fas fa-boxes-stacked"></i></button>
                </div>
            </div>
        `).join('');
    },

    async addProduct() {
        const name = document.getElementById('add_name').value;
        const category = document.getElementById('add_cat').value;
        const price = document.getElementById('add_price').value;
        const stock = document.getElementById('add_stock').value;

        if(!name || !price || !stock) return ui.toast("Please fill all product details");

        const payload = {
            name,
            category,
            price_per_kg: parseFloat(price),
            stock: parseInt(stock),
            image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=600'
        };

        const res = await api.request('/api/products', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if(res) {
            ui.toast("New Variety Launched!", "success");
            document.getElementById('productForm').reset();
            this.switchTab('dashboard'); // Go back to see the stats update
        }
    },

    async editStock(id, current) {
        const newVal = prompt("Enter new stock amount (kg):", current);
        if (newVal !== null && !isNaN(newVal)) {
            await api.request(`/api/admin/products/${id}`, { 
                method: 'PUT', 
                body: JSON.stringify({ stock: parseInt(newVal) }) 
            });
            this.loadDashboard();
            ui.toast("Stock Updated");
        }
    },

    async updateStatus(id, newStatus) {
        const res = await api.request(`/api/admin/orders/${id}`, { 
            method: 'PUT', 
            body: JSON.stringify({ status: newStatus }) 
        });
        if(res) ui.toast(`Order #${id} marked as ${newStatus}`, 'success');
    }
};
const hero = {
    current: 0,
    slides: [],
    dots: [],
    
    init() {
        this.slides = document.querySelectorAll('.hero-slide');
        this.dots = document.querySelectorAll('.carousel-dot');
        if(this.slides.length === 0) return;
        
        setInterval(() => {
            this.current = (this.current + 1) % this.slides.length;
            this.update();
        }, 5000); // Shifts every 5 seconds
    },
    
    goTo(index) {
        this.current = index;
        this.update();
    },
    
    update() {
        this.slides.forEach((s, i) => {
            s.style.opacity = (i === this.current) ? '1' : '0';
            this.dots[i].style.background = (i === this.current) ? '#4a7c41' : 'rgba(255,255,255,0.5)';
        });
    }
};

// Add this to your (async () => { ... })() block at the bottom of app.js
hero.init();





// --- BOOTSTRAP ---
(async () => {
    state.products = await api.request('/api/products') || [];
    ui.renderProducts();
    cartLogic.renderItems();
    ui.setupUserEnvironment();

    document.getElementById('searchBar').addEventListener('input', (e) => ui.renderProducts(e.target.value));
})();