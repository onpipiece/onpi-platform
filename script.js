// script.js

const BOT_TOKEN = '7548290162:AAH0P6XOowBMHvKIggPT-pafIg6RDI3Qj-c';
const CHAT_ID   = '5470225717';

const packages = {
  '50':  7500000,
  '100': 15000000,
  '200': 30000000,
  '500': 60000000
};

let upgradeMode = false;

// Elemente DOM principale (adaugă-le pe toate)
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginPage = document.getElementById('loginPage');
const registerPage = document.getElementById('registerPage');
const dashboardPage = document.getElementById('dashboardPage');
const profilePage = document.getElementById('profilePage');
const packagesPage = document.getElementById('packagesPage');
const upgradePage = document.getElementById('upgradePage');
const purchasePage = document.getElementById('purchasePage');
const withdrawalPage = document.getElementById('withdrawalPage');
const instructionsPage = document.getElementById('instructionsPage');
const instructionsGeneralPage = document.getElementById('instructionsGeneralPage');
const stakePage = document.getElementById('stakePage');
const interestCalcPage = document.getElementById('interestCalcPage');
const status = document.getElementById('status');
const loginStatus = document.getElementById('loginStatus');
const dashboardStatus = document.getElementById('dashboardStatus');
const dashSold = document.getElementById('dashSold');
const dashSoldValue = document.getElementById('dashSoldValue');
const dashNume = document.getElementById('dashNume');
const dashCont = document.getElementById('dashCont');
const dashEmail = document.getElementById('dashEmail');
const dashTelegram = document.getElementById('dashTelegram');
const dashTelefon = document.getElementById('dashTelefon');
const dashWallet = document.getElementById('dashWallet');
const dashSoldPersonal = document.getElementById('dashSoldPersonal');
const dashPachete = document.getElementById('dashPachete');
const dashActivePackage = document.getElementById('dashActivePackage');
const personalWalletDisplay = document.getElementById('personalWalletDisplay');
const withdrawalBalance = document.getElementById('withdrawalBalance');
const withdrawalAmount = document.getElementById('withdrawalAmount');

// PREȚ LIVE SOLANA
async function getSolPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    return data.solana.usd || 150;
  } catch (err) {
    return 150;
  }
}

async function updateSolEquivalents() {
  const solPrice = await getSolPrice();
  ['50','100','200','500'].forEach(v => {
    const el = document.getElementById(`solEq\( {v}`) || document.getElementById(`solEqUp \){v}`);
    if (el) el.textContent = (v / solPrice).toFixed(4);
  });
}

// ACHIZIȚIE PACHET – 100% fictivă
async function buyPackage(value) {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('expanded'));

  const amount = parseInt(value);
  const tokens = packages[amount] || 0;
  if (tokens === 0) return alert('Pachet invalid!');

  const solPrice = await getSolPrice();
  const solEq = (amount / solPrice).toFixed(4);

  alert(
    `PRE-SALE ONPI – Pachet \( {amount} \)\n` +
    `≈ ${solEq} SOL (preț live)\n` +
    `Primești: ${tokens.toLocaleString('ro-RO')} ONPI\n\n` +
    `Achiziție simulată în pre-sale.\n` +
    `Soldul tău a fost actualizat. Plata reală se procesează manual după rundă.`
  );

  const loggedInUser = localStorage.getItem('loggedInUser');
  if (!loggedInUser) {
    alert('Trebuie să fii logat!');
    switchToLogin();
    return;
  }

  let userData = JSON.parse(localStorage.getItem(`user_${loggedInUser}`) || '{}');

  if (!userData.purchasedPackages) userData.purchasedPackages = [];

  const valStr = amount.toString();
  if (!userData.purchasedPackages.includes(valStr)) {
    userData.purchasedPackages.push(valStr);
  }

  userData.activePackage = valStr;
  userData.balance   = (userData.balance   || 0) + tokens;
  userData.purchases = (userData.purchases || 0) + 1;

  localStorage.setItem(`user_${loggedInUser}`, JSON.stringify(userData));

  updateDashboardDisplay();
  updateProfileDisplay();
  updatePackagesButtonState();

  if (upgradeMode) setTimeout(applyUpgradeRules, 100);

  alert(`Pachet adăugat!\n+ ${tokens.toLocaleString('ro-RO')} ONPI`);
}

// FUNCȚII UTILITARE
function showOnly(pageToShow) {
  [loginPage, registerPage, dashboardPage, profilePage, packagesPage, upgradePage, purchasePage, withdrawalPage, instructionsPage, instructionsGeneralPage, stakePage, interestCalcPage]
    .forEach(p => p?.classList.add('hidden'));
  pageToShow?.classList.remove('hidden');
}

function togglePassword(fieldId) {
  const field = document.getElementById(fieldId);
  const icon = field.nextElementSibling;
  if (field.type === 'password') {
    field.type = 'text';
    icon.textContent = '🙈';
  } else {
    field.type = 'password';
    icon.textContent = '👁';
  }
}

function switchToLogin() { showOnly(loginPage); }
function switchToRegister() { showOnly(registerPage); }
function switchToDashboard() {
  showOnly(dashboardPage);
  if (!priceChart) initChart();
  updateDashboardDisplay();
  updateProfileDisplay();
  updatePackagesButtonState();
}

function openProfile() { showOnly(profilePage); updateProfileDisplay(); }

function openPackages(fromUpgrade = false) {
  upgradeMode = fromUpgrade;
  showOnly(fromUpgrade ? upgradePage : packagesPage);
  
  const page = fromUpgrade ? upgradePage : packagesPage;
  page.querySelectorAll('.dropdown-wrapper').forEach(wrapper => wrapper.style.display = 'block');
  
  page.querySelectorAll('.btn-select').forEach(btn => {
    btn.textContent = fromUpgrade ? 'Upgrade' : 'Selectează';
    btn.disabled = false;
  });
  
  if (fromUpgrade) setTimeout(applyUpgradeRules, 100);
}

function openInstructions() { showOnly(instructionsGeneralPage); }

function goToWithdrawal() {
  showOnly(withdrawalPage);
  displayWithdrawalInfo();
}

function logout() {
  localStorage.removeItem('loggedInUser');
  showOnly(loginPage);
  alert('Ai fost deconectat!');
}

function updatePackagesButtonState() {
  const btn = document.getElementById('btnPackages');
  if (!btn) return;

  const loggedInUser = localStorage.getItem('loggedInUser');
  if (!loggedInUser) {
    btn.disabled = true;
    return;
  }

  const userData = JSON.parse(localStorage.getItem(`user_${loggedInUser}`) || '{}');
  const purchases = Number(userData.purchases || 0);

  btn.disabled = purchases > 0;
  btn.textContent = purchases > 0 ? '📦 Pachete (achiziționat)' : '📦 Pachete';
}

function updateDashboardDisplay() {
  const loggedInUser = localStorage.getItem('loggedInUser');
  if (!loggedInUser) return;

  const userData = JSON.parse(localStorage.getItem(`user_${loggedInUser}`) || '{}');
  const balance   = userData.balance   || 0;
  const purchases = userData.purchases || 0;

  dashSoldValue.textContent = balance.toLocaleString('ro-RO'); // valoare fictivă
  dashSold.textContent      = balance.toLocaleString('ro-RO');
  dashSoldPersonal.textContent = balance.toLocaleString('ro-RO');
  dashPachete.textContent   = purchases;

  updatePackagesButtonState();
}

function updateProfileDisplay() {
  const loggedInUser = localStorage.getItem('loggedInUser');
  if (!loggedInUser) return;

  const userData = JSON.parse(localStorage.getItem(`user_${loggedInUser}`) || '{}');

  dashNume.textContent     = userData.nume     || '—';
  dashCont.textContent     = loggedInUser      || '—';
  dashEmail.textContent    = userData.email    || '—';
  dashTelegram.textContent = userData.telegram || '—';
  dashTelefon.textContent  = userData.telefon  || '—';
  dashWallet.textContent   = userData.wallet   || '— (nu ai adăugat încă)';

  const active = userData.activePackage || '—';
  dashActivePackage.textContent = active === '—' ? '—' : active + '$';

  if (userData.dataInregistrare) {
    document.getElementById('dashDataInregistrare').textContent = 
      new Date(userData.dataInregistrare).toLocaleDateString('ro-RO');
  }

  updateDashboardDisplay();
}

function displayWithdrawalInfo() {
  const loggedInUser = localStorage.getItem('loggedInUser');
  if (!loggedInUser) {
    personalWalletDisplay.textContent = '— (nu ești logat)';
    withdrawalBalance.textContent = '0';
    document.getElementById('submitWithdrawalBtn').disabled = true;
    return;
  }

  const userData = JSON.parse(localStorage.getItem(`user_${loggedInUser}`) || '{}');
  const wallet = (userData.wallet || '').trim();
  const balance = userData.balance || 0;

  personalWalletDisplay.textContent = wallet || '— (nu ai adăugat wallet încă)';
  withdrawalBalance.textContent = balance.toLocaleString('ro-RO');
}

function submitWithdrawalRequest() {
  const amount = Number(withdrawalAmount.value.trim());

  const loggedInUser = localStorage.getItem('loggedInUser');
  if (!loggedInUser) return alert('Trebuie să fii logat!');

  const userData = JSON.parse(localStorage.getItem(`user_${loggedInUser}`) || '{}');
  const balance = userData.balance || 0;
  const wallet = (userData.wallet || '').trim();

  if (!wallet || wallet.includes('—')) {
    alert('Trebuie să ai o adresă wallet Solana înregistrată!');
    return;
  }

  if (isNaN(amount) || amount <= 0 || amount > balance) {
    alert('Sumă invalidă sau insuficientă!');
    return;
  }

  userData.balance = balance - amount;
  localStorage.setItem(`user_${loggedInUser}`, JSON.stringify(userData));

  updateDashboardDisplay();

  alert('Cerere de retragere trimisă – procesare maxim 12 ore.');

  const message = `CERERE RETRAGERE ONPI\nUtilizator: ${loggedInUser}\nSumă: ${amount} ONPI\nWallet: ${wallet}`;
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message })
  }).catch(err => console.error(err));

  withdrawalAmount.value = '';
  switchToDashboard();
}

// Adaugă aici și restul funcțiilor tale (stake, chart, changePassword, etc.)
// Pentru simplitate, pune-le exact cum le ai în codul original

// Încărcare inițială
window.addEventListener('load', async () => {
  const loggedInUser = localStorage.getItem('loggedInUser');
  if (loggedInUser) {
    showOnly(dashboardPage);
    updateDashboardDisplay();
    updateProfileDisplay();
    updatePackagesButtonState();
  } else {
    showOnly(loginPage);
  }
  await updateSolEquivalents();
});
