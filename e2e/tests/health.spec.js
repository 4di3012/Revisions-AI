const { test, expect } = require('@playwright/test')

test('backend health check returns ok', async ({ request }) => {
  const response = await request.get('http://localhost:3001/health')
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.status).toBe('ok')
})
