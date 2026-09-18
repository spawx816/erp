const assert = require('assert');
const jwt = require('jsonwebtoken');
const authController = require('../src/modules/auth/authController');

const JWT_SECRET = process.env.JWT_SECRET || 'nexus-erp-secure-secret-key-dominican-republic-2025';

async function runRefreshTokenTests() {
  console.log('--- STARTING REFRESH TOKEN TESTS ---');

  // Test 1: Active user generates new valid JWT token with user context
  const mockUser = {
    id: 'usr_test_123',
    username: 'cajero1',
    company_id: 'comp_test',
    role_id: 'role_cashier',
    status: 'active',
    token_version: 1
  };

  const reqSuccess = { user: mockUser };
  let resStatus = 200;
  let resPayload = null;

  const mockResSuccess = {
    status(code) { resStatus = code; return this; },
    json(body) { resPayload = body; return this; }
  };

  await authController.refresh(reqSuccess, mockResSuccess);

  assert.strictEqual(resStatus, 200, 'Refresh should return HTTP 200 for active user');
  assert.strictEqual(resPayload.success, true);
  assert.ok(resPayload.token, 'Should return a new JWT token string');

  // Verify the generated token
  const decoded = jwt.verify(resPayload.token, JWT_SECRET);
  assert.strictEqual(decoded.userId, mockUser.id);
  assert.strictEqual(decoded.companyId, mockUser.company_id);
  assert.strictEqual(decoded.tokenVersion, 1);
  console.log('✓ Test 1: Valid active user receives new signed JWT successfully');

  // Test 2: Inactive or suspended user is rejected with 401
  const mockInactiveUser = {
    id: 'usr_inactive_456',
    status: 'inactive'
  };

  const reqInactive = { user: mockInactiveUser };
  let inactiveStatus = 200;
  let inactivePayload = null;

  const mockResInactive = {
    status(code) { inactiveStatus = code; return this; },
    json(body) { inactivePayload = body; return this; }
  };

  await authController.refresh(reqInactive, mockResInactive);

  assert.strictEqual(inactiveStatus, 401, 'Refresh should return 401 for inactive user');
  assert.strictEqual(inactivePayload.success, false);
  console.log('✓ Test 2: Inactive user rejected with HTTP 401');

  // Test 3: Missing user is rejected with 401
  const reqNoUser = { user: null };
  let noUserStatus = 200;

  await authController.refresh(reqNoUser, {
    status(code) { noUserStatus = code; return this; },
    json() { return this; }
  });

  assert.strictEqual(noUserStatus, 401, 'Missing user rejected with HTTP 401');
  console.log('✓ Test 3: Unauthenticated request rejected with HTTP 401');

  console.log('\nALL REFRESH TOKEN TESTS PASSED! [3/3]\n');
}

runRefreshTokenTests().catch(err => {
  console.error('Refresh token test failure:', err);
  process.exit(1);
});
