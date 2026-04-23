/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: {
    buildActivityPosition: "bottom-right",
  },
  experimental: {
    // 更积极地拆分 vendor chunks，减少单个 chunk 损坏影响范围
    optimizePackageImports: ["axios"],
  },
};

export default nextConfig;
