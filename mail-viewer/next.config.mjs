/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    // Serve local static assets without external loader
    unoptimized: true,
  },
};
export default nextConfig;
