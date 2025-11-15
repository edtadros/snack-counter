# Snack Counter

A fun, mobile-optimized snack counter app with flying pigs and deletion capabilities!

## Features

- **Cartoonish Pig**: Main pig that changes width based on the current snack count (grows wider with more snacks, shrinks when count decreases)
- **Flying Pig**: A tiny pig that bounces around randomly on the screen
- **Square Increment Button**: Large square green button to add snacks
- **Activity Log**: Shows timestamp and count for each snack increment
- **Delete Functionality**: Red X buttons next to each log entry to remove mistaken increments
- **Dark Mode Toggle**: 🌙/☀️ button to switch between light and dark themes
- **Mobile Optimized**: Touch-friendly interface designed for phones
- **Local Network Access**: Accessible from multiple devices on the same network
- **Real-time Sync**: Updates automatically across all connected devices
- **Persistent Settings**: Dark mode preference saved locally
- **Rate Limiting**: Global 20-second cooldown prevents spam - button disables for ALL users when pressed
- **Data Persistence**: Automatic saving to JSON with backup system - survives server restarts and software updates
- **Access Control**: Password-protected access with cookie-based authentication - only authorized users can access

## Recent Updates

- Changed all fonts to Noto Sans
- Made the increment button square instead of round
- Added a tiny flying pig that bounces around randomly
- Added delete buttons (×) next to each snack log entry
- **NEW**: Pig now shrinks when snacks are deleted (size based on current count)
- **NEW**: Added dark mode toggle with persistent theme switching
- **NEW**: Pig only grows horizontally (wider, same height) and starts narrower
- **NEW**: Increased padding around viewport for better mobile experience
- **NEW**: Enhanced data persistence with atomic writes, backups, and integrity checks
- **NEW**: Graceful shutdown handling to ensure data is saved
- Changed name to "Johnny J Snack Counter"
- Improved centering and mobile responsiveness

## How to Run

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Access the app:
   - **Local**: http://localhost:3000
   - **Network**: http://YOUR_LOCAL_IP:3000 (find your IP with `ifconfig | grep inet`)

## Usage

- Tap the large square "+" button to increment the snack counter
- Watch the main pig change width based on the current snack count (grows wider with more snacks, shrinks when count decreases)
- Enjoy the flying pig bouncing around the screen
- Toggle between light 🌙 and dark ☀️ modes using the button in the top-right
- View the snack log at the bottom
- Delete any mistaken entries by tapping the red × button next to them
- **Security**: Log out anytime using the 🚪 button in the top-right

## Technical Details

- **Backend**: Node.js with Express
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Fonts**: Noto Sans from Google Fonts
- **Data Storage**: JSON file persistence
- **Network**: Accessible on local network via 0.0.0.0 binding
- **Mobile**: Responsive design with touch events

## Data Persistence

Your snack data is automatically saved and will survive:
- Server restarts
- Software updates
- System crashes

**Files:**
- `counter-data.json` - Primary data file
- `counter-data.json.backup` - Automatic backup
- `counter-data.json.tmp` - Temporary file during writes

**Backup & Restore:**
- Data is automatically backed up to `counter-data.json.backup`
- API endpoints available for programmatic backup/restore if needed

## Security & Access Control

**Password Protection:**
- Set the `ACCESS_PASSWORD` environment variable on your server
- Users must enter the correct password to access the counter
- Default password: `snacks2025` (change this!)

**Access Methods:**
1. **Direct URL**: `https://your-app.render.com/?access=YOUR_PASSWORD`
2. **Login Form**: Visit the URL and enter password when prompted
3. **Cookie Authentication**: Stays logged in for 24 hours

**Environment Variables:**
- `ACCESS_PASSWORD`: Set your custom access code
- `NODE_ENV`: Set to `production` for deployment

**Security Features:**
- HTTP-only cookies prevent XSS attacks
- Password is never stored in client-side code
- All routes protected except API endpoints
- Automatic logout after 24 hours

## API Endpoints

- `GET /api/counter` - Get current counter data
- `POST /api/increment` - Increment the counter
- `DELETE /api/log/:id` - Delete a specific log entry
- `GET /api/button-state` - Get rate limiting status
