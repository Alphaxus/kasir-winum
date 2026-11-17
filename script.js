import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, getDocs, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyACq4Vs5VgKrH24mqOXY9G5R3PUtReM2qw",
  authDomain: "winum-currency.firebaseapp.com",
  projectId: "winum-currency",
  storageBucket: "winum-currency.firebasestorage.app",
  messagingSenderId: "707635196053",
  appId: "1:707635196053:web:fdef60324a2b63ab2dab9c",
  measurementId: "G-F8QJMC14XD"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let editingCartId = null;
let menus = [];
let transactions = [];
let cart = [];
let selectedChannel = "Offline";
let customers = [];
let customerPrices = [];
let selectedCustomerId = null;
let selectedCustomerName = null;

// Set default filter tanggal ke hari ini
const todayStr = new Date().toLocaleDateString('en-CA');
const filterDateEl = document.getElementById('filter-date');
if (filterDateEl) filterDateEl.value = todayStr;

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

// Auto-format input harga: 13 -> 13.000, 13.5 -> 13.500
window.formatRupiahInput = function(inputEl) {
  let val = inputEl.value.replace(/[^0-9.]/g, '');
  if (!val) {
    inputEl.value = '';
    return;
  }

  const hasDot = val.includes('.');

  if (hasDot) {
    const parts = val.split('.');
    const intPart = parts[0].replace(/\D/g, '');
    const decPart = (parts[1] || '').replace(/\D/g, '').slice(0, 3);
    const paddedDec = decPart.padEnd(3, '0');
    const formattedInt = intPart ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '0';
    inputEl.value = formattedInt + '.' + paddedDec;
  } else {
    const formattedInt = val.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    inputEl.value = formattedInt + '.000';
  }
};

// Bersihkan & format input harga secara real-time saat mengetik
window.cleanRupiahInput = function(inputEl) {
  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;
  const originalValue = inputEl.value;

  // Hapus semua karakter kecuali angka dan titik
  let val = originalValue.replace(/[^0-9.]/g, '');

  // Jika ada lebih dari satu titik, hanya simpan titik pertama
  const dotCount = (val.match(/\./g) || []).length;
  if (dotCount > 1) {
    const firstDot = val.indexOf('.');
    val = val.substring(0, firstDot + 1) + val.substring(firstDot + 1).replace(/\./g, '');
  }

  // Jika tidak ada titik, tambahkan .000
  if (!val.includes('.')) {
    val = val + '.000';
  } else {
    // Potong desimal maksimal 3 digit
    const parts = val.split('.');
    parts[1] = parts[1].replace(/\D/g, '').slice(0, 3);
    val = parts.join('.');
  }

  inputEl.value = val;

  // Kembalikan kursor ke posisi yang sesuai (hindari lompat ke akhir)
  inputEl.setSelectionRange(start, end);
};

// Tampilkan format lengkap saat meninggalkan kolom (blur)
window.formatRupiahInput = function(inputEl) {
  let val = inputEl.value.replace(/[^0-9.]/g, '');
  if (!val) {
    inputEl.value = '';
    return;
  }

  const dotIndex = val.lastIndexOf('.');
  if (dotIndex > -1) {
    const intPart = val.substring(0, dotIndex).replace(/\D/g, '');
    const decPart = val.substring(dotIndex + 1).replace(/\D/g, '').slice(0, 3).padEnd(3, '0');
    const formattedInt = intPart ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '0';
    inputEl.value = formattedInt + '.' + decPart;
  } else {
    const formattedInt = val.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    inputEl.value = formattedInt + '.000';
  }
};

// Parse string berformat titik kembali ke angka murni
window.parseRupiahInput = function(str) {
  if (!str) return 0;
  return Number(str.replace(/\./g, ''));
};

// Fungsi Buka/Tutup Sidebar HP
window.toggleSidebar = () => {
  const sidebar = document.getElementById('mobile-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btn = document.querySelector('.mobile-menu-btn');
  if (sidebar && overlay) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
    if (btn) btn.classList.toggle('open');
  }
};

// 1. Dengarkan perubahan Menu secara Real-time
onSnapshot(query(collection(db, "menus"), orderBy("name")), (snapshot) => {
  menus = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const statusSync = document.getElementById("status-sync");
  if (statusSync) statusSync.textContent = "🟢 Terhubung Online (Real-time)";
  renderMenus();
}, (err) => {
  const statusSync = document.getElementById("status-sync");
  if (statusSync) statusSync.textContent = "🔴 Gagal terhubung: " + err.message;
});

// 2. Dengarkan perubahan Transaksi secara Real-time
onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "desc")), (snapshot) => {
  transactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderLaporan();
});

// 3. Dengarkan perubahan Pelanggan secara Real-time
onSnapshot(query(collection(db, "customers"), orderBy("name")), (snapshot) => {
  customers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCustomerList();
  renderCustomerDropdown();
  renderPriceCustomerSelect();
}, (err) => {
  console.error("Gagal memuat pelanggan:", err);
});

// 4. Dengarkan perubahan Harga Pelanggan secara Real-time
onSnapshot(query(collection(db, "customerPrices"), orderBy("customerId")), (snapshot) => {
  customerPrices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderPriceList();
  hitungUlangHargaCart(selectedCustomerId);
}, (err) => {
  console.error("Gagal memuat harga pelanggan:", err);
});

// Navigasi Tab
window.switchTab = (tabName, btn) => {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  btn.classList.add('active');
  // Tutup dropdown pelanggan saat pindah dari tab Kasir
  const customerListEl = document.getElementById('customer-dropdown-list');
  if (customerListEl) customerListEl.style.display = 'none';
  if (tabName === 'harga') {
    renderPriceList();
  }
};

// Pilih Channel (Offline/Online) — tidak reload halaman, hanya ganti tampilan
window.setChannelView = (ch, btn) => {
  selectedChannel = ch;
  document.getElementById('channel-mode-text').textContent = ch;

  document.querySelectorAll('.channel-btn').forEach(b => {
    if (b.textContent.includes(ch)) b.classList.add('active');
    else b.classList.remove('active');
  });
};
// Tambah Menu ke Firebase
window.tambahMenu = async () => {
  const name = document.getElementById('new-menu-name').value.trim();
  const category = document.getElementById('new-menu-category').value;
  const price = window.parseRupiahInput(document.getElementById('new-menu-price').value);
  if (!name || price <= 0) return alert("Isi nama menu dan harga dengan benar!");

  await addDoc(collection(db, "menus"), { name, category, price });
  document.getElementById('new-menu-name').value = "";
  document.getElementById('new-menu-price').value = "";
  alert("Menu berhasil ditambahkan!");
};

// Hapus Menu
window.hapusMenu = async (id) => {
  if (confirm("Hapus menu ini? Semua harga custom untuk menu ini juga akan dihapus.")) {
    await deleteDoc(doc(db, "menus", id));
    const cpSnap = await getDocs(query(collection(db, "customerPrices"), where("menuId", "==", id)));
    for (const d of cpSnap.docs) {
      await deleteDoc(doc(db, "customerPrices", d.id));
    }
  }
};

// Buka / tutup daftar menu kategori (dropdown overlay)
window.toggleCategory = (category, btn) => {
  const listEl = document.getElementById(`menu-${category}-list`);
  const toggle = btn.querySelector('.menu-category-toggle');
  const isHidden = listEl.style.display === 'none';

  // Tutup semua dropdown lain
  document.querySelectorAll('.menu-dropdown-overlay').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('.menu-category-toggle').forEach(t => {
    t.classList.remove('open');
  });

  if (isHidden) {
    listEl.style.display = 'block';
    toggle.classList.add('open');
  }
};

// Tutup dropdown saat klik di luar area tombol
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-category-dropdown-wrapper')) {
    document.querySelectorAll('.menu-dropdown-overlay').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.menu-category-toggle').forEach(t => {
      t.classList.remove('open');
    });
  }
  if (!e.target.closest('#customer-selector')) {
    const customerListEl = document.getElementById('customer-dropdown-list');
    if (customerListEl) customerListEl.style.display = 'none';
  }
});

// Filter menu berdasarkan pencarian
window.filterMenu = (category, searchText) => {
  const itemsListEl = document.getElementById(`menu-${category}-items`);
  const term = searchText.toLowerCase();
  const filtered = menus.filter(m => {
    const cat = (m.category || 'Makanan').toLowerCase();
    if (category === 'makanan' && cat !== 'makanan') return false;
    if (category === 'minuman' && cat !== 'minuman') return false;
    return m.name.toLowerCase().includes(term);
  });

  if (filtered.length === 0) {
    itemsListEl.innerHTML = `<p style="color:#9ca3af; font-size:0.8rem; padding:8px;">Tidak ditemukan.</p>`;
    return;
  }

  itemsListEl.innerHTML = filtered.map(m => `
    <button class="menu-item" onclick="addToCart('${m.id}')">
      <div class="menu-name">${m.name}</div>
      <div class="menu-price">${rupiah(m.price)}</div>
    </button>
  `).join('');
};

function hitungUlangHargaCart(customerId) {
  cart.forEach(item => {
    const menu = menus.find(m => m.id === item.id);
    if (!menu) return;

    let newPrice = menu.price;
    let note = "";

    if (customerId) {
      const cp = customerPrices.find(p => p.customerId === customerId && p.menuId === item.id);
      if (cp && cp.price) {
        newPrice = cp.price;
        note = " (Harga Pelanggan)";
      }
    }

    item.price = newPrice;
    item.priceNote = note;
  });

  renderCart(); // tampilkan ulang keranjang dengan harga baru
}
// Render Menu di Tab Kasir & Tab Kelola Menu
function renderMenus() {
  const kasirMakananItemsEl = document.getElementById('menu-makanan-items');
  const kasirMinumanItemsEl = document.getElementById('menu-minuman-items');
  const manageEl = document.getElementById('menu-list-manage');
  if (!kasirMakananItemsEl || !kasirMinumanItemsEl || !manageEl) return;

  const makanan = menus.filter(m => (m.category || 'Makanan') === 'Makanan');
  const minuman = menus.filter(m => m.category === 'Minuman');

  // Helper: dapatkan harga tampilan sesuai pelanggan yang dipilih
  const getDisplayPrice = (m) => {
    if (selectedCustomerId) {
      const cp = customerPrices.find(p => p.customerId === selectedCustomerId && p.menuId === m.id);
      if (cp && cp.price) {
        return { price: cp.price, note: ' (Harga Pelanggan)' };
      }
    }
    return { price: m.price, note: '' };
  };

  if (menus.length === 0) {
    kasirMakananItemsEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Belum ada menu. Buka tab <b>Menu</b> di bawah untuk menambah makanan.</p>`;
    kasirMinumanItemsEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Belum ada menu minuman.</p>`;
    manageEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Belum ada menu.</p>`;
    return;
  }

  kasirMakananItemsEl.innerHTML = makanan.map(m => {
    const dp = getDisplayPrice(m);
    return `
      <button class="menu-item" onclick="addToCart('${m.id}')">
        <div class="menu-name">${m.name}</div>
        <div class="menu-price">${rupiah(dp.price)}${dp.note}</div>
      </button>
    `;
  }).join('') || `<p style="color:#9ca3af; font-size:0.8rem; padding:8px;">Belum ada makanan.</p>`;

  kasirMinumanItemsEl.innerHTML = minuman.map(m => {
    const dp = getDisplayPrice(m);
    return `
      <button class="menu-item" onclick="addToCart('${m.id}')">
        <div class="menu-name">${m.name}</div>
        <div class="menu-price">${rupiah(dp.price)}${dp.note}</div>
      </button>
    `;
  }).join('') || `<p style="color:#9ca3af; font-size:0.8rem; padding:8px;">Belum ada minuman.</p>`;

  manageEl.innerHTML = menus.map(m => {
    const dp = getDisplayPrice(m);
    return `
      <div class="cart-row">
        <div><b>${m.name}</b> <span style="color:#6b7280;">(${m.category || 'Makanan'})</span><br><small style="color:#6b7280">${rupiah(dp.price)}${dp.note}</small></div>
        <button class="btn-danger" onclick="hapusMenu('${m.id}')">Hapus</button>
      </div>
    `;
  }).join('');
}

// Keranjang Belanja
window.addToCart = (id) => {
  const baseItem = menus.find(m => m.id === id);
  let price = baseItem.price;
  let priceNote = '';
  if (selectedCustomerId) {
    const cp = customerPrices.find(p => p.customerId === selectedCustomerId && p.menuId === id);
    if (cp && cp.price) {
      price = cp.price;
      priceNote = ' (Harga Pelanggan)';
    }
  }
  
  const existing = cart.find(c => c.id === id);  // ← cuma cek id, bukan price
  if (existing) {
    existing.qty += 1;
    existing.price = price;      // ← update ke harga terbaru
    existing.priceNote = priceNote;
  } else {
    cart.push({ ...baseItem, price, qty: 1, priceNote });
  }
  renderCart();

  // Tutup semua dropdown setelah memilih menu
  document.querySelectorAll('.menu-dropdown-overlay').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('.menu-category-toggle').forEach(t => {
    t.classList.remove('open');
  });
};

window.updateQty = (id, delta) => {
  const idx = cart.findIndex(c => c.id === id);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  renderCart();
};

function renderCart() {
  const cartEl = document.getElementById('cart-items');
  if (!cartEl) return;

  if (cart.length === 0) {
    cartEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Belum ada item dipilih.</p>`;
    document.getElementById('cart-total').textContent = "Rp 0";
    hitungKembalian();
    return;
  }

  let total = 0;
  cartEl.innerHTML = cart.map(c => {
    const sub = c.price * c.qty;
    total += sub;
   return `
  <div class="cart-row">
    <div>
      <b>${c.name} x ${c.qty}</b>${c.priceNote ? `<span class="cart-customer-badge">${c.priceNote}</span>` : ''}<br>
      <small>${rupiah(c.price)} </small>
      <button class="edit-price-btn" onclick="openEditPrice('${c.id}', ${c.price})">Edit</button>
    </div>
    <div class="qty-controls">
      <button class="qty-btn" onclick="updateQty('${c.id}', -1)">-</button>
      <span>${c.qty}</span>
      <button class="qty-btn" onclick="updateQty('${c.id}', 1)">+</button>
    </div>
  </div>
`;
  }).join('');

  document.getElementById('cart-total').textContent = rupiah(total);
  hitungKembalian();
}

window.hitungKembalian = () => {
  const total = cart.reduce((sum, c) => sum + (c.price * c.qty), 0);
  const cashPaidEl = document.getElementById('cash-paid');
  const disp = document.getElementById('change-display');
  if (!cashPaidEl || !disp) return;

  const paid = Number(cashPaidEl.value);
  if (!paid || total === 0) { disp.textContent = ""; return; }
  const diff = paid - total;
  disp.style.color = diff >= 0 ? "#16a34a" : "#dc2626";
  disp.textContent = diff >= 0 ? `Kembalian: ${rupiah(diff)}` : `Kurang: ${rupiah(Math.abs(diff))}`;
};

// Simpan Transaksi ke Firebase
window.simpanTransaksi = async () => {
  if (cart.length === 0) return alert("Pilih minimal 1 menu dulu!");
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const total = cart.reduce((sum, c) => sum + (c.price * c.qty), 0);
  const itemsText = cart.map(c => `${c.name} (${c.qty}x)`).join(", ");

  await addDoc(collection(db, "transactions"), {
    date: dateStr,
    time: timeStr,
    timestamp: now.getTime(),
    channel: selectedChannel,
    customerId: selectedCustomerId || null,
    customerName: selectedCustomerName || 'Umum',
    items: cart,
    itemsText,
    total
  });

  cart = [];
  selectedCustomerId = null;
  selectedCustomerName = null;
  document.getElementById('selected-customer-display').textContent = 'Belum dipilih';
  const cashPaidEl = document.getElementById('cash-paid');
  if (cashPaidEl) cashPaidEl.value = "";
  renderCart();
  alert("✅ Transaksi berhasil disimpan!");
};

// Render Laporan & Filter Tanggal
window.renderLaporan = () => {
  const filterDateEl = document.getElementById('filter-date');
  const statOmzetEl = document.getElementById('stat-omzet');
  const statCountEl = document.getElementById('stat-count');
  const histEl = document.getElementById('tx-history');
  if (!filterDateEl || !statOmzetEl || !statCountEl || !histEl) return;

  const selectedDate = filterDateEl.value;
  const filtered = transactions.filter(t => t.date === selectedDate);

  const omzet = filtered.reduce((sum, t) => sum + t.total, 0);
  statOmzetEl.textContent = rupiah(omzet);
  statCountEl.textContent = filtered.length + " Order";

  if (filtered.length === 0) {
    histEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Tidak ada transaksi pada tanggal ini.</p>`;
    return;
  }

  histEl.innerHTML = filtered.map(t => `
    <div class="tx-item">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span><b>${t.time}</b> • <span class="badge badge-${t.channel}">${t.channel}</span> • <span class="badge" style="background:#f0fdf4; color:#166534;">${t.customerName || 'Umum'}</span></span>
        <b style="color:#ea580c;">${rupiah(t.total)}</b>
      </div>
      <div style="color:#4b5563;">${t.itemsText}</div>
    </div>
  `).join('');
};

// Export ke CSV
window.exportExcel = () => {
  if (transactions.length === 0) return alert("Belum ada data transaksi untuk di-export!");
  let csv = "Tanggal,Jam,Jenis Order,Pelanggan,Detail Menu,Total (Rp)\n";
  transactions.forEach(t => {
    csv += `"${t.date}","${t.time}","${t.channel}","${t.customerName || 'Umum'}","${t.itemsText}",${t.total}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Laporan-Kasir-Winum-${todayStr}.csv`;
  a.click();
};

// ================= PELANGGAN =================

// Render daftar pelanggan di Tab Pelanggan
function renderCustomerList() {
  const el = document.getElementById('customer-list');
  if (!el) return;
  if (customers.length === 0) {
    el.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Belum ada pelanggan. Tambahkan pelanggan di atas.</p>`;
    return;
  }
  el.innerHTML = customers.map(c => `
    <div class="customer-list-item">
      <div>
        <strong>${c.name}</strong>
      </div>
      <button class="customer-delete-btn" onclick="hapusPelanggan('${c.id}')">Hapus</button>
    </div>
  `).join('');
}

// Tambah pelanggan baru
window.tambahPelanggan = async () => {
  const name = document.getElementById('new-customer-name').value.trim();
  if (!name) return alert("Masukkan nama pelanggan!");
  await addDoc(collection(db, "customers"), { name, createdAt: new Date().getTime() });
  document.getElementById('new-customer-name').value = "";
  alert("Pelanggan berhasil ditambahkan!");
};

// Hapus pelanggan
window.hapusPelanggan = async (id) => {
  if (confirm("Hapus pelanggan ini? Semua harga custom juga akan dihapus.")) {
    await deleteDoc(doc(db, "customers"), id);
    // Hapus semua harga custom milik pelanggan ini
    const cpSnap = await getDocs(query(collection(db, "customerPrices"), where("customerId", "==", id)));
    for (const d of cpSnap.docs) {
      await deleteDoc(doc(db, "customerPrices", d.id));
    }
  }
};

// Render dropdown pelanggan di kasir
function renderCustomerDropdown() {
  const el = document.getElementById('customer-dropdown-items');
  if (!el) return;
  if (customers.length === 0) {
    el.innerHTML = `<div style="padding:8px 12px; color:#9ca3af; font-size:0.8rem;">Belum ada pelanggan.</div>`;
    return;
  }
  el.innerHTML = customers.map(c => `
    <div class="customer-dropdown-item ${selectedCustomerId === c.id ? 'selected' : ''}" onclick="pilihPelanggan('${c.id}', '${c.name}')">
      <span>${c.name}</span>
      ${selectedCustomerId === c.id ? '<span style="color:#16a34a;">✓ Aktif</span>' : ''}
    </div>
  `).join('');
}

// Toggle dropdown pelanggan di kasir
window.toggleCustomerDropdown = (btn) => {
  const list = document.getElementById('customer-dropdown-list');
  const isHidden = list.style.display === 'none';
  // Tutup dropdown menu makanan/minuman yang mungkin sedang terbuka
  document.querySelectorAll('.menu-dropdown-overlay').forEach(o => o.style.display = 'none');
  document.querySelectorAll('.menu-category-toggle').forEach(t => t.classList.remove('open'));

  if (isHidden) {
    list.style.display = 'block';
  } else {
    list.style.display = 'none';
  }
};

// Pilih pelanggan di kasir
window.pilihPelanggan = (id, name) => {

  selectedCustomerId = id;
  hitungUlangHargaCart(id); // update harga di keranjang sesuai pelanggan
  selectedCustomerName = name;
  document.getElementById('selected-customer-display').textContent = name;
  document.getElementById('customer-dropdown-list').style.display = 'none';
  renderCustomerDropdown();
  renderMenus(); // refresh tampilan harga sesuai pelanggan
};

// Reset pelanggan
window.resetCustomer = () => {
  selectedCustomerId = null;
  selectedCustomerName = null;
  document.getElementById('selected-customer-display').textContent = 'Belum dipilih';
  document.getElementById('customer-dropdown-list').style.display = 'none';
  renderCustomerDropdown();
  renderMenus();
};

// Render select pelanggan di tab Harga
function renderPriceCustomerSelect() {
  const el = document.getElementById('price-customer-select');
  if (!el) return;
  const currentValue = el.value;
  el.innerHTML = '<option value="">-- Pilih Pelanggan --</option>' +
    customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  el.value = currentValue;
  if (!customers.find(c => c.id === currentValue)) el.value = '';
}

// Render daftar harga untuk pelanggan yang dipilih
window.renderPriceList = () => {
  const customerSelect = document.getElementById('price-customer-select');
  const listEl = document.getElementById('price-list');
  if (!listEl) return;

  const customerId = customerSelect ? customerSelect.value : '';
  if (!customerId) {
    listEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Pilih pelanggan terlebih dahulu untuk mengedit harga.</p>`;
    return;
  }

  const customer = customers.find(c => c.id === customerId);
  if (!customer) {
    listEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Pelanggan tidak ditemukan.</p>`;
    return;
  }

  const customerPriceMap = {};
  customerPrices.filter(p => p.customerId === customerId).forEach(p => {
    customerPriceMap[p.menuId] = p.price;
  });

  listEl.innerHTML = `<div style="font-weight:600; color:#166534; margin-bottom:8px;">Edit Harga untuk: <span style="color:#16a34a;">${customer.name}</span></div>` +
    menus.map(m => {
      const customPrice = customerPriceMap[m.id];
      return `
        <div class="price-list-item">
          <div class="price-info">
            <div class="price-name">${m.name}</div>
            <div class="price-category">${m.category || 'Makanan'}</div>
            ${customPrice !== undefined ? `<div class="price-default">Harga custom saat ini: ${rupiah(customPrice)}</div>` : `<div class="price-default">Harga default: ${rupiah(m.price)}</div>`}
          </div>
            <div style="display:flex; align-items:center; gap:8px;">
            <div class="price-input-wrapper" style="width:auto; min-width:140px;">
              <input type="text" class="custom-price-input" id="custom-price-${m.id}" placeholder="Harga baru" value="${customPrice !== undefined ? customPrice : ''}" oninput="cleanRupiahInput(this)" onblur="formatRupiahInput(this)" />
            </div>
            <button class="price-save-btn" onclick="simpanHargaPelanggan('${m.id}')">Simpan</button>
          </div>
        </div>
      `;
    }).join('');
};
window.openEditPrice = (cartId, currentPrice) => {
  editingCartId = cartId;
  const input = document.getElementById('edit-price-input');
  input.placeholder = `Harga saat ini: ${rupiah(currentPrice)}`;
  input.value = '';
  document.getElementById('edit-price-popup').style.display = 'flex';
  document.getElementById('popup-backdrop').style.display = 'block';
  input.focus(); // paksa fokus agar keyboard muncul di HP

  // Push state agar tombol back HP bisa menutup popup
  history.pushState({ editPricePopup: true }, '');

  // Tunggu sebentar agar DOM render, baru hitung posisi popup
  setTimeout(() => {
    adjustPopupPosition();
  }, 150);
};

// Sesuaikan posisi popup saat keyboard HP muncul / hilang (hanya HP)
function adjustPopupPosition() {
  // Di PC, biarkan CSS yang menengahkan popup, jangan di-override JS
  if (window.innerWidth >= 768) return;

  const overlay = document.getElementById('edit-price-popup');
  if (!overlay || overlay.style.display === 'none') return;

  // Pastikan overlay menutupi layar penuh
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';

  const popup = overlay.querySelector('.popup-box');
  if (!popup) return;

  const vp = window.visualViewport || window;
  const availableHeight = vp.height;
  const popupHeight = popup.offsetHeight || 260;
  const bottomSafe = 60;

  let top = 60;
  const maxTop = availableHeight - popupHeight - bottomSafe;
  if (top > maxTop) {
    top = Math.max(maxTop, 20);
  }

  popup.style.top = top + 'px';
}

// Deteksi resize visualViewport (keyboard muncul/hilang di HP)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const popup = document.getElementById('edit-price-popup');
    if (popup && popup.style.display !== 'none') {
      adjustPopupPosition();
    }
  });
}
window.closeEditPrice = () => {
  document.getElementById('edit-price-popup').style.display = 'none';
  document.getElementById('popup-backdrop').style.display = 'none';
  editingCartId = null;

  // Hapus state yang di-push saat popup dibuka
  if (history.state && history.state.editPricePopup) {
    history.back();
  }
};
window.simpanEditHarga = async () => {
  const input = document.getElementById('edit-price-input');
  const newPrice = input ? window.parseRupiahInput(input.value) : null;
  
  if (!newPrice || newPrice <= 0) {
    return alert("Masukkan harga yang valid!");
  }

  // 1. Update item di cart
  const item = cart.find(c => c.id === editingCartId);
  if (item) {
    item.price = newPrice;
    item.priceNote = " (Edit Manual)";
  }

  // 2. Jika ada pelanggan yang dipilih, update juga customerPrices di Firebase
  if (selectedCustomerId && editingCartId) {
    const existing = customerPrices.find(p => p.customerId === selectedCustomerId && p.menuId === editingCartId);
    if (existing) {
      await addDoc(collection(db, "customerPrices"), { customerId: selectedCustomerId, menuId: editingCartId, price: newPrice, updatedAt: new Date().getTime() });
      await deleteDoc(doc(db, "customerPrices", existing.id));
    } else {
      await addDoc(collection(db, "customerPrices"), { customerId: selectedCustomerId, menuId: editingCartId, price: newPrice, createdAt: new Date().getTime() });
    }
  }

  renderCart();
  closeEditPrice();
};
document.addEventListener('keydown', (e) => {
  const popup = document.getElementById('edit-price-popup');
  if (!popup || popup.style.display === 'none') return;

  if (e.key === 'Escape') {
    closeEditPrice();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    simpanEditHarga();
  }
});

// Handle tombol back HP (Android hardware back) untuk menutup popup
window.addEventListener('popstate', () => {
  const popup = document.getElementById('edit-price-popup');
  if (popup && popup.style.display !== 'none') {
    closeEditPrice();
  }
});
// Simpan harga custom untuk menu item tertentu ke pelanggan
window.simpanHargaPelanggan = async (menuId) => {
  const customerSelect = document.getElementById('price-customer-select');
  const customerId = customerSelect ? customerSelect.value : '';
  if (!customerId) return alert("Pilih pelanggan terlebih dahulu!");

  const input = document.getElementById(`custom-price-${menuId}`);
  const newPrice = input ? window.parseRupiahInput(input.value) : null;

  if (newPrice === null || newPrice === '' || isNaN(newPrice)) {
    // Kosongkan = hapus harga custom, kembali ke default
    const existing = customerPrices.find(p => p.customerId === customerId && p.menuId === menuId);
    if (existing) {
      await deleteDoc(doc(db, "customerPrices", existing.id));
    }
    alert("Harga custom dihapus. Akan menggunakan harga default.");
  } else if (newPrice <= 0) {
    return alert("Harga harus lebih dari 0!");
  } else {
    const existing = customerPrices.find(p => p.customerId === customerId && p.menuId === menuId);
    if (existing) {
      await addDoc(collection(db, "customerPrices"), { customerId, menuId, price: newPrice, updatedAt: new Date().getTime() });
      await deleteDoc(doc(db, "customerPrices", existing.id));
    } else {
      await addDoc(collection(db, "customerPrices"), { customerId, menuId, price: newPrice, createdAt: new Date().getTime() });
    }

    alert("Harga berhasil disimpan!");

  }
  hitungUlangHargaCart(selectedCustomerId);
  renderPriceList();
  renderMenus();

};