/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — see design.md §3. Dropping this line is the deliberate
  // gate to server-mode features (API routes, middleware, image optimization).
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
