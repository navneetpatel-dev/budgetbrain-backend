module.exports = {
  apps: [
    {
      name: "expenseflow-api",
      cwd: __dirname,
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      env_staging: {
        NODE_ENV: "staging",
      },
      env_test: {
        NODE_ENV: "test",
      },
    },
  ],
};
