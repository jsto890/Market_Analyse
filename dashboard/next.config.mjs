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
    ];
  },
};
export default nextConfig;
