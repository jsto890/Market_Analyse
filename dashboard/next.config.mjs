/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
  async redirects() {
    return [
      { source: "/action/:ticker", destination: "/t/:ticker", permanent: true },
      { source: "/agents", destination: "/", permanent: true },
      { source: "/accounts", destination: "/", permanent: true },
      { source: "/glossary", destination: "/learn/glossary", permanent: true },
      { source: "/sources", destination: "/learn/data", permanent: true },
      { source: "/options/learn", destination: "/learn/options", permanent: true },
    ];
  },
};
export default nextConfig;
