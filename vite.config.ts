import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves the app from /mra_returns/.
export default defineConfig({
  base: '/mra_returns/',
  plugins: [react(), tailwindcss()],
  // Each app of the payroll system has its own fixed local port, and refuses
  // to start on any other (strictPort), so two apps started together never
  // take each other's port. The five ports:
  //   5173  PDF form filler   5174  Payroll   5175  Payslip
  //   5176  Payroll Hub dashboard   5177  MRA Returns (this app)
  server: {
    port: 5177,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
})
