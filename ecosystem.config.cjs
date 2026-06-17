const sharedEnv = {
  PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
};

module.exports = {
  apps: [
    {
      name: "budgetbrain-api",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
        ...sharedEnv,
      },
      env_production: {
        NODE_ENV: "production",
        ...sharedEnv,
      },
      env_staging: {
        NODE_ENV: "staging",
        ...sharedEnv,
      },
      env_test: {
        NODE_ENV: "test",
        ...sharedEnv,
      },
    },
  ],
};
