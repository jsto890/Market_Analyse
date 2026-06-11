/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
  async redirects() {
    return [
      { source: "/action/:ticker", destination: "/t/:ticker", permanent: true },
      { source: "/options/:ticker", destination: "/t/:ticker", permanent: true },
      { source: "/options", destination: "/", permanent: true },
      { source: "/agents", destination: "/", permanent: true },
      { source: "/accounts", destination: "/sources", permanent: true },
    ];
  },
};
export default nextConfig;
