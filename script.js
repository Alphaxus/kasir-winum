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
let editingPriceMenuId = null;
let editingPriceCustomerId = null;
let menus = [];
let transactions = [];
let cart = [];
let selectedChannel = "Offline";
let customers = [];
let customerPrices = [];
let deliveryApps = [];
let selectedCustomerId = null;
let selectedCustomerName = null;
let nextCustomerNumber = 1;

// Set default filter tanggal ke hari ini
const todayStr = new Date().toLocaleDateString('en-CA');
const filterDateEl = document.getElementById('filter-date');
if (filterDateEl) filterDateEl.value = todayStr;

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

// Parse input harga mentah ke angka murni (tanpa format, tanpa kalikan)
window.parseRupiahInput = function(str) {
  if (!str) return 0;
  const val = String(str).replace(/[^0-9.]/g, '');
  if (!val || val === '.') return 0;
  const num = Number(val);
  return isFinite(num) ? num : 0;
};

// Kali 1000 pada field harga
window.kaliSeribu = function(inputEl) {
  const val = inputEl.value.replace(/[^0-9.]/g, '');
  if (!val || val === '.') return;
  const num = Number(val);
  if (!isFinite(num)) return;
  inputEl.value = (num * 1000).toString();
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  inputEl.focus();
};

// Fokus field harga (polis): taruh kursor di akhir
window.focusRupiahInput = function(inputEl) {
  if (!inputEl.dataset.originalValue) inputEl.dataset.originalValue = inputEl.value;
  setTimeout(() => {
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }, 50);
};

// Blur field harga (polis): biarkan apa adanya
window.blurRupiahInput = function(inputEl) {
  // Tidak ada pemformatan; field tetap apa adanya
};


// Hapus angka sambil melewati titik pemisah (.) saat menekan Backspace/Delete
window.handleRupiahDelete = function(inputEl, e) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return;
  e.preventDefault();

  const val = inputEl.value;
  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;
  let newVal, newPos;

  if (start !== end) {
    newVal = val.slice(0, start) + val.slice(end);
    newPos = start;
  } else if (e.key === 'Backspace') {
    let i = start - 1;
    while (i >= 0 && val[i] === '.') i--;
    if (i < 0) return;
    newVal = val.slice(0, i) + val.slice(i + 1);
    newPos = i;
  } else {
    let i = end;
    while (i < val.length && val[i] === '.') i++;
    if (i >= val.length) return;
    newVal = val.slice(0, i) + val.slice(i + 1);
    newPos = i;
  }

  inputEl.value = newVal;
  inputEl.setSelectionRange(newPos, newPos);
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
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

// 5. Dengarkan perubahan Delivery App secara Real-time
onSnapshot(query(collection(db, "deliveryApps"), orderBy("name")), (snapshot) => {
  deliveryApps = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderDeliveryAppList();
  renderDeliveryAppDropdown();
}, (err) => {
  console.error("Gagal memuat delivery app:", err);
});

// 6. Hitung nomor pelanggan berikutnya untuk generate ID WMxx
onSnapshot(query(collection(db, "customers")), (snapshot) => {
  let maxNum = 0;
  snapshot.docs.forEach(d => {
    const data = d.data();
    if (data.customerId) {
      const match = data.customerId.match(/^WM(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });
  nextCustomerNumber = maxNum + 1;
}, (err) => {
  console.error("Gagal hitung nomor pelanggan:", err);
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
  if (tabName === 'rekap') {
    renderLaporan();
  }
};

// Pilih Channel (Offline/Online) — tidak reload halaman, hanya ganti tampilan
window.setChannelView = async (ch, btn) => {
  try {
    // Jika ada item di keranjang, tanya konfirmasi dulu
    if (cart.length > 0) {
      const konfirmasi = confirm(
        "Data keranjang belum disimpan. Anda yakin ingin pindah mode?\n" +
        "Data keranjang akan dihapus dan harus diisi ulang."
      );
      if (!konfirmasi) {
        return; // Batal, jangan pindah mode
      }
      // Lanjut - hapus semua data keranjang
      cart = [];
      renderCart();
      selectedCustomerId = null;
      selectedCustomerName = null;
      document.getElementById('selected-customer-display').textContent = 'Belum dipilih';
      // Reset online form juga
      const onlineCustomerIdEl = document.getElementById('online-customer-id');
      const onlineCustomerNameEl = document.getElementById('online-customer-name');
      const onlineDeliveryAppEl = document.getElementById('online-delivery-app');
      if (onlineCustomerIdEl) onlineCustomerIdEl.value = "";
      if (onlineCustomerNameEl) onlineCustomerNameEl.value = "";
      if (onlineDeliveryAppEl) onlineDeliveryAppEl.value = "";
    }

    selectedChannel = ch;
    const modeText = document.getElementById('channel-mode-text');
    if (modeText) modeText.textContent = ch;

    document.querySelectorAll('.channel-btn').forEach(b => {
      if (b.textContent.includes(ch)) b.classList.add('active');
      else b.classList.remove('active');
    });

    // Tampilkan/sembunyikan view kasir online/offline
    const kasirOffline = document.getElementById('kasir-offline-view');
    const kasirOnline = document.getElementById('kasir-online-view');
    const customerSelectorOffline = document.getElementById('customer-selector-offline');
    const btnPelanggan = document.getElementById('btn-pelanggan');
    const btnHarga = document.getElementById('btn-harga');
    const btnAplikasi = document.getElementById('btn-aplikasi');
    if (kasirOffline && kasirOnline) {
      if (ch === 'Online') {
        kasirOffline.style.display = 'none';
        kasirOnline.style.display = 'block';
        if (customerSelectorOffline) customerSelectorOffline.style.display = 'none';
        if (btnPelanggan) btnPelanggan.style.display = 'none'; // Sembunyikan tombol Pelanggan di bottom nav saat Online
        if (btnHarga) btnHarga.style.display = 'none'; // Sembunyikan tombol Harga di bottom nav saat Online
        if (btnAplikasi) btnAplikasi.style.display = 'flex'; // Tampilkan tombol Aplikasi di bottom nav saat Online
        // Jika admin berada di tab yang hanya ada di Offline (harga/pelanggan), pindah ke tab Kasir saat ke Online
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && (activeTab.id === 'tab-harga' || activeTab.id === 'tab-pelanggan')) {
          const kasirBtn = document.querySelector("nav button[onclick*='kasir']");
          if (kasirBtn) switchTab('kasir', kasirBtn);
        }
        // Tampilkan/sembunyikan section pembayaran di cart sesuai mode
        const cartOfflineSection = document.getElementById('cart-offline-section');
        const cartOnlineSection = document.getElementById('cart-online-section');
        if (cartOfflineSection) cartOfflineSection.style.display = 'none';
        if (cartOnlineSection) cartOnlineSection.style.display = 'flex';
        // Reset input online total setoran saat pindah ke online
        const onlineTotalSetoranEl = document.getElementById('online-total-setoran');
        if (onlineTotalSetoranEl) onlineTotalSetoranEl.value = "";
        const onlineTotalErrorEl = document.getElementById('online-total-setoran-error');
        if (onlineTotalErrorEl) onlineTotalErrorEl.style.display = 'none';
        if (typeof renderDeliveryAppDropdown === 'function') renderDeliveryAppDropdown();
        if (typeof generateNewCustomerId === 'function') await generateNewCustomerId();
        if (typeof renderMenus === 'function') renderMenus();
      } else {
        kasirOffline.style.display = 'block';
        kasirOnline.style.display = 'none';
        if (customerSelectorOffline) customerSelectorOffline.style.display = 'block';
        if (btnPelanggan) btnPelanggan.style.display = 'flex'; // Tampilkan tombol Pelanggan di bottom nav saat Offline
        if (btnHarga) btnHarga.style.display = 'flex'; // Tampilkan tombol Harga di bottom nav saat Offline
        if (btnAplikasi) btnAplikasi.style.display = 'none'; // Sembunyikan tombol Aplikasi di bottom nav saat Offline
        // Tampilkan section pembayaran offline, sembunyikan online
        const cartOfflineSection = document.getElementById('cart-offline-section');
        const cartOnlineSection = document.getElementById('cart-online-section');
        if (cartOfflineSection) cartOfflineSection.style.display = 'flex';
        if (cartOnlineSection) cartOnlineSection.style.display = 'none';
        // Reset cash paid saat pindah ke offline
        const cashPaidEl = document.getElementById('cash-paid');
        if (cashPaidEl) cashPaidEl.value = "";
        const changeDisplayEl = document.getElementById('change-display');
        if (changeDisplayEl) changeDisplayEl.textContent = "";
        if (typeof renderCustomerDropdown === 'function') renderCustomerDropdown();
      }
    }
  } catch (e) {
    console.error('setChannelView error:', e);
  }
};
window.generateNewCustomerId = async () => {
  const newId = await window.generateCustomerId();
  const input = document.getElementById('online-customer-id');
  if (input) {
    input.value = newId;
  }
  return newId;
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
  // Tentukan ID elemen berdasarkan channel yang aktif (Offline/Online)
  const isOnline = selectedChannel === 'Online';
  const wrapperId = isOnline ? `menu-${category}-items-list` : `menu-${category}-list`;
  const itemsId = isOnline ? `menu-${category}-items-online` : `menu-${category}-items`;

  const listEl = document.getElementById(wrapperId);
  const itemsEl = document.getElementById(itemsId);
  const toggle = btn.querySelector('.menu-category-toggle');
  const isHidden = listEl ? listEl.style.display === 'none' : true;

  // Tutup semua dropdown lain
  document.querySelectorAll('.menu-dropdown-overlay').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('.menu-category-toggle').forEach(t => {
    t.classList.remove('open');
  });

  if (listEl && isHidden) {
    listEl.style.display = 'block';
    toggle.classList.add('open');
    // Jika items kosong, tampilkan placeholder
    if (itemsEl && itemsEl.children.length === 0 && itemsEl.innerHTML.trim() === '') {
      itemsEl.innerHTML = `<p style="color:#9ca3af; font-size:0.8rem; padding:8px;">Klik "+ Tambah ${category === 'makanan' ? 'Makanan' : 'Minuman'}" untuk menampilkan daftar.</p>`;
    }
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
  if (!e.target.closest('#customer-selector-offline')) {
    const customerListEl = document.getElementById('customer-dropdown-list');
    if (customerListEl) customerListEl.style.display = 'none';
  }
  // Tutup popup edit harga dan kembalikan nilai asli saat klik di luar popup
  const popup = document.getElementById('edit-price-popup');
  if (popup && popup.style.display !== 'none' && !e.target.closest('.popup-box')) {
    closeEditPrice();
  }
});

// Filter menu berdasarkan pencarian
window.filterMenu = (category, searchText) => {
  // Tentukan ID elemen berdasarkan channel yang aktif
  const isOnline = selectedChannel === 'Online';
  const itemsListEl = document.getElementById(
    isOnline ? `menu-${category}-items-online` : `menu-${category}-items`
  );
  const term = searchText.toLowerCase();
  const filtered = menus.filter(m => {
    const cat = (m.category || 'Makanan').toLowerCase();
    if (category === 'makanan' && cat !== 'makanan') return false;
    if (category === 'minuman' && cat !== 'minuman') return false;
    return m.name.toLowerCase().includes(term);
  });

  if (!itemsListEl) return;

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
  const onlineMakananItemsEl = document.getElementById('menu-makanan-items-online');
  const onlineMinumanItemsEl = document.getElementById('menu-minuman-items-online');
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
    if (onlineMakananItemsEl) onlineMakananItemsEl.innerHTML = kasirMakananItemsEl.innerHTML;
    if (onlineMinumanItemsEl) onlineMinumanItemsEl.innerHTML = kasirMinumanItemsEl.innerHTML;
    manageEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Belum ada menu.</p>`;
    return;
  }

  const makananHtml = makanan.map(m => {
    const dp = getDisplayPrice(m);
    return `
      <button class="menu-item" onclick="addToCart('${m.id}')">
        <div class="menu-name">${m.name}</div>
        <div class="menu-price">${rupiah(dp.price)}${dp.note}</div>
      </button>
    `;
  }).join('') || `<p style="color:#9ca3af; font-size:0.8rem; padding:8px;">Belum ada makanan.</p>`;

  const minumanHtml = minuman.map(m => {
    const dp = getDisplayPrice(m);
    return `
      <button class="menu-item" onclick="addToCart('${m.id}')">
        <div class="menu-name">${m.name}</div>
        <div class="menu-price">${rupiah(dp.price)}${dp.note}</div>
      </button>
    `;
  }).join('') || `<p style="color:#9ca3af; font-size:0.8rem; padding:8px;">Belum ada minuman.</p>`;

  kasirMakananItemsEl.innerHTML = makananHtml;
  kasirMinumanItemsEl.innerHTML = minumanHtml;

  // Sinkronkan ke view online juga
  if (onlineMakananItemsEl) onlineMakananItemsEl.innerHTML = makananHtml;
  if (onlineMinumanItemsEl) onlineMinumanItemsEl.innerHTML = minumanHtml;

  manageEl.innerHTML = menus.map(m => {
    return `
      <div class="cart-row">
        <div><b>${m.name}</b> <span style="color:#6b7280;">(${m.category || 'Makanan'})</span><br><small style="color:#6b7280">${rupiah(m.price)}</small></div>
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
      <button class="edit-price-btn" onclick="event.stopPropagation(); openEditPrice('${c.id}', ${c.price})">Edit</button>
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
  if (selectedChannel === 'Online') return;
  const total = cart.reduce((sum, c) => sum + (c.price * c.qty), 0);
  const cashPaidEl = document.getElementById('cash-paid');
  const disp = document.getElementById('change-display');
  if (!cashPaidEl || !disp) return;

  const paid = window.parseRupiahInput(cashPaidEl.value);
  if (!paid || total === 0) { disp.textContent = ""; return; }
  const diff = paid - total;
  disp.style.color = diff >= 0 ? "#16a34a" : "#dc2626";
  disp.textContent = diff >= 0 ? `Kembalian: ${rupiah(diff)}` : `Kurang: ${rupiah(Math.abs(diff))}`;
};

// Hitung dan tampilkan potongan (%) dan rupiah untuk mode Online
window.hitungDiskonOnline = () => {
  if (selectedChannel !== 'Online') return;
  const total = cart.reduce((sum, c) => sum + (c.price * c.qty), 0);
  const setoranEl = document.getElementById('online-total-setoran');
  const infoEl = document.getElementById('online-discount-info');
  const pctEl = document.getElementById('online-discount-pct');
  const amtEl = document.getElementById('online-discount-amount');
  if (!setoranEl || !infoEl || !pctEl || !amtEl) return;

  const setoran = window.parseRupiahInput(setoranEl.value);
  if (!setoran || total === 0) {
    infoEl.style.display = 'none';
    return;
  }

  const disc = total - setoran;
  if (disc <= 0) {
    infoEl.style.display = 'none';
    return;
  }

  const pct = (disc / total) * 100;
  infoEl.style.display = 'block';
  pctEl.textContent = `-${pct.toFixed(2)}%`;
  amtEl.textContent = `-${rupiah(disc)}`;
};

// Simpan Transaksi ke Firebase
window.simpanTransaksi = async () => {
  if (cart.length === 0) return alert("Pilih minimal 1 menu dulu!");
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const total = cart.reduce((sum, c) => sum + (c.price * c.qty), 0);
  const itemsText = cart.map(c => `${c.name} (${c.qty}x)`).join(", ");

  // Ambil data pelanggan online jika mode Online
  let onlineCustomerId = null;
  let onlineCustomerName = null;
  let onlineDeliveryApp = null;
  let onlineTotalSetoran = null;
  if (selectedChannel === 'Online') {
    onlineCustomerId = document.getElementById('online-customer-id')?.value || null;
    onlineCustomerName = document.getElementById('online-customer-name')?.value || null;
    onlineDeliveryApp = document.getElementById('online-delivery-app')?.value || null;
    onlineTotalSetoran = document.getElementById('online-total-setoran')?.value || null;
    if (!onlineCustomerId) return alert("ID Pelanggan wajib diisi untuk mode Online!");
    if (!onlineTotalSetoran || onlineTotalSetoran.trim() === "") {
      const errorEl = document.getElementById('online-total-setoran-error');
      if (errorEl) errorEl.style.display = 'block';
      return alert("Total setelah potongan wajib diisi untuk mode Online!");
    }
  }

  await addDoc(collection(db, "transactions"), {
    date: dateStr,
    time: timeStr,
    timestamp: now.getTime(),
    channel: selectedChannel,
    customerId: onlineCustomerId || selectedCustomerId || null,
    customerName: onlineCustomerName || selectedCustomerName || 'Umum',
    deliveryApp: onlineDeliveryApp || null,
    totalSetoran: selectedChannel === 'Online' ? onlineTotalSetoran : null,
    items: cart,
    itemsText,
    total
  });

  // Simpan customer online ke collection onlineCustomers (terpisah dari customers Offline)
  if (selectedChannel === 'Online' && onlineCustomerId) {
    await addDoc(collection(db, "onlineCustomers"), {
      customerId: onlineCustomerId,
      name: onlineCustomerName || '',
      deliveryApp: onlineDeliveryApp || '',
      createdAt: new Date().getTime()
    });
  }

  cart = [];
  selectedCustomerId = null;
  selectedCustomerName = null;
  document.getElementById('selected-customer-display').textContent = 'Belum dipilih';
  const cashPaidEl = document.getElementById('cash-paid');
  if (cashPaidEl) cashPaidEl.value = "";
  const onlineTotalSetoranEl = document.getElementById('online-total-setoran');
  if (onlineTotalSetoranEl) onlineTotalSetoranEl.value = "";
  const onlineTotalErrorEl = document.getElementById('online-total-setoran-error');
  if (onlineTotalErrorEl) onlineTotalErrorEl.style.display = 'none';
  // Reset online form
  const onlineCustomerIdEl = document.getElementById('online-customer-id');
  const onlineCustomerNameEl = document.getElementById('online-customer-name');
  const onlineDeliveryAppEl = document.getElementById('online-delivery-app');
  if (onlineCustomerIdEl) onlineCustomerIdEl.value = "";
  if (onlineCustomerNameEl) onlineCustomerNameEl.value = "";
  if (onlineDeliveryAppEl) onlineDeliveryAppEl.value = "";
  // Auto-generate ID pelanggan baru setelah transaksi online disimpan
  if (selectedChannel === 'Online') {
    await generateNewCustomerId();
  }
  renderCart();
  alert("✅ Transaksi berhasil disimpan!");
};

// Render Laporan & Filter Tanggal & Channel
window.renderLaporan = () => {
  const filterDateEl = document.getElementById('filter-date');
  const filterChannelEl = document.getElementById('filter-channel');
  const statOmzetEl = document.getElementById('stat-omzet');
  const statCountEl = document.getElementById('stat-count');
  const histEl = document.getElementById('tx-history');
  if (!filterDateEl || !filterChannelEl || !statOmzetEl || !statCountEl || !histEl) return;

  const selectedDate = filterDateEl.value;
  const selectedChannel = filterChannelEl.value;
  let filtered = transactions.filter(t => t.date === selectedDate);

  // Filter by channel
  if (selectedChannel !== 'all') {
    filtered = filtered.filter(t => t.channel === selectedChannel);
  }

  const omzet = filtered.reduce((sum, t) => sum + t.total, 0);
  statOmzetEl.textContent = rupiah(omzet);
  statCountEl.textContent = filtered.length + " Order";

  if (filtered.length === 0) {
    histEl.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Tidak ada transaksi pada tanggal ini.</p>`;
    return;
  }

  histEl.innerHTML = filtered.map(t => {
    // Tampilkan ID pelanggan untuk online, nama pelanggan untuk offline
    const customerLabel = t.channel === 'Online' && t.customerId
      ? `ID: ${t.customerId}` + (t.customerName ? ` (${t.customerName})` : '')
      : (t.customerName || 'Umum');
    return `
    <div class="tx-item">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span><b>${t.time}</b> • <span class="badge badge-${t.channel}">${t.channel}</span> ${t.deliveryApp ? '<span class="badge" style="background:#e0e7ff; color:#3730a3;">'+t.deliveryApp+'</span>' : ''} • <span class="badge" style="background:#f0fdf4; color:#166534;">${customerLabel}</span></span>
        <b style="color:#ea580c;">${rupiah(t.total)}</b>
      </div>
      <div style="color:#4b5563;">${t.itemsText}</div>
    </div>
  `;
  }).join('');
};

// Export ke CSV
window.exportExcel = () => {
  if (transactions.length === 0) return alert("Belum ada data transaksi untuk di-export!");
  let csv = "Tanggal,Jam,Jenis Order,Delivery App,Pelanggan,Detail Menu,Total (Rp)\n";
  transactions.forEach(t => {
    csv += `"${t.date}","${t.time}","${t.channel}","${t.deliveryApp || '-'}","${t.customerName || 'Umum'}","${t.itemsText}",${t.total}\n`;
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

// Tambah pelanggan baru (OFFLINE ONLY - simpan ke collection customers)
window.tambahPelanggan = async () => {
  const name = document.getElementById('new-customer-name').value.trim();
  if (!name) return alert("Masukkan nama pelanggan!");

  // Generate ID pelanggan OFFLINE dari collection customers (terpisah dari Online)
  const snap = await getDocs(collection(db, "customers"));
  let maxNum = 0;
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.customerId) {
      const match = data.customerId.match(/^WM(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });
  const newNum = maxNum + 1;
  const customerId = `WM${String(newNum).padStart(2, '0')}`;

  await addDoc(collection(db, "customers"), { name, customerId, createdAt: new Date().getTime() });
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
  if (!el) {
    console.error('customer-dropdown-items element not found');
    return;
  }
  
  console.log('renderCustomerDropdown called, customers.length =', customers.length);
  
  if (customers.length === 0) {
    el.innerHTML = `<div style="padding:8px 12px; color:#9ca3af; font-size:0.8rem;">Belum ada pelanggan. Tambah via tab Pelanggan.</div>`;
    return;
  }
  
  const items = customers.map(c => `
    <div class="customer-dropdown-item ${selectedCustomerId === c.id ? 'selected' : ''}" onclick="event.stopPropagation(); pilihPelanggan('${c.id}', '${c.name}')" style="pointer-events:auto;">
      <span style="pointer-events:none;">${c.name}</span>
      ${selectedCustomerId === c.id ? '<span style="color:#16a34a; pointer-events:none;">✓ Aktif</span>' : ''}
    </div>
  `).join('');
  
  el.innerHTML = items;
  console.log('renderCustomerDropdown: rendered', customers.length, 'items');
}

// Toggle dropdown pelanggan di kasir
window.toggleCustomerDropdown = (btn, e) => {
  console.log('toggleCustomerDropdown called');
  try {
    if (e) e.stopPropagation();
    const list = document.getElementById('customer-dropdown-list');
    if (!list) {
      console.error('customer-dropdown-list element not found');
      return;
    }
    const isHidden = list.style.display === 'none' || list.style.display === '';
    console.log('list display before:', list.style.display, 'isHidden:', isHidden);
    
    // Tutup dropdown menu makanan/minuman yang mungkin sedang terbuka
    document.querySelectorAll('.menu-dropdown-overlay').forEach(o => o.style.display = 'none');
    document.querySelectorAll('.menu-category-toggle').forEach(t => t.classList.remove('open'));

    // Selalu render ulang dropdown sebelum ditampilkan
    renderCustomerDropdown();
    
    if (isHidden) {
      list.style.setProperty('display', 'block', 'important');
      console.log('Dropdown opened');
    } else {
      list.style.setProperty('display', 'none', 'important');
    }
  } catch (e) {
    console.error('toggleCustomerDropdown error:', e);
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
      const hasCustom = customPrice !== undefined;
      return `
        <div class="price-list-item">
          <div class="price-info">
            <div class="price-name">${m.name}</div>
            <div class="price-category">${m.category || 'Makanan'}</div>
            <div style="font-size:0.8rem; color:#6b7280; margin-top:2px;">Harga Default: ${rupiah(m.price)}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            <div style="font-size:0.8rem; color:${hasCustom ? '#16a34a' : '#9ca3af'};">${hasCustom ? rupiah(customPrice) : 'Belum diatur'}</div>
            <button class="btn-danger" style="padding:6px 10px; font-size:0.8rem;" onclick="event.stopPropagation(); editMenuPrice('${m.id}', '${customerId}', ${m.price}, ${hasCustom ? customPrice : 0})">Edit</button>
          </div>
        </div>
      `;
    }).join('');
};

// Edit harga menu untuk pelanggan tertentu — buka popup form
window.editMenuPrice = (menuId, customerId, defaultPrice, currentCustomPrice) => {
  editingPriceMenuId = menuId;
  editingPriceCustomerId = customerId;
  const input = document.getElementById('edit-price-input');
  input.placeholder = `Harga default: ${rupiah(defaultPrice)}`;
  
  // Tampilkan label Harga Langganan
  const langgananLabel = document.getElementById('edit-price-langganan-label');
  if (langgananLabel) {
    if (currentCustomPrice) {
      langgananLabel.textContent = `Harga Langganan saat ini: ${rupiah(currentCustomPrice)}`;
      langgananLabel.style.color = '#16a34a';
    } else {
      langgananLabel.textContent = 'Harga Langganan saat ini: Belum diatur';
      langgananLabel.style.color = '#9ca3af';
    }
  }
  
  // Simpan nilai asli dan kosongkan field sebelum popup ditampilkan
  focusRupiahInput(input);
  document.getElementById('edit-price-popup').style.display = 'flex';
  document.getElementById('popup-backdrop').style.display = 'block';

  history.pushState({ editPricePopup: true }, '');

  // Focus setelah popup ditampilkan
  setTimeout(() => {
    input.focus();
    adjustPopupPosition();
  }, 100);
};
window.openEditPrice = (cartId, currentPrice) => {
  editingCartId = cartId;
  const input = document.getElementById('edit-price-input');
  input.placeholder = `Harga saat ini: ${rupiah(currentPrice)}`;
  
  // Sembunyikan label Harga Langganan saat edit dari keranjang
  const langgananLabel = document.getElementById('edit-price-langganan-label');
  if (langgananLabel) {
    langgananLabel.textContent = '';
  }
  
  // Simpan nilai asli dan kosongkan field sebelum popup ditampilkan
  focusRupiahInput(input);
  document.getElementById('edit-price-popup').style.display = 'flex';
  document.getElementById('popup-backdrop').style.display = 'block';

  // Push state agar tombol back HP bisa menutup popup
  history.pushState({ editPricePopup: true }, '');

  // Focus setelah popup ditampilkan (keyboard muncul di HP)
  setTimeout(() => {
    input.focus();
    adjustPopupPosition();
  }, 100);
};

// ================= DELIVERY APP MANAGEMENT =================

// Generate ID pelanggan otomatis untuk mode Online: WM01, WM02, WM03...
// HANYA membaca dari koleksi onlineCustomers, TIDAK membaca dari customers (Offline)
window.generateCustomerId = async () => {
  const snap = await getDocs(collection(db, "onlineCustomers"));
  let maxNum = 0;
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.customerId) {
      const match = data.customerId.match(/^WM(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });
  nextCustomerNumber = maxNum + 1;
  const num = String(nextCustomerNumber).padStart(2, '0');
  console.log('generateCustomerId (Online): maxNum=', maxNum, 'nextCustomerNumber=', nextCustomerNumber, 'result=WM' + num);
  return `WM${num}`;
};

// Render daftar delivery app di tab aplikasi (bottom bar)
function renderDeliveryAppList() {
  const el = document.getElementById('delivery-app-list');
  if (!el) return;
  if (deliveryApps.length === 0) {
    el.innerHTML = `<p style="color:#9ca3af; font-size:0.85rem;">Belum ada aplikasi delivery. Tambahkan di bawah.</p>`;
    return;
  }
  el.innerHTML = deliveryApps.map(a => `
    <div class="customer-list-item">
      <div>
        <strong>${a.name}</strong>
        <div style="font-size:0.75rem; color:#6b7280;">${a.type || 'Delivery'}</div>
      </div>
      <button class="customer-delete-btn" onclick="hapusDeliveryApp('${a.id}')">Hapus</button>
    </div>
  `).join('');
}

// Tambah delivery app baru
window.tambahDeliveryApp = async () => {
  const name = document.getElementById('new-delivery-app-name').value.trim();
  const type = document.getElementById('new-delivery-app-type').value || 'Delivery';
  if (!name) return alert("Masukkan nama aplikasi delivery!");
  
  // Cek duplikasi nama
  if (deliveryApps.find(a => a.name.toLowerCase() === name.toLowerCase())) {
    return alert("Aplikasi delivery sudah terdaftar!");
  }
  
  await addDoc(collection(db, "deliveryApps"), { name, type, createdAt: new Date().getTime() });
  document.getElementById('new-delivery-app-name').value = "";
  document.getElementById('new-delivery-app-type').value = "";
  alert("Aplikasi delivery berhasil ditambahkan!");
};

// Hapus delivery app
window.hapusDeliveryApp = async (id) => {
  if (confirm("Hapus aplikasi delivery ini?")) {
    await deleteDoc(doc(db, "deliveryApps", id));
  }
};

// Render dropdown delivery app untuk kasir online
function renderDeliveryAppDropdown() {
  const el = document.getElementById('online-delivery-app');
  if (!el) return;
  const currentValue = el.value;
  if (deliveryApps.length === 0) {
    el.innerHTML = `<option value="">-- Belum ada aplikasi delivery --</option>`;
    el.value = '';
    return;
  }
  el.innerHTML = '<option value="">-- Pilih Aplikasi Delivery --</option>' +
    deliveryApps.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
  // Restore previous selection if still available
  if (deliveryApps.find(a => a.name === currentValue)) {
    el.value = currentValue;
  }
}

// Render select delivery app di tab aplikasi (untuk referensi)
window.renderDeliveryAppSelect = () => {
  // Not needed separately, dropdown is rendered in kasir tab
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
  const input = document.getElementById('edit-price-input');
  if (input) {
    input.blur();
    input.value = '';
    delete input.dataset.originalValue;
  }

  // Reset label Harga Langganan
  const langgananLabel = document.getElementById('edit-price-langganan-label');
  if (langgananLabel) {
    langgananLabel.textContent = '';
  }

  document.getElementById('edit-price-popup').style.display = 'none';
  document.getElementById('popup-backdrop').style.display = 'none';
  editingCartId = null;
  editingPriceMenuId = null;
  editingPriceCustomerId = null;

  // Hapus state yang di-push saat popup dibuka (tanpa navigasi)
  if (history.state && history.state.editPricePopup) {
    history.replaceState(null, '');
  }
};
window.simpanEditHarga = async () => {
  const input = document.getElementById('edit-price-input');
  const newPrice = input ? window.parseRupiahInput(input.value) : null;
  
  if (!newPrice || newPrice <= 0) {
    return alert("Masukkan harga yang valid!");
  }

  // Jika editing dari tab Harga (menu price untuk pelanggan)
  if (editingPriceMenuId && editingPriceCustomerId) {
    const existing = customerPrices.find(p => p.customerId === editingPriceCustomerId && p.menuId === editingPriceMenuId);
    if (existing) {
      await addDoc(collection(db, "customerPrices"), { customerId: editingPriceCustomerId, menuId: editingPriceMenuId, price: newPrice, updatedAt: new Date().getTime() });
      await deleteDoc(doc(db, "customerPrices", existing.id));
    } else {
      await addDoc(collection(db, "customerPrices"), { customerId: editingPriceCustomerId, menuId: editingPriceMenuId, price: newPrice, createdAt: new Date().getTime() });
    }
    alert("Harga langganan berhasil disimpan!");
    renderPriceList();
    renderMenus();
    closeEditPrice();
    return;
  }

  // 1. Update item di cart (editing dari keranjang kasir)
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


// Inisialisasi saat halaman pertama kali dimuat
document.addEventListener('DOMContentLoaded', async () => {
  // Inisialisasi nextCustomerNumber dari customers collection (Offline ONLY)
  try {
    const snap = await getDocs(collection(db, "customers"));
    let maxNum = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.customerId) {
        const match = data.customerId.match(/^WM(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    });
    nextCustomerNumber = maxNum + 1;
    console.log('nextCustomerNumber (Offline) diinisialisasi:', nextCustomerNumber);
  } catch (e) {
    console.error('Gagal inisialisasi nextCustomerNumber:', e);
  }

  const offlineBtn = document.querySelector('.channel-btn');
  if (offlineBtn) {
    setChannelView('Offline', offlineBtn);
  }
});
