/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Server-internal API URL for any RSC fetches that need to bypass localhost.
  env: {
    API_URL_INTERNAL: process.env.API_URL_INTERNAL || 'http://localhost:8000',
  },
};

module.exports = nextConfig;