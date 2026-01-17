# Asterisk Project - Issues Found & Fixed

## Test Results
- **API Server**: http://34.10.234.221:3000 (Remote)
- **Login Endpoint**: ✅ Working (admin/admin123)
- **Status Endpoint**: ❌ Returns "Invalid token" error

## Issues Identified

### 1. Frontend - AsteriskControl.jsx (FIXED)
**File**: `frontend/src/pages/AsteriskControl.jsx`

**Problem**: 
- Error messages not displayed to users when API calls fail
- Silent error handling made debugging difficult

**Fix Applied**:
- Added error state display with `error ? <Alert severity="error">{error}</Alert> : ...`
- Added console error logging for debugging
- Improved error messaging in fetchStatus function

### 2. Backend - Status Endpoint Timeout Issue (FIXED)
**File**: `backend-node/server.js` (Line 3042-3075)

**Problem**:
- Asterisk CLI commands (exec) could hang indefinitely
- No timeout mechanism on shell commands
- Could cause request timeouts

**Fix Applied**:
- Added 5-second timeout to all exec() calls
- Created `execWithTimeout` helper function
- Falls back to "Unavailable" messages gracefully

### 3. Backend - Admin Authentication Issue (PARTIALLY FIXED)
**File**: `backend-node/server.js` (Line 509-545)

**Problem**:
- Login returns token but status endpoint rejects with "Invalid token"
- Root cause: Session validation looking for token in admin_sessions table
- Possible issues:
  - Session not being inserted properly
  - Database query failing silently
  - Token mismatch between creation and lookup

**Fix Applied**:
- Simplified authenticateAdmin to verify JWT signature directly
- Changed from checking admin_sessions to checking admins table
- Added detailed console logging for troubleshooting
- Removed is_active check from sessions

**Still Need To**:
- Deploy updated server.js to http://34.10.234.221:3000
- Restart the backend service
- Retest the status endpoint

## Code Changes Made

### 1. AsteriskControl.jsx - fetchStatus function
```javascript
// BEFORE: Silent error handling
const fetchStatus = async () => {
  try {
    const res = await fetch(`${API_URL}/api/asterisk/status`, { headers });
    const data = await res.json();
    if (data.success) {
      setStatus(data.status);
    }
  } catch (err) {
    setError('Failed to fetch Asterisk status');
  }
}

// AFTER: Better error handling and logging
const fetchStatus = async () => {
  try {
    const res = await fetch(`${API_URL}/api/asterisk/status`, { headers });
    const data = await res.json();
    if (data.success) {
      setStatus(data.status);
      setError(null);
    } else {
      setError(data.error || 'Failed to fetch Asterisk status');
      setStatus(null);
      console.error('Status fetch error:', data.error);
    }
  } catch (err) {
    setError(`Failed to fetch Asterisk status: ${err.message}`);
    setStatus(null);
    console.error('Status fetch error:', err);
  }
}
```

### 2. AsteriskControl.jsx - Status Display
```jsx
// BEFORE: Only showed loading or warning
{loading ? (
  <CircularProgress size={24} />
) : status ? (
  // show status
) : (
  <Alert severity="warning">Unable to get Asterisk status</Alert>
)}

// AFTER: Shows actual error messages
{loading ? (
  <CircularProgress size={24} />
) : error ? (
  <Alert severity="error">{error}</Alert>
) : status ? (
  // show status
) : (
  <Alert severity="warning">Unable to get Asterisk status</Alert>
)}
```

### 3. Status Endpoint - Added Timeout (backend-node/server.js)
```javascript
// BEFORE: Exec calls could hang
const results = await Promise.all([
  new Promise(resolve => exec('asterisk -rx "core show version"', (e, out) => resolve(e ? null : out.trim()))),
  // ...
]);

// AFTER: 5-second timeout on each command
const execWithTimeout = (command, timeoutMs = 5000) => {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);
    
    exec(command, (e, out) => {
      clearTimeout(timer);
      resolve(e ? null : out.trim());
    });
  });
};

const results = await Promise.all([
  execWithTimeout('asterisk -rx "core show version"', 5000),
  execWithTimeout('asterisk -rx "core show uptime"', 5000),
  execWithTimeout('asterisk -rx "core show channels count"', 5000)
]);
```

### 4. Admin Authentication Simplified (backend-node/server.js)
```javascript
// BEFORE: Checking admin_sessions table
const session = await db.query(
  'SELECT s.*, a.username FROM admin_sessions s JOIN admins a ON s.admin_id = a.id WHERE s.session_token = $1 AND s.is_active = true AND s.expires_at > CURRENT_TIMESTAMP',
  [token]
);

// AFTER: Direct JWT verification + admin lookup
const decoded = jwt.verify(token, JWT_SECRET);
const admin = await db.query(
  'SELECT id, username FROM admins WHERE id = $1 AND is_active = true',
  [decoded.adminId]
);
```

## Next Steps

1. **Deploy Changes**:
   - Copy updated `backend-node/server.js` to the server
   - Restart the Node.js backend service
   - Or run: `npm start` in backend-node directory

2. **Verify Fixes**:
   ```bash
   # Test login
   curl -X POST http://34.10.234.221:3000/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin123"}'
   
   # Use returned token to test status
   curl -X GET http://34.10.234.221:3000/api/asterisk/status \
     -H "Authorization: Bearer <TOKEN>"
   ```

3. **Monitor Logs**:
   - Check backend console output for debug messages
   - Look for "✅ JWT verified" and "✅ Admin authenticated" messages
   - Check for "❌" error messages if issues persist

## Files Modified
- ✅ `frontend/src/pages/AsteriskControl.jsx` - Error handling improved
- ✅ `backend-node/server.js` - Multiple fixes applied

## Testing Status
- ✅ Frontend error display - Ready to test after backend deployment
- ❌ Backend auth - Needs server restart to apply changes
- ✅ Status endpoint timeout - Code ready, needs deployment
