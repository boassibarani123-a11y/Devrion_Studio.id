// Extends app.json. WEB_BASE_URL is only set when exporting the static web app
// (served by the backend under /api/app), so the dev preview stays at "/".
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.WEB_BASE_URL ? { baseUrl: process.env.WEB_BASE_URL } : {}),
  },
});
