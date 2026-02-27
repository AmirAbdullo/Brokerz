# BrokerZ

Real estate site: rent and buy properties. Two portals — **Client** and **Broker** — with real sign up and sign in (server + database).

## Run the app

1. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open in browser**: [http://localhost:3000](http://localhost:3000)

- **Home**: http://localhost:3000  
- **Login / Sign up**: http://localhost:3000/login  

---

## Share with others (public link)

To get a **real link** so anyone on the internet can open BrokerZ:

### Option A: Quick tunnel (no signup)

1. **Terminal 1** — start the server:
   ```bash
   npm start
   ```

2. **Terminal 2** — create a public tunnel:
   ```bash
   npm run tunnel
   ```

   You’ll see a line like: **Your url is: https://something-random.loca.lt**  
   Share that URL. The first time someone opens it they may need to click “Click to continue” (localtunnel security page).

   **Note:** The URL changes each time you run `npm run tunnel`. Your computer must stay on and the server + tunnel must keep running for the link to work.

### Option B: ngrok (stable HTTPS, free signup)

1. Sign up at [ngrok.com](https://ngrok.com) and install ngrok.
2. Run your server: `npm start`
3. In another terminal: `ngrok http 3000`
4. Share the **https** link ngrok shows (e.g. `https://abc123.ngrok-free.app`).

### Option C: Custom name / always-on

For a **fixed name** (e.g. brokerz.yourname.com) or **24/7** link without keeping your PC on, deploy to a host:

- **[Render](https://render.com)** — free tier, deploy from GitHub.
- **[Railway](https://railway.app)** — free tier, easy deploy.

Then you can add a custom domain in the host’s dashboard.

---

## Backend

- **Node.js + Express** — API and static files
- **SQLite** — `brokerz.db` (created automatically)
- **JWT** — auth token stored in browser after login/signup
- **bcrypt** — hashed passwords

### API

- `POST /api/signup` — body: `firstName`, `lastName`, `email`, `password`, `confirmPassword`, `portal` (`"client"` or `"broker"`)
- `POST /api/login` — body: `email`, `password`, `portal`
- `GET /api/me` — optional; requires `Authorization: Bearer <token>`
