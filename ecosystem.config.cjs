/**
 * PM2 process file for BudgetBrain APIs on EC2.
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs --update-env
 */
const cwd = __dirname;
const sharedEnv = {
  NODE_ENV: 'production',
};

module.exports = {
  apps: [
    {
      name: 'budgetbrain-mobile',
      cwd,
      script: 'dist/mobile/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...sharedEnv,
        PORT: process.env.PORT_MOBILE || 3001,
      },
      max_memory_restart: '400M',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      exp_backoff_restart_delay: 200,
      max_restarts: 20,
      min_uptime: '10s',
    },
    {
      name: 'budgetbrain-web',
      cwd,
      script: 'dist/web/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...sharedEnv,
        PORT: process.env.PORT_WEB || 3002,
      },
      max_memory_restart: '400M',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      exp_backoff_restart_delay: 200,
      max_restarts: 20,
      min_uptime: '10s',
    },
    {
      name: 'budgetbrain-admin',
      cwd,
      script: 'dist/admin/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...sharedEnv,
        PORT: process.env.PORT_ADMIN || 3003,
      },
      max_memory_restart: '400M',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      exp_backoff_restart_delay: 200,
      max_restarts: 20,
      min_uptime: '10s',
    },
  ],
};
