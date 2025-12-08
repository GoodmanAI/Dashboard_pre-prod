/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    AZURE_STORAGE_CONNECTION_STRING: process.env.NEXTAZURE_STRING,
  },
};

module.exports = nextConfig;