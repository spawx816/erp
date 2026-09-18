const assert = require('assert');
const { idempotencyMiddleware, _store } = require('../src/middlewares/idempotency');

async function runIdempotencyTests() {
  console.log('--- STARTING IDEMPOTENCY MIDDLEWARE TESTS ---');
  _store.clear();

  // Test 1: Non-mutating methods (GET) bypass idempotency
  let nextCalled = false;
  const getReq = { method: 'GET', headers: { 'idempotency-key': 'test-123' }, path: '/api/v1/sales' };
  const getRes = {};
  idempotencyMiddleware()(getReq, getRes, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'GET request should bypass idempotency check');
  console.log('✓ Test 1: GET requests bypass idempotency successfully');

  // Test 2: POST request without idempotency header passes through
  nextCalled = false;
  const postWithoutHeaderReq = { method: 'POST', headers: {}, path: '/api/v1/sales/checkout' };
  idempotencyMiddleware()(postWithoutHeaderReq, {}, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'POST request without idempotency header should pass through');
  console.log('✓ Test 2: Requests without idempotency header pass through');

  // Test 3: First POST request processes and caches response
  let executionCount = 0;
  const middleware = idempotencyMiddleware({ ttlMs: 10000 });

  function mockHandler(req, res) {
    executionCount++;
    return res.status(200).json({ success: true, orderId: 999, count: executionCount });
  }

  function createMockRes() {
    const headers = {};
    const res = {
      statusCode: 200,
      headers,
      setHeader(k, v) { headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      on(evt, cb) { /* event listener mock */ },
      json(body) {
        this.body = body;
        return this;
      }
    };
    return res;
  }

  const req1 = {
    method: 'POST',
    originalUrl: '/api/v1/sales/checkout',
    path: '/checkout',
    headers: { 'idempotency-key': 'txn-alpha-123' },
    user: { company_id: 'comp_001' }
  };
  const res1 = createMockRes();

  middleware(req1, res1, () => {
    mockHandler(req1, res1);
  });

  assert.strictEqual(executionCount, 1, 'Handler should execute on first request');
  assert.strictEqual(res1.body.orderId, 999);
  console.log('✓ Test 3: First request executed and cached response');

  // Test 4: Second POST request with identical idempotency-key returns cached result without running handler
  const req2 = {
    method: 'POST',
    originalUrl: '/api/v1/sales/checkout',
    path: '/checkout',
    headers: { 'idempotency-key': 'txn-alpha-123' },
    user: { company_id: 'comp_001' }
  };
  const res2 = createMockRes();

  middleware(req2, res2, () => {
    mockHandler(req2, res2);
  });

  assert.strictEqual(executionCount, 1, 'Handler should NOT execute on duplicate request');
  assert.strictEqual(res2.headers['Idempotent-Replayed'], 'true', 'Response should have Idempotent-Replayed header');
  assert.strictEqual(res2.body.orderId, 999, 'Response body should match original response');
  assert.strictEqual(res2.body.count, 1, 'Count should still be 1 from first run');
  console.log('✓ Test 4: Replayed request returned cached body with Idempotent-Replayed header');

  // Test 5: Same key in different company creates separate isolated idempotency namespace
  const reqDiffCompany = {
    method: 'POST',
    originalUrl: '/api/v1/sales/checkout',
    path: '/checkout',
    headers: { 'idempotency-key': 'txn-alpha-123' },
    user: { company_id: 'comp_002' }
  };
  const resDiffCompany = createMockRes();

  middleware(reqDiffCompany, resDiffCompany, () => {
    mockHandler(reqDiffCompany, resDiffCompany);
  });

  assert.strictEqual(executionCount, 2, 'Different company should be isolated and execute independently');
  assert.strictEqual(resDiffCompany.body.count, 2);
  console.log('✓ Test 5: Multi-tenant company isolation verified');

  console.log('\nALL IDEMPOTENCY TESTS PASSED! [5/5]\n');
}

runIdempotencyTests().catch(err => {
  console.error('Idempotency test failure:', err);
  process.exit(1);
});
