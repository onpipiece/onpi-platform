# ONPI Platform — backend

Scurt: backend minimal pentru aplicația ONPI. Suportă stocare pe Supabase și un fallback local (`data.json`). Pregătit pentru deploy pe Railway.

Prerechizite
- Node 16+ / npm
- Cont Railway (sau alt provider) și opțional Supabase / MongoDB

Variabile de mediu (completează în Railway / `.env`)
- `PORT` — portul aplicației (ex: `3000`)
- `NODE_ENV` — `production`/`development`
- `APP_URL` — URL-ul public al aplicației (ex: `https://myapp.railway.app`)
- Supabase (opțional): `SUPABASE_URL`, `SUPABASE_KEY`
- Mongo (opțional): `MONGO_URI`
- SMTP (opțional, pentru resetare parola): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`
- Exemplu `MONGO_URI` (înlocuiește `<db_password>`):
- `mongodb+srv://onpipiece_db_user:<db_password>@cluster0.kwv1wa7.mongodb.net/?appName=Cluster0`
- `DEBUG_PASSWORD_RESET` — `1` pentru return token în răspuns în dev

Rulare local
```bash
npm install
cp .env.example .env   # editează .env cu valorile tale
npm run dev            # folosind nodemon (dev)
# sau
npm start
```

Deploy pe Railway (simplu)
1. Creează repository GitHub și împinge proiectul.
2. În Railway, click "New Project" → "Deploy from GitHub" → alege repo și branch.
3. În Railway → Settings → Environment, adaugă variabilele de mediu listate mai sus (folosește valorile tale Supabase/Mongo/SMTP).
4. Railway va detecta `Procfile` (există `web: node server.js`) și va rula aplicația.

Opțiune Docker (Railway acceptă și Docker): am adăugat fișier `Dockerfile` în repo; poți alege modul Docker la deploy.

Supabase — tabel minim recomandat
Crează un tabel `users` cu coloanele folosite de `server.js` (ex: `cont` text unique, `parola_hash` text, `nume` text, `email` text, `telegram` text, `telefon` text, `token` text, `purchased_packages` text, `active_package` text, `reset_token` text, `reset_expires` timestamptz).

MongoDB (opțional)
- Dacă preferi Mongo în loc de Supabase, setează `MONGO_URI` în Railway și instalează `mongoose` local:
```bash
npm install mongoose
```
- Pot integra `mongoose` în `server.js` la cerere (creez model `User` și înlocuiesc apelurile către Supabase/local `data.json`).

Note utile
- `data.json` este fallback local; nu-l comita (este ignorat în `.gitignore`).
- Pentru trimitere mail reală, completează setările SMTP în Railway.

Dacă vrei, pot:
- integra `mongoose` acum (convertesc persistența la Mongo)
- sau scriu un script de migrare între `data.json` și Supabase/Mongo
# ONPI Platform — Minimal Backend (demo)

Acest repo conține un scaffold minim de backend Express pentru dezvoltare locală.

Quick start:

```bash
cd onpi-platform
npm install
npm start
# apoi deschide http://localhost:3000 în browser
```

Endpoints principale:
- `GET /api/health` — verificare stare API
- `POST /api/register` — body: `{ cont, parola, nume, email, telegram, telefon }`
- `POST /api/login` — body: `{ cont, parola }`
- `GET /api/profile` — header `Authorization: Bearer <token>`

Datele sunt salvate simplu în `data.json` (demo). Pentru producție folosește o bază de date reală și autentificare securizată.

Supabase (recomandat)
--------------------

Poți folosi Supabase în loc de `data.json`. Pași rapizi:

1. Creează un proiect pe https://app.supabase.com
2. În `Table Editor` creează o tabelă `users` cu coloanele:
	- `id` (bigint / or default serial)
	- `cont` (text)
	- `parola` (text)
	- `nume` (text)
	- `email` (text)
	- `telegram` (text)
	- `telefon` (text)
	- `createdAt` (timestamp)
	- `token` (text)
	- `purchased_packages` (text)
	- `active_package` (text)

3. Copiază URL și anon/public key din `Settings → API` și adaugă în `.env` local:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

4. Instalează dependențele și rulează:

```bash
npm install
npm start
```

Serverul detectează automat Supabase și va folosi tabela `users`. Pentru producție folosește o cheie service_role numai pe backend și nu expune chei sensibile în browser.

Securitate parole
-----------------

Parolele sunt acum hash-uite pe server (bcrypt). Trimite parola simplă în `POST /api/register` și `POST /api/login` — serverul o va hasha și nu va stoca textul clar. Dacă migrezi din `data.json`, scriptul `migrate_to_supabase.js` va hasha orice câmp `parola` existent.
