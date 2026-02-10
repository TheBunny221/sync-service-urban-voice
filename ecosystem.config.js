module.exports = {
    apps: [{
        name: 'sync-service',
        script: 'src/index.js',
        instances: 1,
        exec_mode: 'fork',
        env: {
            NODE_ENV: 'production',
            IS_DEVELOPMENT: 'false'
        },
        env_development: {
            NODE_ENV: 'development',
            IS_DEVELOPMENT: 'true'
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        // Restart on cron schedule if needed (optional)
        // cron_restart: '0 3 * * *', // Restart at 3 AM daily
        // Time to wait before force killing the app on restart
        kill_timeout: 5000,
        // Wait for app to be ready before considering it online
        listen_timeout: 10000,
        // Environment-specific settings
        node_args: '--max-old-space-size=1024'
    }]
};
